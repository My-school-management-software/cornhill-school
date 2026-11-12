import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://cornhill-school-swart.vercel.app",
  "https://cornhill-school.vercel.app",
  "https://banking-cornhill-school.vercel.app",
  "https://library-cornhill-school.vercel.app",
  "https://parents-cornhill-school.vercel.app",
  "https://records-cornhill-school.vercel.app",
  "https://welfare-cornhill-school.vercel.app",
  "https://evidence-cornhill-school.vercel.app",
  "https://learning-cornhill-school.vercel.app",
  "https://services-cornhill-school.vercel.app",
  "https://transport-cornhill-school.vercel.app",
  "https://admissions-cornhill-school.vercel.app",
  "https://hr-payroll-cornhill-school.vercel.app",
  "https://noticeboard-cornhill-school.vercel.app",
  "https://integrations-cornhill-school.vercel.app",
  "https://notifications-cornhill-school.vercel.app",
  "https://system-health-cornhill-school.vercel.app",
  "https://school-website-cornhill-school.vercel.app",
  "https://school-calendar-cornhill-school.vercel.app",
  "https://visitor-register-cornhill-school.vercel.app",
  "https://assets-maintenance-cornhill-school.vercel.app",
  "https://staff-communications-cornhill-school.vercel.app",
]);

const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "null",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const response = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...headersFor(origin), "Content-Type": "application/json" } });

const encoder = new TextEncoder();
const roles = ["Teacher", "Headteacher", "Deputy Headteacher", "DOS"] as const;
type RoleKey = typeof roles[number];

