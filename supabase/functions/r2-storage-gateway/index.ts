import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SECRET_KEYS")
  ? JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default
  : (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf"
]);
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf"
};

const ALLOWED_ORIGINS = new Set([
  "https://evidence-cornhill-school.vercel.app",
  "https://cornhill-school-swart.vercel.app"
]);

function originAllowed(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^https:\/\/(?:evidence-cornhill-school|cornhill-school)-[a-z0-9-]+-cypher-projects1\.vercel\.app$/.test(origin);
}
function corsHeaders(origin: string) {
  const allowed = originAllowed(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json"
  };
}
function json(data: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}
function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function r2Config() {
  const values = {
    accountId: Deno.env.get("R2_ACCOUNT_ID") || "",
    bucket: Deno.env.get("R2_BUCKET_NAME") || "",
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || ""
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  return { ...values, configured: missing.length === 0, missing };
}
async function requireStaff(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("A signed-in staff account is required.");
  const { data: authData, error: authError } = await adminDb.auth.getUser(token);
  if (authError || !authData.user) throw new Error("Your staff session is invalid or has expired.");
  let claims: Record<string, unknown>;
  try {
    const payload = token.split(".")[1];
    if (!payload) throw new Error("Missing JWT payload");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
  } catch {
    throw new Error("Your staff session could not be verified.");
  }
  const sessionId = String(claims.session_id || "");
  if (!isUuid(sessionId)) throw new Error("Your staff session is no longer active. Please sign in again.");
  const { data: sessionActive, error: sessionCheckError } = await adminDb.rpc(
    "cornhill_auth_session_is_active",
    { p_session_id: sessionId, p_user_id: authData.user.id }
  );
  if (sessionCheckError || sessionActive !== true) {
    throw new Error("Your staff session has ended. Please sign in again.");
  }
  const { data: profile, error } = await adminDb
    .from("user_profiles")
    .select("id,role,employment_status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error || !profile || profile.employment_status !== "Active") {
    throw new Error("Only an active CORNHILL staff account can use evidence storage.");
  }
  if (!["Admin", "Teacher", "Staff"].includes(String(profile.role || ""))) {
    throw new Error("This account is not authorised for evidence capture.");
  }
  return { user: authData.user, profile, isAdmin: profile.role === "Admin" };
}
async function getPendingRequest(requestId: string, userId: string, isAdmin: boolean) {
  if (!isUuid(requestId)) throw new Error("The evidence request identifier is invalid.");
  const { data: request, error } = await adminDb
    .from("evidence_capture_requests")
    .select("id,requested_by,assigned_user_id,assigned_device_id,status,expires_at")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !request) throw new Error("The evidence request could not be found.");
  if (request.status !== "Pending" || new Date(request.expires_at).getTime() <= Date.now()) {
    throw new Error("This evidence request is no longer open for uploads.");
  }
  if (isAdmin && request.requested_by === userId) return request;
  if (request.assigned_user_id === userId && request.assigned_device_id) {
    const { data: device, error: deviceError } = await adminDb
      .from("evidence_capture_devices")
      .select("id,status,assigned_user_id")
      .eq("id", request.assigned_device_id)
      .maybeSingle();
    if (!deviceError && device && device.status === "Active" && device.assigned_user_id === userId) {
      return request;
    }
  }
  throw new Error("You are not the requester or the currently assigned staff member for this evidence request.");
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    "%" + char.charCodeAt(0).toString(16).toUpperCase()
  );
}
function encodePath(path: string) {
  return path.split("/").map(awsEncode).join("/");
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
async function hmac(key: Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}
async function signingKey(secret: string, date: string) {
  const dateKey = await hmac(new TextEncoder().encode("AWS4" + secret), date);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  return await hmac(serviceKey, "aws4_request");
}
async function presign(method: string, key: string, expiresSeconds: number) {
  const cfg = r2Config();
  if (!cfg.configured) throw new Error("Cloudflare R2 is not configured yet.");
  if (!/^[A-Za-z0-9._/-]+$/.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error("The storage object path is invalid.");
  }
  const host = cfg.accountId + ".r2.cloudflarestorage.com";
  const uri = "/" + encodePath(cfg.bucket) + "/" + encodePath(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const scope = shortDate + "/auto/s3/aws4_request";
  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", cfg.accessKeyId + "/" + scope],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "host"]
  ];
  const canonicalQuery = params
    .map(([k, v]) => [awsEncode(k), awsEncode(v)] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => k + "=" + v)
    .join("&");
  const canonicalRequest = [
    method,
    uri,
    canonicalQuery,
    "host:" + host + "\n",
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256(canonicalRequest)
  ].join("\n");
  const keyBytes = await signingKey(cfg.secretAccessKey, shortDate);
  const signature = hex(await hmac(keyBytes, stringToSign));
  return {
    url: "https://" + host + uri + "?" + canonicalQuery + "&X-Amz-Signature=" + signature,
    expires_in: expiresSeconds
  };
}
function r2ObjectPath(value: unknown, requestId: string) {
  const path = cleanText(value, 500);
  if (!path.startsWith(requestId + "/r2/") || path.includes("..") || path.startsWith("/")) {
    throw new Error("The R2 object path does not belong to this evidence request.");
  }
  return path;
}


function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
async function readR2Usage() {
  const cfg = r2Config();
  if (!cfg.configured) throw new Error("Cloudflare R2 is not configured yet.");
  const host = cfg.accountId + ".r2.cloudflarestorage.com";
  const uri = "/" + encodePath(cfg.bucket);
  const maxKeys = 1000;
  const maxPages = 50;
  let continuationToken: string | null = null;
  let objectCount = 0;
  let payloadBytes = 0;
  let pagesScanned = 0;
  let complete = true;

  while (pagesScanned < maxPages) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\\.\\d{3}/g, "");
    const shortDate = amzDate.slice(0, 8);
    const scope = shortDate + "/auto/s3/aws4_request";
    const params: Array<[string, string]> = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential", cfg.accessKeyId + "/" + scope],
      ["X-Amz-Date", amzDate],
      ["X-Amz-Expires", "60"],
      ["X-Amz-SignedHeaders", "host"],
      ["list-type", "2"],
      ["max-keys", String(maxKeys)]
    ];
    if (continuationToken) params.push(["continuation-token", continuationToken]);
    const canonicalQuery = params
      .map(([key, value]) => [awsEncode(key), awsEncode(value)] as [string, string])
      .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)
      .map(([key, value]) => key + "=" + value)
      .join("&");
    const canonicalRequest = [
      "GET",
      uri,
      canonicalQuery,
      "host:" + host + "\\n",
      "host",
      "UNSIGNED-PAYLOAD"
    ].join("\\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      await sha256(canonicalRequest)
    ].join("\\n");
    const keyBytes = await signingKey(cfg.secretAccessKey, shortDate);
    const signature = hex(await hmac(keyBytes, stringToSign));
    const url = "https://" + host + uri + "?" + canonicalQuery + "&X-Amz-Signature=" + signature;
    const response = await fetch(url, { method: "GET" });
    const xml = await response.text();
    if (!response.ok) {
      console.error("R2 usage listing failed:", response.status, xml.slice(0, 400));
      throw new Error("Cloudflare R2 could not return bucket usage (HTTP " + response.status + ").");
    }

    const sizes = [...xml.matchAll(/<Size>(\\d+)<\\/Size>/g)].map((match) => Number(match[1]));
    objectCount += sizes.length;
    payloadBytes += sizes.reduce((sum, size) => sum + size, 0);
    pagesScanned++;

    const isTruncated = /<IsTruncated>true<\\/IsTruncated>/i.test(xml);
    if (!isTruncated) break;
    const nextToken = xml.match(/<NextContinuationToken>([\\s\\S]*?)<\\/NextContinuationToken>/i)?.[1];
    if (!nextToken) {
      complete = false;
      break;
    }
    continuationToken = decodeXml(nextToken);
    if (pagesScanned >= maxPages) complete = false;
  }

  return {
    provider: "Cloudflare R2",
    bucket: cfg.bucket,
    object_count: objectCount,
    payload_bytes: payloadBytes,
    pages_scanned: pagesScanned,
    complete,
    scan_limit: maxPages * maxKeys,
    measured_at: new Date().toISOString()
  };
}

