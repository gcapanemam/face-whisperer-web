import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Md5 } from "https://deno.land/std@0.160.0/hash/md5.ts";
import { encode as base64Encode } from "https://deno.land/std@0.160.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

class DigestAuth {
  private username: string;
  private password: string;
  private nc = 0;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  private md5(str: string): string {
    return new Md5().update(str).toString();
  }

  async request(url: string, method: string = "GET", body?: BodyInit, extraHeaders?: Record<string, string>): Promise<Response> {
    const firstResponse = await fetch(url, { method, redirect: "manual" });
    if (firstResponse.status !== 401) return firstResponse;

    const wwwAuth = firstResponse.headers.get("www-authenticate");
    if (!wwwAuth) throw new Error("No WWW-Authenticate header");

    const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
    const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
    const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "";

    this.nc++;
    const ncStr = this.nc.toString(16).padStart(8, "0");
    const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const uri = new URL(url).pathname + new URL(url).search;

    const ha1 = this.md5(`${this.username}:${realm}:${this.password}`);
    const ha2 = this.md5(`${method}:${uri}`);
    const response = qop
      ? this.md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop.split(",")[0]}:${ha2}`)
      : this.md5(`${ha1}:${nonce}:${ha2}`);

    const authHeader = `Digest username="${this.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"${
      qop ? `, qop=${qop.split(",")[0]}, nc=${ncStr}, cnonce="${cnonce}"` : ""
    }`;

    await firstResponse.text();
    return fetch(url, { method, headers: { Authorization: authHeader, ...(extraHeaders || {}) }, body });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const deviceUrl = (Deno.env.get("INTELBRAS_DEVICE_URL") || "").replace(/#.*$/, "").replace(/\/+$/, "");
    const username = Deno.env.get("INTELBRAS_USERNAME");
    const password = Deno.env.get("INTELBRAS_PASSWORD");

    if (!deviceUrl || !username || !password) {
      return new Response(JSON.stringify({ error: "Credenciais não configuradas" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, personId, photoUrl } = await req.json();
    const auth = new DigestAuth(username, password);

    if (action === "check") {
      // Check if a face exists for this UserID on the device
      const startUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=startFind&condition.UserID=${encodeURIComponent(personId)}`;
      const startResp = await auth.request(startUrl);
      const startText = await startResp.text();
      console.log(`check startFind: ${startText}`);

      let startData;
      try { startData = JSON.parse(startText); } catch { startData = null; }

      if (startData?.Total > 0) {
        // Get face info
        const doUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=doFind&Token=${startData.Token}&Offset=0&Count=10`;
        const doResp = await auth.request(doUrl);
        const doText = await doResp.text();
        console.log(`check doFind: ${doText.slice(0, 500)}`);

        let info = null;
        try { info = JSON.parse(doText); } catch {}
        
        try { await auth.request(`${deviceUrl}/cgi-bin/AccessFace.cgi?action=stopFind&Token=${startData.Token}`); } catch {}

        return new Response(JSON.stringify({ 
          success: true, 
          hasFace: true, 
          total: startData.Total,
          info: info?.Info || null,
          message: "Face cadastrada no dispositivo (o SS 3532 não permite download da imagem)"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (startData) {
        try { await auth.request(`${deviceUrl}/cgi-bin/AccessFace.cgi?action=stopFind&Token=${startData.Token}`); } catch {}
      }

      return new Response(JSON.stringify({ success: true, hasFace: false, message: "Nenhuma face cadastrada para este usuário" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "get") {
      // SS 3532 MF W does not support downloading face photos via API
      // We can only check if a face exists
      return new Response(JSON.stringify({ 
        error: "O modelo SS 3532 MF W não suporta download de fotos via API. Use a ação 'check' para verificar se a face está cadastrada.",
        suggestion: "check"
      }), {
        status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "set") {
      if (!personId || !photoUrl) {
        return new Response(JSON.stringify({ error: "personId e photoUrl são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Downloading photo: ${photoUrl}`);
      const optimizedPhotoUrl = (() => {
        try {
          const url = new URL(photoUrl);
          if (url.pathname.includes("/storage/v1/object/public/")) {
            url.pathname = url.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
            url.searchParams.set("width", "480");
            url.searchParams.set("height", "640");
            url.searchParams.set("resize", "contain");
            url.searchParams.set("quality", "70");
            url.searchParams.set("format", "origin");
            return url.toString();
          }
        } catch {
          // fallback to original URL below
        }
        return photoUrl;
      })();