function normalizeTitle(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function titleMatches(role: RoleKey, title: unknown) {
  const value = normalizeTitle(title);
  if (role === "Teacher") return true;
  if (role === "Headteacher") return ["headteacher", "head teacher"].includes(value);
  if (role === "Deputy Headteacher") return ["deputy headteacher", "deputy head teacher"].includes(value);
  return ["dos", "director of studies", "director of studies (dos)"].includes(value);
}
async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function verifyTarget(admin: ReturnType<typeof createClient>, userId: string, role: RoleKey) {
  const { data: profile, error } = await admin.from("user_profiles")
    .select("id,full_name,role,job_title,employment_status").eq("id", userId).maybeSingle();
  if (error || !profile || profile.employment_status !== "Active") return null;

  if (role === "Teacher") {
    if (profile.role !== "Teacher") return null;
    const { data: teacher, error: teacherError } = await admin.from("academic_teacher_directory")
      .select("id").eq("linked_user_id", userId).eq("employment_status", "Active").limit(1).maybeSingle();
    if (teacherError || !teacher) return null;
  } else {
    if (profile.role !== "Staff" || !titleMatches(role, profile.job_title)) return null;
    const { data: employee, error: employeeError } = await admin.from("school_staff_directory")
      .select("id").eq("linked_user_id", userId).eq("employment_status", "Active").limit(1).maybeSingle();
    if (employeeError || !employee) return null;
  }
  return profile;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(origin) });
  if (req.method !== "POST") return response(405, { error: "Method not allowed." }, origin);
  if (origin && !allowedOrigins.has(origin)) return response(403, { error: "This application origin is not approved." }, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const pepper = Deno.env.get("STAFF_ACCESS_CODE_PEPPER") || serviceKey;
  if (!url || !serviceKey || !anonKey || !pepper) {
    return response(500, { error: "Individual staff sign-in is not configured. Contact the Director." }, origin);
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return response(400, { error: "Invalid request." }, origin); }
  const action = String(payload.action || "");

  if (action === "issue" || action === "revoke") {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return response(401, { error: "Director sign-in is required." }, origin);
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return response(401, { error: "Director session could not be verified." }, origin);
    const { data: actor, error: actorError } = await admin.from("user_profiles")
      .select("role,employment_status").eq("id", auth.user.id).maybeSingle();
    if (actorError || actor?.role !== "Admin" || actor?.employment_status !== "Active") {
      return response(403, { error: "Only the active Director account can manage individual staff access codes." }, origin);
    }

    const userId = String(payload.user_id || "");
    const role = String(payload.role_key || "") as RoleKey;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return response(400, { error: "Choose a valid staff account." }, origin);
    }
    if (!roles.includes(role)) return response(400, { error: "This account type does not use an individual access code." }, origin);
    const target = await verifyTarget(admin, userId, role);
    if (!target) return response(409, { error: "The selected account is not an active linked account for this role." }, origin);

    if (action === "revoke") {
      const { error } = await admin.from("staff_access_codes")
        .update({ is_active: false, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (error) return response(500, { error: "The access code could not be revoked." }, origin);
      const { error: revokeAuditError } = await admin.from("staff_access_code_audit").insert({
        user_id: userId, role_key: role, action: "revoked", performed_by: auth.user.id,
      });
      if (revokeAuditError) {
        return response(500, { error: "The code is revoked, but its audit event could not be saved. Keep it revoked and contact the Director." }, origin);
      }
      return response(200, { success: true, message: "Individual access code revoked." }, origin);
    }

    const code = randomCode();
    const codeHash = await hmacHex(pepper, "cornhill-staff-access-v1:" + code);
    const { error: saveError } = await admin.from("staff_access_codes").upsert({
      user_id: userId, role_key: role, code_hash: codeHash, is_active: true,
      created_by: auth.user.id, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (saveError) return response(500, { error: "The individual access code could not be saved." }, origin);
    const { error: issueAuditError } = await admin.from("staff_access_code_audit").insert({
      user_id: userId, role_key: role, action: "issued", performed_by: auth.user.id,
    });
    if (issueAuditError) {
      await admin.from("staff_access_codes").update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId).eq("code_hash", codeHash);
      return response(500, { error: "The code could not be issued because its audit event was not saved. No active code was left in place." }, origin);
    }
    return response(200, {
      success: true, role_key: role, account_name: target.full_name, access_code: code,
      message: "Show this code to the named staff member once. It will not be displayed again.",
    }, origin);
  }

  if (action !== "login") return response(400, { error: "Invalid sign-in request." }, origin);
  const role = String(payload.role_key || "") as RoleKey;
  const code = String(payload.access_code || "").trim().toUpperCase();
  const password = String(payload.password || "");
  if (!roles.includes(role) || !/^[A-HJ-NP-Z2-9]{18}$/.test(code) || password.length < 8 || password.length > 128) {
    return response(401, { error: "The access code or password is not valid." }, origin);
  }

  const forwarded = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  if (!forwarded) return response(503, { error: "Secure sign-in could not verify this connection. Try again." }, origin);
  const ipHash = await hmacHex(pepper, "cornhill-login-rate-v1:" + forwarded);
  const { data: allowed, error: rateError } = await admin.rpc("consume_staff_access_code_attempt", {
    p_ip_hash: ipHash, p_reset: false,
  });
  if (rateError || allowed !== true) return response(429, { error: "Too many attempts. Wait 15 minutes before trying again." }, origin);

  const codeHash = await hmacHex(pepper, "cornhill-staff-access-v1:" + code);
  const { data: record, error: codeError } = await admin.from("staff_access_codes")
    .select("user_id,role_key,is_active").eq("code_hash", codeHash).eq("role_key", role).eq("is_active", true).maybeSingle();
  if (codeError || !record) return response(401, { error: "The access code or password is not valid." }, origin);

  const profile = await verifyTarget(admin, record.user_id, role);
  if (!profile) return response(401, { error: "The access code or password is not valid." }, origin);
  const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(record.user_id);
  const email = authUser?.user?.email;
  if (authLookupError || !email) return response(401, { error: "The access code or password is not valid." }, origin);

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: signedIn, error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session || signedIn.user?.id !== record.user_id) {
    return response(401, { error: "The access code or password is not valid." }, origin);
  }

  const { error: lastUsedError } = await admin.from("staff_access_codes")
    .update({ last_used_at: new Date().toISOString() }).eq("user_id", record.user_id).eq("is_active", true);
  if (lastUsedError) {
    return response(503, { error: "Your credentials were accepted, but the security record could not be completed. Sign in again or contact the Director." }, origin);
  }
  const { error: loginAuditError } = await admin.from("staff_access_code_audit").insert({
    user_id: record.user_id, role_key: role, action: "used", performed_by: record.user_id,
  });
  if (loginAuditError) {
    return response(503, { error: "Your credentials were accepted, but the sign-in audit could not be saved. Sign in again or contact the Director." }, origin);
  }
  await admin.rpc("consume_staff_access_code_attempt", { p_ip_hash: ipHash, p_reset: true });
  return response(200, {
    success: true,
    session: {
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
      expires_in: signedIn.session.expires_in,
      expires_at: signedIn.session.expires_at,
      token_type: signedIn.session.token_type,
    },
  }, origin);
});
