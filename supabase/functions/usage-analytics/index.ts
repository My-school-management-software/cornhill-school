import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SECRET_KEYS")
  ? JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default
  : (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const ANALYTICS_SECRET = Deno.env.get("USAGE_ANALYTICS_HMAC_KEY") || SERVICE_KEY;
const db = createClient(PROJECT_URL, SERVICE_KEY, { auth: { persistSession: false } });
const enc = new TextEncoder();

const WORKSPACES = new Set([
  "school_website","admissions","parent_portal","main_dashboard","staff_services",
  "academics","finance","attendance","hr_payroll","banking","evidence","records",
  "notifications","learning","library","transport","welfare","system_health",
  "noticeboard","calendar","visitor_register","asset_maintenance","other"
]);
const EVENTS = new Set([
  "page_view","admissions_form_started","admissions_form_submitted",
  "admissions_form_accepted","admissions_form_error",
  "parent_login_success","parent_login_failure"
]);
const DEVICES = new Set(["mobile","tablet","desktop","unknown"]);

function allowedOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol === "https:" && host.endsWith(".vercel.app") && host.includes("cornhill")) return value;
    if (url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1")) return value;
  } catch (_) {}
  return null;
}
function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  };
}
function reply(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
}
async function hmac(value: string) {
  if (!ANALYTICS_SECRET) throw new Error("Usage analytics HMAC secret is not configured.");
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(ANALYTICS_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value))));
}
function bearer(req: Request) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}
function cleanId(value: unknown) {
  const result = String(value || "");
  return /^[A-Za-z0-9_-]{12,100}$/.test(result) ? result : "";
}
function kampalaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}
async function activeStaffFromToken(token: string) {
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile, error: profileError } = await db.from("user_profiles")
    .select("id,role,employment_status,job_title")
    .eq("id", data.user.id).maybeSingle();
  if (profileError || !profile || profile.employment_status !== "Active") return null;
  if (!["Admin", "Teacher", "Staff"].includes(String(profile.role || ""))) return null;
  return { user: data.user, profile };
}
async function activeGuardianFromToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const { data: session, error } = await db.from("parent_portal_sessions")
    .select("id,guardian_contact_id,student_id")
    .eq("token_hash", tokenHash).is("revoked_at", null)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !session) return null;
  const { data: contact, error: contactError } = await db.from("parent_guardian_contacts")
    .select("id")
    .eq("id", session.guardian_contact_id)
    .eq("student_id", session.student_id)
    .eq("is_active", true)
    .maybeSingle();
  if (contactError || !contact) return null;
  return { contactId: contact.id, sessionId: session.id, tokenHash };
}
async function isDirector(staff: { user: { id: string }, profile: Record<string, unknown> }) {
  if (staff.profile.role !== "Admin") return false;
  const profileTitle = String(staff.profile.job_title || "").trim().toLowerCase();
  if (profileTitle === "director") return true;
  const { data, error } = await db.from("school_staff_directory")
    .select("job_title")
    .eq("linked_user_id", staff.user.id)
    .eq("employment_status", "Active")
    .limit(1).maybeSingle();
  return !error && String(data?.job_title || "").trim().toLowerCase() === "director";
}
async function trackEvent(body: Record<string, unknown>, token: string) {
  const eventType = String(body.event_type || "");
  const workspace = String(body.workspace || "");
  const device = String(body.device_class || "unknown");
  if (!EVENTS.has(eventType) || !WORKSPACES.has(workspace) || !DEVICES.has(device)) {
    return { status: 400, body: { error: "Invalid usage event." } };
  }
  if (workspace === "parent_portal" && !["page_view","parent_login_success","parent_login_failure"].includes(eventType)) {
    return { status: 400, body: { error: "Invalid Parent Portal usage event." } };
  }
  const visitorId = cleanId(body.visitor_id);
  const sessionId = cleanId(body.session_id);
  if (!visitorId || !sessionId) return { status: 400, body: { error: "A browser session identifier is required." } };

  let audience: "public" | "guardian" | "staff" = "public";
  let actorHash: string | null = null;
  let visitorHash: string | null = null;
  let sessionHash: string;

  if (token) {
    const staff = await activeStaffFromToken(token);
    if (staff) {
      audience = "staff";
      actorHash = await hmac("staff:" + staff.user.id);
      visitorHash = await hmac("visitor:" + visitorId);
      sessionHash = await hmac("session:" + sessionId);
    } else {
      const guardian = await activeGuardianFromToken(token);
      if (!guardian || workspace !== "parent_portal" ||
          !["page_view","parent_login_success"].includes(eventType)) {
        return { status: 401, body: { error: "Usage event session could not be verified." } };
      }
      audience = "guardian";
      actorHash = await hmac("guardian:" + guardian.contactId);
      visitorHash = actorHash;
      sessionHash = await hmac("parent-session:" + guardian.tokenHash);
    }
  } else {
    if (eventType === "parent_login_success") {
      return { status: 401, body: { error: "Guardian sign-in session is required." } };
    }
    audience = "public";
    visitorHash = await hmac("visitor:" + visitorId);
    sessionHash = await hmac("session:" + sessionId);
  }

  const dedupeHash = await hmac([
    audience, actorHash || visitorHash || "", sessionHash, workspace, eventType
  ].join("|"));
  const { error } = await db.from("school_usage_events").upsert({
    workspace,
    event_type: eventType,
    audience,
    device_class: device,
    visitor_hash: visitorHash,
    session_hash: sessionHash,
    actor_hash: actorHash,
    dedupe_hash: dedupeHash
  }, { onConflict: "dedupe_hash", ignoreDuplicates: true });
  if (error) {
    return { status: 500, body: { error: "Usage event could not be saved." } };
  }
  return { status: 202, body: { ok: true } };
}
async function usageReport(body: Record<string, unknown>, token: string) {
  if (!token) return { status: 401, body: { error: "Director sign-in is required." } };
  const staff = await activeStaffFromToken(token);
  if (!staff || !(await isDirector(staff))) {
    return { status: 403, body: { error: "Only the active Director can view usage analytics." } };
  }
  const start = String(body.start_date || "");
  const end = String(body.end_date || kampalaDate());
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(start) || !datePattern.test(end)) {
    return { status: 400, body: { error: "Choose valid start and end dates." } };
  }
  const from = new Date(start + "T00:00:00+03:00");
  const to = new Date(end + "T00:00:00+03:00");
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from ||
      Math.ceil((to.getTime() - from.getTime()) / 86400000) > 90 || end > kampalaDate()) {
    return { status: 400, body: { error: "Choose a valid date range of up to 90 days ending today or earlier." } };
  }
  const { data, error } = await db.rpc("get_school_usage_analytics_report", {
    p_start_date: start, p_end_date: end
  });
  if (error || !data) return { status: 500, body: { error: "Usage report is temporarily unavailable." } };
  return { status: 200, body: { report: data } };
}

Deno.serve(async (req: Request) => {
  const origin = allowedOrigin(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return origin ? new Response("ok", { status: 204, headers: cors(origin) })
      : new Response("forbidden", { status: 403 });
  }
  if (!origin) return reply({ error: "Origin is not allowed." }, 403, null);
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405, origin);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: "Request is too large." }, 413, origin);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = String(body.action || "");
    const token = bearer(req);
    const result = action === "track"
      ? await trackEvent(body, token)
      : action === "report"
        ? await usageReport(body, token)
        : { status: 400, body: { error: "Unsupported usage analytics action." } };
    return reply(result.body, result.status, origin);
  } catch (_) {
    // Deliberately do not log request bodies, session tokens or user identifiers.
    return reply({ error: "Usage analytics request could not be completed." }, 400, origin);
  }
});
