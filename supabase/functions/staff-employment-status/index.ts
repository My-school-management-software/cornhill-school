import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return json(500, { error: "Staff access service is not configured." });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Please sign in as the active Director." });

  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Your administrator session could not be verified. Sign in again." });

  const actorId = authData.user.id;
  const { data: actor, error: actorError } = await admin
    .from("user_profiles")
    .select("role,employment_status")
    .eq("id", actorId)
    .single();

  if (actorError || actor?.role !== "Admin" || actor?.employment_status !== "Active") {
    return json(403, { error: "Only the active Director account can change staff employment access." });
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid request body." }); }

  const staffUserId = String(payload.staff_user_id || "").trim();
  const employmentStatus = String(payload.employment_status || "").trim();
  const employmentEndDate = payload.employment_end_date == null || payload.employment_end_date === ""
    ? null
    : String(payload.employment_end_date).trim();

  if (!UUID_RE.test(staffUserId)) return json(400, { error: "Choose a valid staff account." });
  if (staffUserId === actorId) return json(403, { error: "The Director account cannot change its own employment access here." });
  if (!["Active", "On Leave", "Exited"].includes(employmentStatus)) {
    return json(400, { error: "Choose Active, On Leave or Exited." });
  }
  if (employmentEndDate !== null && !validDate(employmentEndDate)) {
    return json(400, { error: "Enter a valid employment end date." });
  }
  if (employmentStatus === "Exited" && employmentEndDate === null) {
    return json(400, { error: "Enter the employee's final working date before marking the account Exited." });
  }

  const { data: target, error: targetError } = await admin
    .from("user_profiles")
    .select("id,role,employment_status")
    .eq("id", staffUserId)
    .single();

  if (targetError || !target) return json(404, { error: "The selected staff account could not be found." });
  if (!["Teacher", "Staff"].includes(String(target.role))) {
    return json(403, { error: "Only Teacher and non-teaching Staff accounts can be changed here. The existing Director account is protected." });
  }

  // Reactivation must never unlock an account whose role-specific employee
  // record is missing. Teachers link to the academic teacher directory; other
  // staff link to the school employee directory.
  if (employmentStatus === "Active") {
    if (target.role === "Teacher") {
      const { data: teacherLink, error: teacherLinkError } = await admin
        .from("academic_teacher_directory")
        .select("id")
        .eq("linked_user_id", staffUserId)
        .maybeSingle();
      if (teacherLinkError || !teacherLink) {
        return json(409, { error: "This teacher account has no single linked teacher-directory record. Sign-in remains blocked until the Director repairs the existing identity link." });
      }
    } else {
      const { data: employeeLink, error: employeeLinkError } = await admin
        .from("school_staff_directory")
        .select("id")
        .eq("linked_user_id", staffUserId)
        .maybeSingle();
      if (employeeLinkError || !employeeLink) {
        return json(409, { error: "This staff account has no single linked employee record. Sign-in remains blocked until the Director repairs the existing identity link." });
      }
    }
  }

  // For suspension, update the authoritative profile status first. The school's
  // RLS helpers (including is_active_staff_session) read this row on every request,
  // so an already-issued JWT is denied by those policies after this update commits.
  // Auth bans prevent future sign-in/refresh but do NOT revoke an already-issued JWT.
  if (employmentStatus !== "Active") {
    const { error: inactiveProfileError } = await admin
      .from("user_profiles")
      .update({ employment_status: employmentStatus, employment_end_date: employmentEndDate })
      .eq("id", staffUserId);
    if (inactiveProfileError) {
      return json(500, { error: "The staff profile could not be marked inactive. No directory status was changed and the account still requires administrator review.", access_blocked: false });
    }
    const { error: banError } = await admin.auth.admin.updateUserById(staffUserId, { ban_duration: "876000h" });
    if (banError) {
      return json(502, { error: "The profile is marked inactive and school RLS checks will deny access, but the Auth sign-in ban could not be applied. Keep this account under administrator review.", access_blocked: true });
    }
  } else {
    // Remove the Auth ban while the stored profile remains non-active. The profile
    // is reactivated only after both linked directory records are synchronised.
    const { error: unbanError } = await admin.auth.admin.updateUserById(staffUserId, { ban_duration: "none" });
    if (unbanError) return json(502, { error: "The staff records were not reactivated because the authentication service could not restore account access." });
  }

  // Synchronise exactly the directory that owns this account's staff identity.
  // Teaching accounts are represented in academic_teacher_directory; non-teaching
  // accounts are represented in school_staff_directory. Do not expect both rows.
  let directoryError: string | null = null;
  if (target.role === "Teacher") {
    const { data: teacherRows, error: teacherError } = await admin
      .from("academic_teacher_directory")
      .update({ employment_status: employmentStatus })
      .eq("linked_user_id", staffUserId)
      .select("id");
    if (teacherError || teacherRows?.length !== 1) {
      directoryError = "exactly one linked teacher-directory record could not be synchronised";
    }
  } else {
    const { data: employeeRows, error: employeeError } = await admin
      .from("school_staff_directory")
      .update({ employment_status: employmentStatus, employment_end_date: employmentEndDate })
      .eq("linked_user_id", staffUserId)
      .select("id");
    if (employeeError || employeeRows?.length !== 1) {
      directoryError = "exactly one linked employee record could not be synchronised";
    }
  }
  if (directoryError) {
    return json(500, {
      error: `Authentication access has been updated, but ${directoryError}. Keep this account under administrator review; do not create a second staff record.`,
      access_blocked: employmentStatus !== "Active",
    });
  }

  // Reactivation is deliberately last: profile-based RLS continues to deny
  // requests until the employee and academic teacher directories are both active.
  if (employmentStatus === "Active") {
    const { error: profileUpdateError } = await admin
      .from("user_profiles")
      .update({ employment_status: employmentStatus, employment_end_date: employmentEndDate })
      .eq("id", staffUserId);
    if (profileUpdateError) {
      return json(500, {
        error: "The Auth ban was lifted and linked directories were updated, but the account profile remains non-active. Access remains blocked until an administrator repairs the profile.",
        access_blocked: true,
      });
    }
  }

  return json(200, {
    success: true,
    staff_user_id: staffUserId,
    employment_status: employmentStatus,
    access_blocked: employmentStatus !== "Active",
    message: employmentStatus === "Active"
      ? "Staff employment status is active and sign-in access has been restored."
      : "Staff sign-in access has been suspended. Employee, teacher and historical school records have been preserved.",
  });
});
