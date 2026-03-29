import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    return fetch(url, {
      method,
      headers: { Authorization: authHeader, ...(extraHeaders || {}) },
      body,
    });
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
      // Get face photo from device
      // Dahua/Intelbras: GET /cgi-bin/FaceInfoManager.cgi?action=get&UserID=<id>
      const url = `${deviceUrl}/cgi-bin/FaceInfoManager.cgi?action=get&UserID=${encodeURIComponent(personId)}`;
      console.log(`Getting face from: ${url}`);

      const response = await auth.request(url);
      
      if (!response.ok) {
        // Try alternative endpoint
        const altUrl = `${deviceUrl}/cgi-bin/FaceRecognitionServer.cgi?action=getFaceImage&userId=${encodeURIComponent(personId)}&faceIndex=0`;
        console.log(`Trying alternative: ${altUrl}`);
        const altResponse = await auth.request(altUrl);
        
        if (!altResponse.ok) {
          return new Response(JSON.stringify({ 
            error: "Não foi possível obter a foto do dispositivo",
            status: response.status,
            altStatus: altResponse.status
          }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        const contentType = altResponse.headers.get("content-type") || "";
        if (contentType.includes("image")) {
          const imageData = await altResponse.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(imageData)));
          return new Response(JSON.stringify({ 
            success: true, 
            photo: `data:${contentType};base64,${base64}` 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const text = await altResponse.text();
        return new Response(JSON.stringify({ error: "Resposta inesperada", raw: text.slice(0, 500) }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const contentType = response.headers.get("content-type") || "";
      
      // If the response is multipart, extract the image
      if (contentType.includes("multipart") || contentType.includes("image")) {
        const imageData = await response.arrayBuffer();
        // Try to find JPEG in the data (starts with FF D8)
        const bytes = new Uint8Array(imageData);
        let jpegStart = -1;
        for (let i = 0; i < bytes.length - 1; i++) {
          if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8) {
            jpegStart = i;
            break;
          }
        }

        if (jpegStart >= 0) {
          const jpegData = bytes.slice(jpegStart);
          const base64 = btoa(String.fromCharCode(...jpegData));
          return new Response(JSON.stringify({ 
            success: true, 
            photo: `data:image/jpeg;base64,${base64}` 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // If not multipart, try as full image
        const base64 = btoa(String.fromCharCode(...bytes));
        return new Response(JSON.stringify({ 
          success: true, 
          photo: `data:image/jpeg;base64,${base64}` 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = await response.text();
      return new Response(JSON.stringify({ error: "Foto não encontrada", raw: text.slice(0, 500) }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "set") {
      // Send face photo to device
      if (!personId || !photoUrl) {
        return new Response(JSON.stringify({ error: "personId e photoUrl são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Download the photo from our storage
      console.log(`Downloading photo from: ${photoUrl}`);
      const photoResponse = await fetch(photoUrl);
      if (!photoResponse.ok) {
        return new Response(JSON.stringify({ error: "Não foi possível baixar a foto" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const photoBlob = await photoResponse.blob();
      const photoArrayBuffer = await photoBlob.arrayBuffer();
      const photoBytes = new Uint8Array(photoArrayBuffer);

      // Build multipart body for Dahua/Intelbras FaceInfoManager
      const boundary = "----WebKitFormBoundary" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      
      // JSON metadata part
      const jsonPart = JSON.stringify({ UserID: personId });
      
      // Build multipart manually
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      
      // Part 1: JSON metadata
      parts.push(encoder.encode(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="data"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${jsonPart}\r\n`
      ));
      
      // Part 2: Image file
      parts.push(encoder.encode(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="photo"; filename="face.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n`
      ));
      parts.push(photoBytes);
      parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));

      // Combine all parts
      const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
      const body = new Uint8Array(totalLength);
      let offset = 0;
      for (const part of parts) {
        body.set(part, offset);
        offset += part.length;
      }

      const url = `${deviceUrl}/cgi-bin/FaceInfoManager.cgi?action=add`;
      console.log(`Sending face to: ${url}`);

      const response = await auth.request(url, "POST", body, {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      });

      const text = await response.text();
      console.log(`Set face response (${response.status}): ${text.slice(0, 500)}`);

      if (text.includes("OK") || text.includes("ok") || response.ok) {
        return new Response(JSON.stringify({ success: true, message: "Foto enviada ao dispositivo" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try alternative: update existing face
      if (text.includes("Already Exist") || text.includes("exist")) {
        const updateUrl = `${deviceUrl}/cgi-bin/FaceInfoManager.cgi?action=update`;
        console.log(`Face exists, updating: ${updateUrl}`);
        
        const updateResponse = await auth.request(updateUrl, "POST", body, {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        });
        const updateText = await updateResponse.text();
        console.log(`Update face response (${updateResponse.status}): ${updateText.slice(0, 500)}`);

        if (updateText.includes("OK") || updateText.includes("ok") || updateResponse.ok) {
          return new Response(JSON.stringify({ success: true, message: "Foto atualizada no dispositivo" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: "Erro ao atualizar foto", raw: updateText.slice(0, 500) }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Erro ao enviar foto", raw: text.slice(0, 500) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "delete") {
      const url = `${deviceUrl}/cgi-bin/FaceInfoManager.cgi?action=remove&UserID=${encodeURIComponent(personId)}`;
      console.log(`Deleting face: ${url}`);
      
      const response = await auth.request(url, "GET");
      const text = await response.text();
      console.log(`Delete face response: ${text.slice(0, 500)}`);

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