async function handle(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);
  if (!originAllowed(origin)) return json({ error: "This application origin is not approved for evidence storage." }, 403, origin);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Invalid request." }, 400, origin);

  try {
    const session = await requireStaff(req);
    const action = cleanText(body.action, 40);

    if (action === "status") {
      const cfg = r2Config();
      return json({
        provider: "Cloudflare R2",
        configured: cfg.configured,
        missing: cfg.configured ? [] : cfg.missing
      }, 200, origin);
    }

    if (action === "usage") {
      if (!session.isAdmin) return json({ error: "Only administrators can view cloud storage usage." }, 403, origin);
      const usage = await readR2Usage();
      return json(usage, 200, origin);
    }

    const requestId = cleanText(body.request_id, 60);

    if (action === "presign-upload") {
      const request = await getPendingRequest(requestId, session.user.id, session.isAdmin);
      const contentType = cleanText(body.content_type, 100).toLowerCase();
      const sizeBytes = Number(body.size_bytes);
      if (!ALLOWED_TYPES.has(contentType) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
        return json({ error: "Only JPG, PNG, WebP and PDF files up to 15 MB are accepted." }, 400, origin);
      }
      const extension = EXTENSIONS[contentType];
      const storagePath = request.id + "/r2/" + crypto.randomUUID() + "." + extension;
      const signed = await presign("PUT", storagePath, 300);
      return json({ url: signed.url, storage_path: storagePath, expires_in: signed.expires_in }, 200, origin);
    }

    if (action === "verify-upload") {
      await getPendingRequest(requestId, session.user.id, session.isAdmin);
      const storagePath = r2ObjectPath(body.storage_path, requestId);
      const contentType = cleanText(body.content_type, 100).toLowerCase();
      const sizeBytes = Number(body.size_bytes);
      if (!ALLOWED_TYPES.has(contentType) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
        return json({ error: "The uploaded file metadata is invalid." }, 400, origin);
      }
      const signed = await presign("HEAD", storagePath, 60);
      const response = await fetch(signed.url, { method: "HEAD" });
      if (!response.ok) return json({ error: "The R2 upload could not be verified. Check the bucket CORS settings and retry." }, 409, origin);
      const actualSize = Number(response.headers.get("content-length") || 0);
      const actualType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (actualSize !== sizeBytes || actualType !== contentType) {
        const remove = await presign("DELETE", storagePath, 60);
        await fetch(remove.url, { method: "DELETE" }).catch(() => {});
        return json({ error: "The uploaded file did not match the selected file size or type. It was not attached to the school record." }, 422, origin);
      }
      return json({ verified: true, storage_path: storagePath, size_bytes: actualSize, content_type: actualType }, 200, origin);
    }

    if (action === "delete-orphan") {
      await getPendingRequest(requestId, session.user.id, session.isAdmin);
      const storagePath = r2ObjectPath(body.storage_path, requestId);
      const signed = await presign("DELETE", storagePath, 60);
      const response = await fetch(signed.url, { method: "DELETE" });
      if (!response.ok && response.status !== 404) return json({ error: "The unlinked R2 object could not be removed. Contact the administrator." }, 502, origin);
      return json({ deleted: true }, 200, origin);
    }

    if (action === "presign-download") {
      const fileId = cleanText(body.file_id, 60);
      if (!isUuid(fileId)) return json({ error: "The evidence file identifier is invalid." }, 400, origin);
      const { data: file, error } = await adminDb
        .from("evidence_capture_files")
        .select("id,request_id,storage_path,uploaded_by")
        .eq("id", fileId)
        .maybeSingle();
      if (error || !file) return json({ error: "The evidence file could not be found." }, 404, origin);
      if (!session.isAdmin && file.uploaded_by !== session.user.id) {
        return json({ error: "You are not authorised to open this evidence file." }, 403, origin);
      }
      const storagePath = r2ObjectPath(file.storage_path, file.request_id);
      const signed = await presign("GET", storagePath, 600);
      return json({ url: signed.url, expires_in: signed.expires_in }, 200, origin);
    }

    return json({ error: "Unknown R2 storage action." }, 400, origin);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : "Storage request failed.");
    const status = /session|authorised|assigned|active CORNHILL|active staff/i.test(message) ? 403 : 400;
    console.error("R2 gateway request rejected:", message);
    return json({ error: message }, status, origin);
  }
}

Deno.serve(handle);
