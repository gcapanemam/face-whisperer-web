import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Dahua/Intelbras Digest Auth implementation
class DigestAuth {
  private username: string;
  private password: string;
  private nc = 0;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  private async md5(str: string): Promise<string> {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("MD5", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async authenticate(url: string, method: string = "GET"): Promise<Response> {
    // First request to get the challenge
    const firstResponse = await fetch(url, { method, redirect: "manual" });

    if (firstResponse.status !== 401) {
      return firstResponse;
    }

    const wwwAuth = firstResponse.headers.get("www-authenticate");
    if (!wwwAuth) throw new Error("No WWW-Authenticate header");

    // Parse digest challenge
    const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
    const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
    const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "";

    this.nc++;
    const ncStr = this.nc.toString(16).padStart(8, "0");
    const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    const uri = new URL(url).pathname + new URL(url).search;

    const ha1 = await this.md5(`${this.username}:${realm}:${this.password}`);
    const ha2 = await this.md5(`${method}:${uri}`);

    let response: string;
    if (qop) {
      response = await this.md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop.split(",")[0]}:${ha2}`);
    } else {
      response = await this.md5(`${ha1}:${nonce}:${ha2}`);
    }

    const authHeader = `Digest username="${this.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"${
      qop ? `, qop=${qop.split(",")[0]}, nc=${ncStr}, cnonce="${cnonce}"` : ""
    }`;

    // Consume the first response body
    await firstResponse.text();

    return fetch(url, {
      method,
      headers: { Authorization: authHeader },
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const deviceUrl = Deno.env.get("INTELBRAS_DEVICE_URL");
    const username = Deno.env.get("INTELBRAS_USERNAME");
    const password = Deno.env.get("INTELBRAS_PASSWORD");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!deviceUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Intelbras credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean device URL - remove hash fragments and trailing slashes
    const cleanUrl = deviceUrl.replace(/#.*$/, '').replace(/\/+$/, '');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const auth = new DigestAuth(username, password);

    // Get the last processed event timestamp
    const { data: lastEvent } = await supabase
      .from("recognition_log")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const now = Math.floor(Date.now() / 1000);
    const startTime = lastEvent
      ? Math.floor(new Date(lastEvent.created_at).getTime() / 1000)
      : now - 300;

    console.log(`Polling Intelbras device: ${cleanUrl}`);
    console.log(`Time range: ${new Date(startTime * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);

    let events: any[] = [];
    let deviceStatus = "online";
    let debugInfo: any = {};

    // Try multiple Dahua/Intelbras API endpoints
    const endpoints = [
      `/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&count=100`,
      `/cgi-bin/accessControl.cgi?action=list&channel=1`,
      `/cgi-bin/AccessControl.cgi?action=list&channel=1`,
    ];

    try {
      for (const endpoint of endpoints) {
        const url = `${cleanUrl}${endpoint}`;
        console.log(`Trying endpoint: ${url}`);
        
        try {
          const response = await auth.authenticate(url);
          const text = await response.text();

          console.log(`Response status: ${response.status}`);
          console.log(`Response (first 500 chars): ${text.slice(0, 500)}`);

          // Skip if we got HTML (web UI) instead of API data
          if (text.includes("<!DOCTYPE") || text.includes("<html")) {
            console.log("Got HTML response, skipping...");
            debugInfo[endpoint] = { status: response.status, type: "html" };
            continue;
          }

          debugInfo[endpoint] = { status: response.status, type: "api", preview: text.slice(0, 200) };

          if (response.ok) {
            const parsed = parseDahuaResponse(text);
            if (parsed.length > 0) {
              events = parsed;
              console.log(`Found ${events.length} events from ${endpoint}`);
              break;
            }
          }
        } catch (endpointError) {
          console.log(`Endpoint ${endpoint} error: ${endpointError.message}`);
          debugInfo[endpoint] = { error: endpointError.message };
        }
      }
    } catch (fetchError) {
      console.error(`Device connection error: ${fetchError}`);
      deviceStatus = "offline";
    }

    // Process recognized events
    let processedCount = 0;
    let pickupEventsCreated = 0;

    for (const event of events) {
      const personId = event.UserID || event.CardNo || event.PersonID || null;
      const method = parseInt(event.Method || "0");
      // Method 15 = face recognition in Dahua
      const isFaceRecognition = method === 15 || method === 6;
      const confidence = parseFloat(event.SimilarityScore || event.Similarity || "0");

      // Check if we already processed this event
      const eventId = event.RecNo || `${personId}-${event.CreateTime || now}`;
      const { data: existing } = await supabase
        .from("recognition_log")
        .select("id")
        .eq("intelbras_event_id", eventId)
        .limit(1)
        .single();

      if (existing) continue;

      // Find matching guardian
      let guardianId: string | null = null;
      let recognized = false;

      if (personId) {
        const { data: guardian } = await supabase
          .from("guardians")
          .select("id")
          .eq("intelbras_person_id", personId)
          .limit(1)
          .single();

        if (guardian) {
          guardianId = guardian.id;
          recognized = true;
        }
      }

      // Log the recognition event
      await supabase.from("recognition_log").insert({
        intelbras_event_id: eventId,
        intelbras_person_id: personId,
        guardian_id: guardianId,
        recognized,
        confidence: confidence || null,
        raw_data: event,
      });
      processedCount++;

      // If recognized, create pickup events for each authorized child
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

    const result = {
      success: true,
      deviceStatus,
      eventsFound: events.length,
      eventsProcessed: processedCount,
      pickupEventsCreated,
      debugInfo,
      timestamp: new Date().toISOString(),
    };

    console.log(`Result: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
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

// Parse Dahua's key=value response format into array of event objects
function parseDahuaResponse(text: string): any[] {
  const events: any[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  
  // Check if it's a totalCount/found response
  const totalMatch = text.match(/totalCount=(\d+)/);
  if (totalMatch && parseInt(totalMatch[1]) === 0) return [];

  // Parse records[i].Key=Value format
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

  // If no records format, try simple key=value
  if (events.length === 0 && lines.length > 0) {
    const singleEvent: Record<string, string> = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        singleEvent[key.trim()] = valueParts.join("=").trim();
      }
    }
    if (Object.keys(singleEvent).length > 2) {
      events.push(singleEvent);
    }
  }

  return events;
}
