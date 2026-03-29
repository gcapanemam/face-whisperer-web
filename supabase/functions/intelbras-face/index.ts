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

  async request(url: string, method: string = "GET", body?: string, extraHeaders?: Record<string, string>): Promise<Response> {
    // First request to get digest challenge
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

    const headers: Record<string, string> = { Authorization: authHeader, ...(extraHeaders || {}) };

    return fetch(url, { method, headers, body });
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

    if (action === "probe") {
      // Probe AccessFace.cgi with POST methods
      const probes: any[] = [];
      
      // Test POST with JSON body for AccessFace.cgi
      const postTests = [
        { url: `${deviceUrl}/cgi-bin/AccessFace.cgi?action=list`, body: '{"UserIDList":[{"UserID":"1"}]}' },
        { url: `${deviceUrl}/cgi-bin/AccessFace.cgi?action=list`, body: '{"searchResultPosition":0,"maxResults":10}' },
        { url: `${deviceUrl}/cgi-bin/AccessUser.cgi?action=list`, body: '{"searchResultPosition":0,"maxResults":10}' },
        { url: `${deviceUrl}/cgi-bin/AccessUser.cgi?action=list`, body: '{"UserIDList":[{"UserID":"1"}]}' },
      ];
      
      for (const test of postTests) {
        try {
          const r = await auth.request(test.url, "POST", test.body, {"Content-Type": "application/json"});
          const text = await r.text();
          probes.push({ url: test.url.replace(deviceUrl, ""), method: "POST", body: test.body, status: r.status, response: text.slice(0, 500) });
        } catch (e) {
          probes.push({ url: test.url.replace(deviceUrl, ""), error: e.message });
        }
      }

      // Also try GET with different params  
      const getTests = [
        `${deviceUrl}/cgi-bin/AccessFace.cgi?action=list&channel=0`,
        `${deviceUrl}/cgi-bin/AccessFace.cgi?action=list&channel=1`,
        `${deviceUrl}/cgi-bin/faceRecognitionServer.cgi?action=list`,
      ];
      for (const url of getTests) {
        try {
          const r = await auth.request(url);
          const text = await r.text();
          probes.push({ url: url.replace(deviceUrl, ""), status: r.status, response: text.slice(0, 500) });
        } catch (e) {
          probes.push({ url: url.replace(deviceUrl, ""), error: e.message });
        }
      }

      return new Response(JSON.stringify({ device: "SS 3532 MF W", results: probes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get") {
      // Try multiple endpoints to get face photo
      const endpoints = [
        `${deviceUrl}/cgi-bin/FaceInfoManager.cgi?action=get&UserID=${encodeURIComponent(personId)}`,
        `${deviceUrl}/cgi-bin/AccessFace.cgi?action=list&UserID=${encodeURIComponent(personId)}`,
        `${deviceUrl}/cgi-bin/recordFinder.cgi?action=find&name=AccessControlFaceInfo&count=100`,
      ];

      for (const url of endpoints) {
        console.log(`Trying GET face: ${url}`);
        try {
          const response = await auth.request(url);
          const contentType = response.headers.get("content-type") || "";
          console.log(`Response status: ${response.status}, content-type: ${contentType}`);

          if (response.status === 501 || response.status === 404) {
            console.log(`Endpoint not supported (${response.status}), trying next...`);
            await response.text(); // consume
            continue;
          }

          // If image response
          if (contentType.includes("image")) {
            const imageData = await response.arrayBuffer();
            const base64 = base64Encode(new Uint8Array(imageData));
            return new Response(JSON.stringify({
              success: true,
              photo: `data:image/jpeg;base64,${base64}`
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // If multipart response (common for Dahua face retrieval)
          if (contentType.includes("multipart")) {
            const data = await response.arrayBuffer();
            const bytes = new Uint8Array(data);
            // Find JPEG start (FF D8) and end (FF D9)
            let jpegStart = -1;
            for (let i = 0; i < bytes.length - 1; i++) {
              if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8) { jpegStart = i; break; }
            }
            if (jpegStart >= 0) {
              const base64 = base64Encode(bytes.slice(jpegStart));
              return new Response(JSON.stringify({
                success: true,
                photo: `data:image/jpeg;base64,${base64}`
              }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }

          // Text/JSON response - check if it has base64 photo data
          const text = await response.text();
          console.log(`Text response (first 500): ${text.slice(0, 500)}`);

          // Parse records format for PhotoData
          const photoMatch = text.match(/PhotoData\[0\]=(.+)/);
          if (photoMatch) {
            return new Response(JSON.stringify({
              success: true,
              photo: `data:image/jpeg;base64,${photoMatch[1].trim()}`
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Try parsing as JSON
          try {
            const json = JSON.parse(text);
            if (json.PhotoData && json.PhotoData.length > 0) {
              return new Response(JSON.stringify({
                success: true,
                photo: `data:image/jpeg;base64,${json.PhotoData[0]}`
              }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } catch { /* not JSON */ }

          if (response.ok && !text.includes("error") && !text.includes("Error")) {
            console.log(`Got response but no photo data found`);
          }
        } catch (err) {
          console.log(`Endpoint error: ${err.message}`);
        }
      }

      return new Response(JSON.stringify({
        error: "Não foi possível obter a foto do dispositivo. Os endpoints testados não são suportados por este modelo.",
      }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "set") {
      if (!personId || !photoUrl) {
        return new Response(JSON.stringify({ error: "personId e photoUrl são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Download the photo
      console.log(`Downloading photo from: ${photoUrl}`);
      const photoResponse = await fetch(photoUrl);
      if (!photoResponse.ok) {
        return new Response(JSON.stringify({ error: "Não foi possível baixar a foto" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const photoArrayBuffer = await photoResponse.arrayBuffer();
      const photoBase64 = base64Encode(new Uint8Array(photoArrayBuffer));

      // Try multiple methods to add face
      const methods = [
        {
          name: "FaceInfoManager (JSON body)",
          url: `${deviceUrl}/cgi-bin/FaceInfoManager.cgi?action=add`,
          body: JSON.stringify({ UserID: personId, PhotoData: [photoBase64] }),
          contentType: "application/json",
        },
        {
          name: "AccessFace insert",
          url: `${deviceUrl}/cgi-bin/AccessFace.cgi?action=insertMulti`,
          body: JSON.stringify({ FaceList: [{ UserID: personId, PhotoData: [photoBase64] }] }),
          contentType: "application/json",
        },
        {
          name: "recordUpdater FaceInfo",
          url: `${deviceUrl}/cgi-bin/recordUpdater.cgi?action=insert&name=AccessControlFaceInfo`,
          body: `UserID=${personId}&PhotoData[0]=${photoBase64}`,
          contentType: "application/x-www-form-urlencoded",
        },
      ];

      const results: any[] = [];

      for (const method of methods) {
        console.log(`Trying SET face: ${method.name} -> ${method.url}`);
        try {
          const response = await auth.request(method.url, "POST", method.body, {
            "Content-Type": method.contentType,
          });
          const text = await response.text();
          console.log(`${method.name} response (${response.status}): ${text.slice(0, 500)}`);

          results.push({ method: method.name, status: response.status, response: text.slice(0, 300) });

          if (response.status === 501 || response.status === 404) continue;

          const isSuccess = text.includes("OK") || text.includes("ok") || 
                           text.includes('"result":true') || text.includes("Result=1") ||
                           (response.ok && !text.includes("Error") && !text.includes("error"));

          if (isSuccess) {
            return new Response(JSON.stringify({ success: true, message: "Foto enviada ao dispositivo!", method: method.name }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // If face already exists, try update
          if (text.includes("Already Exist") || text.includes("exist") || text.includes("Existed")) {
            const updateUrl = method.url.replace("add", "update").replace("insert", "update");
            console.log(`Face exists, trying update: ${updateUrl}`);
            const updateResp = await auth.request(updateUrl, "POST", method.body, {
              "Content-Type": method.contentType,
            });
            const updateText = await updateResp.text();
            console.log(`Update response (${updateResp.status}): ${updateText.slice(0, 500)}`);

            const updateSuccess = updateText.includes("OK") || updateText.includes("ok") || updateResp.ok;
            if (updateSuccess) {
              return new Response(JSON.stringify({ success: true, message: "Foto atualizada no dispositivo!", method: method.name }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } catch (err) {
          console.log(`${method.name} error: ${err.message}`);
          results.push({ method: method.name, error: err.message });
        }
      }

      return new Response(JSON.stringify({
        error: "Nenhum método de envio funcionou com este dispositivo",
        details: results,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "delete") {
      const url = `${deviceUrl}/cgi-bin/FaceInfoManager.cgi?action=remove&UserID=${encodeURIComponent(personId)}`;
      console.log(`Deleting face: ${url}`);
      const response = await auth.request(url);
      const text = await response.text();
      console.log(`Delete response: ${text.slice(0, 500)}`);

      return new Response(JSON.stringify({
        success: text.includes("OK") || text.includes("ok") || response.ok,
        message: "Foto removida do dispositivo"
      }), {
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
