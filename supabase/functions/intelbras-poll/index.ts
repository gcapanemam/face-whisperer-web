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

  private md5(str: string): string {
    return createHash("md5").update(str).digest("hex");
  }

  async authenticate(url: string, method: string = "GET"): Promise<Response> {
    const firstResponse = await fetch(url, { method, redirect: "manual" });
    console.log(`[DigestAuth] First response status: ${firstResponse.status}`);
    if (firstResponse.status !== 401) return firstResponse;

    const wwwAuth = firstResponse.headers.get("www-authenticate");
    console.log(`[DigestAuth] WWW-Authenticate: ${wwwAuth}`);
    if (!wwwAuth) throw new Error("No WWW-Authenticate header");

    const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
    const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
    const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "";
    const algorithm = wwwAuth.match(/algorithm=([^,\s]+)/)?.[1] || "MD5";

    console.log(`[DigestAuth] realm=${realm}, nonce=${nonce}, qop=${qop}, algorithm=${algorithm}`);

    this.nc++;
    const ncStr = this.nc.toString(16).padStart(8, "0");
    const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const uri = new URL(url).pathname + new URL(url).search;

    const ha1 = this.md5(`${this.username}:${realm}:${this.password}`);
    const ha2 = this.md5(`${method}:${uri}`);

    let response: string;
    if (qop) {
      response = this.md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop.split(",")[0]}:${ha2}`);
    } else {
      response = this.md5(`${ha1}:${nonce}:${ha2}`);
    }

    const authHeader = `Digest username="${this.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"${
      qop ? `, qop=${qop.split(",")[0]}, nc=${ncStr}, cnonce="${cnonce}"` : ""
    }${algorithm !== "MD5" ? `, algorithm=${algorithm}` : ""}`;

    console.log(`[DigestAuth] Auth header: ${authHeader}`);

    await firstResponse.text();
    const secondResponse = await fetch(url, { method, headers: { Authorization: authHeader } });
    console.log(`[DigestAuth] Second response status: ${secondResponse.status}`);
    return secondResponse;
  }
}

interface DeviceConfig {
  id: string;
  device_url: string;
  username: string;
  password: string;
  name: string;
}

async function getDevices(supabase: any, deviceId?: string): Promise<DeviceConfig[]> {
  if (deviceId) {
    const { data, error } = await supabase
      .from("devices")
      .select("id, device_url, username, password, name")
      .eq("id", deviceId)
      .single();
    if (error || !data) return getFallbackDevice();
    return [data];
  }

  const { data, error } = await supabase
    .from("devices")
    .select("id, device_url, username, password, name")
    .eq("enabled", true);

  if (data && data.length > 0) return data;
  return getFallbackDevice();
}

function getFallbackDevice(): DeviceConfig[] {
  const deviceUrl = Deno.env.get("INTELBRAS_DEVICE_URL");
  const username = Deno.env.get("INTELBRAS_USERNAME");
  const password = Deno.env.get("INTELBRAS_PASSWORD");
  if (!deviceUrl || !username || !password) return [];
  return [{
    id: "env",
    device_url: deviceUrl.replace(/#.*$/, '').replace(/\/+$/, ''),
    username,
    password,
    name: "Dispositivo (env)",
  }];
}

async function pollDevice(device: DeviceConfig, supabase: any, testOnly: boolean) {
  const cleanUrl = device.device_url.replace(/#.*$/, '').replace(/\/+$/, '');
  const auth = new DigestAuth(device.username, device.password);

  let events: any[] = [];
  let deviceStatus = "online";
  const debugInfo: any = {};

  const endpoints = [
    `/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&count=100`,
    `/cgi-bin/accessControl.cgi?action=list&channel=1`,
    `/cgi-bin/AccessControl.cgi?action=list&channel=1`,
  ];

  try {
    // Quick diagnostic: test first endpoint auth details
    const diagUrl = `${cleanUrl}${endpoints[0]}`;
    try {
      const diagResp = await fetch(diagUrl, { method: "GET", redirect: "manual" });
      const wwwAuth = diagResp.headers.get("www-authenticate");
      debugInfo._authDiag = {
        firstStatus: diagResp.status,
        hasWwwAuth: !!wwwAuth,
        wwwAuth: wwwAuth?.slice(0, 300),
      };
      await diagResp.text();
    } catch (e) {
      debugInfo._authDiag = { error: e.message };
    }

    for (const endpoint of endpoints) {
      const url = `${cleanUrl}${endpoint}`;
      console.log(`[${device.name}] Trying: ${url}`);
      try {
        const response = await auth.authenticate(url);
        const text = await response.text();
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
          debugInfo[endpoint] = { status: response.status, type: "html" };
          continue;
        }
        debugInfo[endpoint] = { status: response.status, type: "api", preview: text.slice(0, 200) };
        if (response.ok) {
          const parsed = parseDahuaResponse(text);
          if (parsed.length > 0) {
            events = parsed;
            break;
          }
        }
      } catch (endpointError) {
        debugInfo[endpoint] = { error: endpointError.message };
      }
    }
  } catch {
    deviceStatus = "offline";
  }

  if (testOnly) {
    return { deviceId: device.id, deviceName: device.name, deviceStatus, debugInfo };
  }

  let processedCount = 0;
  let pickupEventsCreated = 0;

  for (const event of events) {
    const personId = event.UserID || event.CardNo || event.PersonID || null;
    const confidence = parseFloat(event.SimilarityScore || event.Similarity || "0");
    const eventId = event.RecNo || `${personId}-${event.CreateTime || Date.now()}`;

    const { data: existing } = await supabase
      .from("recognition_log")
      .select("id")
      .eq("intelbras_event_id", eventId)
      .limit(1)
      .single();
    if (existing) continue;

    // Look up guardian via guardian_devices table (device-specific)
    let guardianId: string | null = null;
    let recognized = false;
    if (personId) {
      const { data: gdLink } = await supabase
        .from("guardian_devices")
        .select("guardian_id")
        .eq("intelbras_person_id", personId)
        .eq("device_id", device.id)
        .limit(1)
        .single();
      if (gdLink) {
        guardianId = gdLink.guardian_id;
        recognized = true;
      } else {
        // Fallback: check guardians table directly (legacy)
        const { data: guardian } = await supabase
          .from("guardians")
          .select("id")
          .eq("intelbras_person_id", personId)
          .limit(1)
          .single();
        if (guardian) { guardianId = guardian.id; recognized = true; }
      }
    }

    await supabase.from("recognition_log").insert({
      intelbras_event_id: eventId,
      intelbras_person_id: personId,
      guardian_id: guardianId,
      recognized,
      confidence: confidence || null,
      raw_data: event,
    });
    processedCount++;

    if (recognized && guardianId) {
      const { data: guardianChildren } = await supabase
        .from("guardian_children")
        .select("child_id, children(id, full_name, classroom_id)")
        .eq("guardian_id", guardianId)
        .eq("authorized", true);

      if (guardianChildren) {
        for (const gc of guardianChildren) {
          const child = gc.children as any;
          if (child?.classroom_id) {
            await supabase.from("pickup_events").insert({
              guardian_id: guardianId,
              child_id: child.id,
              classroom_id: child.classroom_id,
              intelbras_event_id: eventId,
              status: "pending",
            });
            pickupEventsCreated++;
          }
        }
      }
    }
  }

  return {
    deviceId: device.id,
    deviceName: device.name,
    deviceStatus,
    eventsFound: events.length,
    eventsProcessed: processedCount,
    pickupEventsCreated,
    debugInfo,
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
    let testOnly = false;
    try {
      const body = await req.json();
      deviceId = body.deviceId;
      testOnly = body.testOnly === true;
    } catch {}

    const devices = await getDevices(supabase, deviceId);
    if (devices.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum dispositivo configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];
    for (const device of devices) {
      try {
        const result = await pollDevice(device, supabase, testOnly);
        results.push(result);
      } catch (err) {
        results.push({ deviceId: device.id, deviceName: device.name, deviceStatus: "offline", error: err.message });
      }
    }

    const anyOnline = results.some(r => r.deviceStatus === "online");
    return new Response(JSON.stringify({
      success: true,
      deviceStatus: anyOnline ? "online" : "offline",
      devices: results,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseDahuaResponse(text: string): any[] {
  const events: any[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const totalMatch = text.match(/totalCount=(\d+)/);
  if (totalMatch && parseInt(totalMatch[1]) === 0) return [];

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
    events.push(records[key]);
  }
  if (events.length === 0 && lines.length > 0) {
    const singleEvent: Record<string, string> = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        singleEvent[key.trim()] = valueParts.join("=").trim();
      }
    }
    if (Object.keys(singleEvent).length > 2) events.push(singleEvent);
  }
  return events;
}
