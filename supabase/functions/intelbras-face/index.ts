import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";
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
    return createHash("md5").update(str).digest("hex");
  }

  async request(url: string, method: string = "GET", body?: BodyInit, extraHeaders?: Record<string, string>): Promise<Response> {
    const firstResponse = await fetch(url, { method, redirect: "manual" });
    if (firstResponse.status !== 401) return firstResponse;

    const wwwAuth = firstResponse.headers.get("www-authenticate");
    if (!wwwAuth) throw new Error("No WWW-Authenticate header");

    const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
    const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
    const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "";
    const opaque = wwwAuth.match(/opaque="([^"]+)"/)?.[1] || "";

    this.nc++;
    const ncStr = this.nc.toString(16).padStart(8, "0");
    const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const uri = new URL(url).pathname + new URL(url).search;

    const ha1 = this.md5(`${this.username}:${realm}:${this.password}`);
    const ha2 = this.md5(`${method}:${uri}`);
    const response = qop
      ? this.md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop.split(",")[0]}:${ha2}`)
      : this.md5(`${ha1}:${nonce}:${ha2}`);

    let authHeader = `Digest username="${this.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) authHeader += `, qop=${qop.split(",")[0]}, nc=${ncStr}, cnonce="${cnonce}"`;
    if (opaque) authHeader += `, opaque="${opaque}"`;

    await firstResponse.text();
    return fetch(url, { method, headers: { Authorization: authHeader, ...(extraHeaders || {}) }, body });
  }
}

interface DeviceConfig {
  id: string;
  device_url: string;
  username: string;
  password: string;
}

