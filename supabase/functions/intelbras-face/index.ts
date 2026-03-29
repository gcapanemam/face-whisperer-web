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
  private savedRealm = "";
  private savedNonce = "";
  private savedQop = "";

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  private md5(str: string): string {
    return new Md5().update(str).toString();
  }

  private buildAuthHeader(method: string, uri: string, realm: string, nonce: string, qop: string): string {
    this.nc++;
    const ncStr = this.nc.toString(16).padStart(8, "0");
    const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const ha1 = this.md5(`${this.username}:${realm}:${this.password}`);
    const ha2 = this.md5(`${method}:${uri}`);
    const response = qop
      ? this.md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop.split(",")[0]}:${ha2}`)
      : this.md5(`${ha1}:${nonce}:${ha2}`);
    return `Digest username="${this.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"${
      qop ? `, qop=${qop.split(",")[0]}, nc=${ncStr}, cnonce="${cnonce}"` : ""
    }`;
  }

  async request(url: string, method: string = "GET", body?: BodyInit, extraHeaders?: Record<string, string>): Promise<Response> {
    const firstResponse = await fetch(url, { method, redirect: "manual" });
    if (firstResponse.status !== 401) return firstResponse;

    const wwwAuth = firstResponse.headers.get("www-authenticate");
    if (!wwwAuth) throw new Error("No WWW-Authenticate header");

    this.savedRealm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
    this.savedNonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
    this.savedQop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "";

    const uri = new URL(url).pathname + new URL(url).search;
    const authHeader = this.buildAuthHeader(method, uri, this.savedRealm, this.savedNonce, this.savedQop);

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

    if (action === "get") {
      // Step 1: startFind to get token
      const startUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=startFind&condition.UserID=${encodeURIComponent(personId)}`;
      console.log(`startFind: ${startUrl}`);
      const startResp = await auth.request(startUrl);
      const startText = await startResp.text();
      console.log(`startFind response: ${startText}`);

      if (!startResp.ok) {
        return new Response(JSON.stringify({ error: "Erro ao buscar face", raw: startText.slice(0, 300) }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let startData;
      try { startData = JSON.parse(startText); } catch { startData = null; }

      if (!startData || startData.Total === 0) {
        return new Response(JSON.stringify({ error: "Nenhuma face encontrada para este usuário no dispositivo" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 2: doFind to get actual face data
      const doUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=doFind&token=${startData.Token}&count=1`;
      console.log(`doFind: ${doUrl}`);
      const doResp = await auth.request(doUrl);
      const contentType = doResp.headers.get("content-type") || "";
      console.log(`doFind response status: ${doResp.status}, content-type: ${contentType}`);

      let photo: string | null = null;

      if (contentType.includes("multipart")) {
        // Multipart response - extract JPEG image
        const data = await doResp.arrayBuffer();
        const bytes = new Uint8Array(data);
        let jpegStart = -1;
        let jpegEnd = -1;
        for (let i = 0; i < bytes.length - 1; i++) {
          if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8 && jpegStart < 0) jpegStart = i;
          if (bytes[i] === 0xFF && bytes[i + 1] === 0xD9) jpegEnd = i + 2;
        }
        if (jpegStart >= 0) {
          const jpegData = bytes.slice(jpegStart, jpegEnd > jpegStart ? jpegEnd : undefined);
          photo = `data:image/jpeg;base64,${base64Encode(jpegData)}`;
        }
      } else {
        const text = await doResp.text();
        console.log(`doFind text (first 500): ${text.slice(0, 500)}`);
        // Try to extract PhotoData from key=value or JSON
        try {
          const json = JSON.parse(text);
          if (json.Info?.[0]?.PhotoData?.[0]) {
            photo = `data:image/jpeg;base64,${json.Info[0].PhotoData[0]}`;
          }
        } catch {
          const photoMatch = text.match(/PhotoData\[0\]=(.+)/);
          if (photoMatch) {
            photo = `data:image/jpeg;base64,${photoMatch[1].trim()}`;
          }
        }
      }

      // Step 3: stopFind
      try {
        await auth.request(`${deviceUrl}/cgi-bin/AccessFace.cgi?action=stopFind&token=${startData.Token}`);
      } catch { /* ignore */ }

      if (photo) {
        return new Response(JSON.stringify({ success: true, photo }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Face encontrada mas não foi possível extrair a imagem" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "set") {
      if (!personId || !photoUrl) {
        return new Response(JSON.stringify({ error: "personId e photoUrl são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Download photo
      console.log(`Downloading photo: ${photoUrl}`);
      const photoResp = await fetch(photoUrl);
      if (!photoResp.ok) {
        return new Response(JSON.stringify({ error: "Não foi possível baixar a foto" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const photoBytes = new Uint8Array(await photoResp.arrayBuffer());
      const photoBase64 = base64Encode(photoBytes);

      // Build multipart body matching Dahua format
      // FaceList[0].UserID=X and FaceList[0].PhotoData[0]=<binary>
      const boundary = "----DahuaBoundary" + Date.now();
      
      const parts: string[] = [];
      parts.push(`--${boundary}`);
      parts.push(`Content-Disposition: form-data; name="FaceList[0].UserID"`);
      parts.push("");
      parts.push(personId);
      parts.push(`--${boundary}`);
      parts.push(`Content-Disposition: form-data; name="FaceList[0].PhotoData[0]"; filename="face.jpg"`);
      parts.push("Content-Type: image/jpeg");
      parts.push("");
      
      // Combine text prefix + binary photo + suffix
      const encoder = new TextEncoder();
      const prefix = encoder.encode(parts.join("\r\n") + "\r\n");
      const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
      
      const body = new Uint8Array(prefix.length + photoBytes.length + suffix.length);
      body.set(prefix, 0);
      body.set(photoBytes, prefix.length);
      body.set(suffix, prefix.length + photoBytes.length);

      // Try insertMulti first
      const insertUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=insertMulti`;
      console.log(`Trying insertMulti: ${insertUrl}`);
      const insertResp = await auth.request(insertUrl, "POST", body, {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      });
      const insertText = await insertResp.text();
      console.log(`insertMulti response (${insertResp.status}): ${insertText.slice(0, 500)}`);

      if (insertResp.ok && !insertText.includes("Error")) {
        return new Response(JSON.stringify({ success: true, message: "Foto enviada ao dispositivo!" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If face exists, try updateMulti
      if (insertText.includes("Exist") || insertText.includes("exist") || insertText.includes("Already")) {
        const updateUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=updateMulti`;
        console.log(`Trying updateMulti: ${updateUrl}`);
        const updateResp = await auth.request(updateUrl, "POST", body, {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        });
        const updateText = await updateResp.text();
        console.log(`updateMulti response (${updateResp.status}): ${updateText.slice(0, 500)}`);
        
        if (updateResp.ok && !updateText.includes("Error")) {
          return new Response(JSON.stringify({ success: true, message: "Foto atualizada no dispositivo!" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Fallback: try JSON format
      const jsonBody = JSON.stringify({ FaceList: [{ UserID: personId, PhotoData: [photoBase64] }] });
      const jsonUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=insertMulti`;
      console.log(`Trying JSON insertMulti`);
      const jsonResp = await auth.request(jsonUrl, "POST", jsonBody, {
        "Content-Type": "application/json",
      });
      const jsonText = await jsonResp.text();
      console.log(`JSON insertMulti response (${jsonResp.status}): ${jsonText.slice(0, 500)}`);

      if (jsonResp.ok && !jsonText.includes("Error")) {
        return new Response(JSON.stringify({ success: true, message: "Foto enviada ao dispositivo!" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        error: "Erro ao enviar foto ao dispositivo",
        details: { multipart: insertText.slice(0, 200), json: jsonText.slice(0, 200) }
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "delete") {
      const url = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=removeMulti&UserIDList[0].UserID=${encodeURIComponent(personId)}`;
      console.log(`Deleting face: ${url}`);
      const resp = await auth.request(url);
      const text = await resp.text();
      console.log(`Delete response: ${text.slice(0, 500)}`);
      
      return new Response(JSON.stringify({ success: resp.ok, message: "Face removida do dispositivo" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Ação inválida. Use: get, set, delete" }), {
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
