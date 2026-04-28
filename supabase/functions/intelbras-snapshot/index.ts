import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

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
  private md5(s: string) { return createHash("md5").update(s).digest("hex"); }
  async authenticate(url: string, method = "GET", timeoutMs = 8000): Promise<Response> {
    const first = await fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    if (first.status !== 401) return first;
    const wwwAuth = first.headers.get("www-authenticate");
    if (!wwwAuth) throw new Error("No WWW-Authenticate");
    const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
    const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
    const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "";
    const opaque = wwwAuth.match(/opaque="([^"]+)"/)?.[1] || "";
    this.nc++;
    const ncStr = this.nc.toString(16).padStart(8, "0");
    const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const u = new URL(url);
    const uri = u.pathname + u.search;
    const ha1 = this.md5(`${this.username}:${realm}:${this.password}`);
    const ha2 = this.md5(`${method}:${uri}`);
    const response = qop
      ? this.md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop.split(",")[0]}:${ha2}`)
      : this.md5(`${ha1}:${nonce}:${ha2}`);
    let h = `Digest username="${this.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) h += `, qop=${qop.split(",")[0]}, nc=${ncStr}, cnonce="${cnonce}"`;
    if (opaque) h += `, opaque="${opaque}"`;
    await first.text();
    return fetch(url, { method, headers: { Authorization: h }, signal: AbortSignal.timeout(timeoutMs) });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const deviceId = url.searchParams.get("deviceId");
    const path = url.searchParams.get("path");
    if (!path) {
      return new Response(JSON.stringify({ error: "missing path" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let device: any = null;
    if (deviceId) {
      const { data } = await supabase
        .from("devices")
        .select("id, device_url, username, password")
        .eq("id", deviceId).maybeSingle();
      device = data;
    }
    let baseUrl = device?.device_url || Deno.env.get("INTELBRAS_DEVICE_URL") || "";
    let username = device?.username || Deno.env.get("INTELBRAS_USERNAME") || "";
    let password = device?.password || Deno.env.get("INTELBRAS_PASSWORD") || "";
    baseUrl = baseUrl.replace(/#.*$/, "").replace(/\/+$/, "");

    // Override with env if matches
    const envUrl = (Deno.env.get("INTELBRAS_DEVICE_URL") || "").replace(/#.*$/, "").replace(/\/+$/, "");
    if (envUrl && baseUrl === envUrl) {
      username = Deno.env.get("INTELBRAS_USERNAME") || username;
      password = Deno.env.get("INTELBRAS_PASSWORD") || password;
    }

    if (!baseUrl || !username || !password) {
      return new Response(JSON.stringify({ error: "device not configured" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = new DigestAuth(username, password);
    const cleanPath = path.startsWith("/") ? path : `/${path}`;

    const candidates = path.startsWith("http")
      ? [path]
      : [
          `${baseUrl}/RPC_Loadfile${cleanPath}`,
          `${baseUrl}${cleanPath}`,
          `${baseUrl}/cgi-bin/RPC_Loadfile${cleanPath}`,
        ];

    let bytes: Uint8Array | null = null;
    let lastStatus = 0;
    for (const tryUrl of candidates) {
      try {
        const resp = await auth.authenticate(tryUrl, "GET", 8000);
        lastStatus = resp.status;
        if (resp.ok) {
          const buf = new Uint8Array(await resp.arrayBuffer());
          if (buf.length > 0) { bytes = buf; break; }
        } else {
          await resp.text().catch(() => {});
        }
      } catch (e) {
        console.warn(`snapshot fetch failed ${tryUrl}: ${(e as any)?.message}`);
      }
    }

    if (!bytes) {
      return new Response(JSON.stringify({ error: "not found", lastStatus }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as any)?.message || "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