async function getDeviceConfig(supabase: any, deviceId?: string): Promise<DeviceConfig | null> {
  if (deviceId) {
    const { data } = await supabase
      .from("devices")
      .select("id, device_url, username, password")
      .eq("id", deviceId)
      .single();
    if (data) return data;
  }

  // Try first enabled device
  const { data: devices } = await supabase
    .from("devices")
    .select("id, device_url, username, password")
    .eq("enabled", true)
    .limit(1);
  if (devices && devices.length > 0) return devices[0];

  // Fallback to env vars
  const deviceUrl = Deno.env.get("INTELBRAS_DEVICE_URL");
  const username = Deno.env.get("INTELBRAS_USERNAME");
  const password = Deno.env.get("INTELBRAS_PASSWORD");
  if (!deviceUrl || !username || !password) return null;
  return {
    id: "env",
    device_url: deviceUrl.replace(/#.*$/, '').replace(/\/+$/, ''),
    username,
    password,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, personId, photoUrl, deviceId } = await req.json();

    const config = await getDeviceConfig(supabase, deviceId);
    if (!config) {
      return new Response(JSON.stringify({ error: "Nenhum dispositivo configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const deviceUrl = config.device_url;
    const auth = new DigestAuth(config.username, config.password);

    if (action === "check") {
      const startUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=startFind&condition.UserID=${encodeURIComponent(personId)}`;
      const startResp = await auth.request(startUrl);
      const startText = await startResp.text();

      let startData;
      try { startData = JSON.parse(startText); } catch { startData = null; }

      if (startData?.Total > 0) {
        const doUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=doFind&Token=${startData.Token}&Offset=0&Count=10`;
        const doResp = await auth.request(doUrl);
        const doText = await doResp.text();
        let info = null;
        try { info = JSON.parse(doText); } catch {}
        try { await auth.request(`${deviceUrl}/cgi-bin/AccessFace.cgi?action=stopFind&Token=${startData.Token}`); } catch {}

        return new Response(JSON.stringify({
          success: true, hasFace: true, total: startData.Total, info: info?.Info || null,
          message: "Face cadastrada no dispositivo"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (startData?.Token) {
        try { await auth.request(`${deviceUrl}/cgi-bin/AccessFace.cgi?action=stopFind&Token=${startData.Token}`); } catch {}
      }

      return new Response(JSON.stringify({ success: true, hasFace: false, message: "Nenhuma face cadastrada para este usuário" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "get") {
      return new Response(JSON.stringify({
        error: "O modelo SS 3532 MF W não suporta download de fotos via API. Use a ação 'check'.",
        suggestion: "check"
      }), { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (action === "set") {
      if (!personId || !photoUrl) {
        return new Response(JSON.stringify({ error: "personId e photoUrl são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // After successful upload, upsert guardian_devices link
      const upsertGuardianDevice = async () => {
        if (!deviceId || config.id === "env") return;
        // Find guardian by intelbras_person_id
        const { data: guardian } = await supabase
          .from("guardians")
          .select("id")
          .eq("intelbras_person_id", personId)
          .limit(1)
          .single();
        if (guardian) {
          await supabase.from("guardian_devices").upsert({
            guardian_id: guardian.id,
            device_id: config.id,
            intelbras_person_id: personId,
            synced: true,
          }, { onConflict: "guardian_id,device_id" });
        }
      };

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
        } catch {}
        return photoUrl;
      })();

      const photoResp = await fetch(optimizedPhotoUrl);
      if (!photoResp.ok) {
        return new Response(JSON.stringify({ error: "Não foi possível baixar a foto" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const photoBytes = new Uint8Array(await photoResp.arrayBuffer());
      if (photoBytes.length > 200 * 1024) {
        return new Response(JSON.stringify({ error: "Foto muito grande para o dispositivo", size: photoBytes.length }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const photoBase64 = base64Encode(photoBytes).replace(/\s/g, "");

      // Check if face exists
      const startUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=startFind&condition.UserID=${encodeURIComponent(personId)}`;
      const startResp = await auth.request(startUrl);
      const startText = await startResp.text();
      let startData: any = null;
      try { startData = JSON.parse(startText); } catch {}
      const hasExistingFace = Boolean(startData?.Total && startData.Total > 0);
      if (startData?.Token) {
        try { await auth.request(`${deviceUrl}/cgi-bin/AccessFace.cgi?action=stopFind&Token=${startData.Token}`); } catch {}
      }

      const actionName = hasExistingFace ? "updateMulti" : "insertMulti";
      const actionUrl = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=${actionName}`;

      const jsonBody = JSON.stringify({ FaceList: [{ UserID: personId, PhotoData: [photoBase64] }] });
      const jsonResp = await auth.request(actionUrl, "POST", jsonBody, { "Content-Type": "application/json" });
      const jsonText = await jsonResp.text();

      if (jsonResp.ok && !jsonText.toLowerCase().includes("error") && !jsonText.toLowerCase().includes("batch process error")) {
        await upsertGuardianDevice();
        return new Response(JSON.stringify({
          success: true, message: hasExistingFace ? "Foto atualizada no dispositivo!" : "Foto enviada ao dispositivo!",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fallback to form-encoded
      const formBody = new URLSearchParams();
      formBody.set("FaceList[0].UserID", personId);
      formBody.set("FaceList[0].PhotoData[0]", photoBase64);
      const formResp = await auth.request(actionUrl, "POST", formBody.toString(), { "Content-Type": "application/x-www-form-urlencoded" });
      const formText = await formResp.text();

      if (formResp.ok && !formText.toLowerCase().includes("error") && !formText.toLowerCase().includes("batch process error")) {
        await upsertGuardianDevice();
        return new Response(JSON.stringify({
          success: true, message: hasExistingFace ? "Foto atualizada no dispositivo!" : "Foto enviada ao dispositivo!",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        error: hasExistingFace ? "Erro ao atualizar foto" : "Erro ao enviar foto",
        raw: formText.slice(0, 300) || jsonText.slice(0, 300),
        jsonRaw: jsonText.slice(0, 300),
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (action === "delete") {
      const url = `${deviceUrl}/cgi-bin/AccessFace.cgi?action=removeMulti&UserIDList[0].UserID=${encodeURIComponent(personId)}`;
      const resp = await auth.request(url);
      const text = await resp.text();
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