      console.log(`Downloading optimized photo: ${optimizedPhotoUrl}`);
      const photoResp = await fetch(optimizedPhotoUrl);
      if (!photoResp.ok) {
        return new Response(JSON.stringify({ error: "Não foi possível baixar a foto" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const photoBytes = new Uint8Array(await photoResp.arrayBuffer());
      console.log(`Optimized photo size: ${photoBytes.length} bytes`);
      if (photoBytes.length > 200 * 1024) {
        return new Response(JSON.stringify({
          error: "A foto ainda está muito grande para o dispositivo após otimização",
          size: photoBytes.length,
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const photoBase64 = base64Encode(photoBytes).replace(/\s/g, "");

      const jsonBody = JSON.stringify({
        FaceList: [
          {
            UserID: personId,
            PhotoData: [photoBase64],
          },
        ],
      });

      const startUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=startFind&condition.UserID=${encodeURIComponent(personId)}`;
      const startResp = await auth.request(startUrl);
      const startText = await startResp.text();
      console.log(`set startFind: ${startText}`);

      let startData: { Total?: number; Token?: string } | null = null;
      try { startData = JSON.parse(startText); } catch {}

      const hasExistingFace = Boolean(startData?.Total && startData.Total > 0);
      if (startData?.Token) {
        try {
          await auth.request(`${deviceUrl}/cgi-bin/AccessFace.cgi?action=stopFind&Token=${startData.Token}`);
        } catch {
          // ignore cleanup errors
        }
      }

      const actionName = hasExistingFace ? "updateMulti" : "insertMulti";
      const actionUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=${actionName}`;

      console.log(`${actionName} (JSON): ${actionUrl}, body length: ${jsonBody.length}`);
      const jsonResp = await auth.request(actionUrl, "POST", jsonBody, {
        "Content-Type": "application/json",
      });
      const jsonText = await jsonResp.text();
      console.log(`${actionName} JSON response (${jsonResp.status}): ${jsonText.slice(0, 500)}`);

      if (jsonResp.ok && !jsonText.toLowerCase().includes("error") && !jsonText.toLowerCase().includes("batch process error")) {
        return new Response(JSON.stringify({
          success: true,
          message: hasExistingFace ? "Foto atualizada no dispositivo!" : "Foto enviada ao dispositivo!",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const formBody = new URLSearchParams();
      formBody.set("FaceList[0].UserID", personId);
      formBody.set("FaceList[0].PhotoData[0]", photoBase64);

      console.log(`${actionName} (form body): ${actionUrl}, body length: ${formBody.toString().length}`);
      const formResp = await auth.request(actionUrl, "POST", formBody.toString(), {
        "Content-Type": "application/x-www-form-urlencoded",
      });
      const formText = await formResp.text();
      console.log(`${actionName} form response (${formResp.status}): ${formText.slice(0, 500)}`);

      if (formResp.ok && !formText.toLowerCase().includes("error") && !formText.toLowerCase().includes("batch process error")) {
        return new Response(JSON.stringify({
          success: true,
          message: hasExistingFace ? "Foto atualizada no dispositivo!" : "Foto enviada ao dispositivo!",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        error: hasExistingFace ? "Erro ao atualizar foto" : "Erro ao enviar foto",
        raw: formText.slice(0, 300) || jsonText.slice(0, 300),
        jsonRaw: jsonText.slice(0, 300),
        faceExists: hasExistingFace,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "delete") {
      // Try query param format first, then JSON
      const url = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=removeMulti&UserIDList[0].UserID=${encodeURIComponent(personId)}`;
      console.log(`Deleting face: ${url}`);
      const resp = await auth.request(url);
      const text = await resp.text();
      console.log(`Delete response (${resp.status}): ${text.slice(0, 300)}`);

      return new Response(JSON.stringify({ success: resp.ok, message: resp.ok ? "Face removida do dispositivo" : text.slice(0, 200) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Ação inválida. Use: check, set, delete" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
