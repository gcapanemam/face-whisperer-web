import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Md5 } from "https://deno.land/std@0.160.0/hash/md5.ts";

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

  async authenticate(url: string, method: string = "GET"): Promise<Response> {
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
    return fetch(url, { method, headers: { Authorization: authHeader } });
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

    let deviceId: string | undefined;
    try {
      const body = await req.json();
      deviceId = body.deviceId;
    } catch {}

    const config = await getDeviceConfig(supabase, deviceId);
    if (!config) {
      return new Response(JSON.stringify({ error: "Nenhum dispositivo configurado", persons: [] }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = new DigestAuth(config.username, config.password);
    const deviceUrl = config.device_url;

    const url = `${deviceUrl}/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCard&count=1000`;
    const response = await auth.authenticate(url);
    const text = await response.text();

    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      return new Response(JSON.stringify({ error: "Dispositivo retornou HTML", persons: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const persons: any[] = [];
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const records: Record<string, Record<string, string>> = {};

    for (const line of lines) {
      const match = line.match(/^records\[(\d+)\]\.(.+)=(.*)$/);
      if (match) {
        const [, idx, key, value] = match;
        if (!records[idx]) records[idx] = {};
        records[idx][key] = value;
      }
    }

    for (const key of Object.keys(records).sort((a, b) => parseInt(a) - parseInt(b))) {
      const r = records[key];
      persons.push({
        userId: r.UserID || r.CardNo || "",
        name: r.CardName || r.UserName || r.RealName || "",
        cardNo: r.CardNo || "",
        cardType: r.CardType || "",
        doors: r.Doors || "",
        validFrom: r.ValidDateStart || "",
        validTo: r.ValidDateEnd || "",
      });
    }

    return new Response(JSON.stringify({ persons, total: persons.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message, persons: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
