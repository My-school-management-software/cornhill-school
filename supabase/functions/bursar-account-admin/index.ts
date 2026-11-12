import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://cornhill-school-swart.vercel.app",
  "https://cornhill-school.vercel.app",
  "https://services-cornhill-school.vercel.app",
]);
const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "null",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...headersFor(origin), "Content-Type": "application/json" } });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const setupRedirect = "https://cornhill-school-swart.vercel.app/bursar-account.html";
const activeStatuses = ["inviting", "invited", "email_verified", "approved", "active"] as const;

function normalizeTitle(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function roleForJobTitle(value: unknown): "Main Bursar" | "Deputy Bursar" | null {
  const title = normalizeTitle(value);
  if (["main bursar", "bursar", "school bursar", "bursar (main)", "bursar main"].includes(title)) return "Main Bursar";
  if (["deputy bursar", "deputy school bursar", "deputy bursar (school)"].includes(title)) return "Deputy Bursar";
  return null;
}
function cleanDeliveryCode(error: unknown) {
  const value = String((error as { code?: string; name?: string })?.code || (error as { name?: string })?.name || "email_delivery_error");
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48) || "email_delivery_error";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(origin) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, origin);
  if (origin && !allowedOrigins.has(origin)) return json(403, { error: "This application origin is not approved." }, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return json(500, { error: "Bursar account service is not configured." }, origin);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "A signed-in account is required." }, origin);

  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Your session could not be verified. Sign in again." }, origin);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid request body." }, origin); }
  const action = String(payload.action || "");

  const requireDirector = async () => {
    const { data: actor, error } = await admin.from("user_profiles")
      .select("role,employment_status").eq("id", authData.user.id).maybeSingle();
    if (error || actor?.role !== "Admin" || actor?.employment_status !== "Active") return false;
    return true;
  };
  const recordEvent = async (
    enrollmentId: string,
    eventKey: string,
    performedBy: string | null,
    metadata: Record<string, unknown> = {},
  ) => {
    const { error } = await admin.from("bursar_account_enrollment_events").insert({
      enrollment_id: enrollmentId, event_key: eventKey, performed_by: performedBy, metadata,
    });
    return !error;
  };

  if (["candidates", "list", "create_invitation", "approve", "reject"].includes(action)) {
    if (!(await requireDirector())) return json(403, { error: "Only the active original Director account can manage bursar invitations." }, origin);
  }

  if (action === "candidates") {
    const { data, error } = await admin.from("school_staff_directory")
      .select("id,full_name,job_title,staff_category,employment_status,linked_user_id")
      .eq("staff_category", "Non-teaching").eq("employment_status", "Active").is("linked_user_id", null)
      .order("full_name");
    if (error) return json(500, { error: "The active employee list could not be loaded." }, origin);
    const candidates = (data || []).map((employee) => ({
      id: employee.id, full_name: employee.full_name, job_title: employee.job_title,
      role_key: roleForJobTitle(employee.job_title),
    })).filter((employee) => employee.role_key);
    return json(200, { success: true, candidates }, origin);
  }

  if (action === "list") {
    const { data, error } = await admin.from("bursar_account_enrollments")
      .select("id,staff_directory_id,auth_user_id,email,role_key,status,created_at,invitation_sent_at,email_verified_at,approved_at,activated_at,delivery_error_code")
      .order("created_at", { ascending: false }).limit(100);
    if (error) return json(500, { error: "Bursar invitation records could not be loaded." }, origin);
    const ids = (data || []).map((row) => row.staff_directory_id);
    const employeesResult = ids.length
      ? await admin.from("school_staff_directory").select("id,full_name,job_title").in("id", ids)
      : { data: [], error: null };
    if (employeesResult.error) return json(500, { error: "The linked employee details could not be loaded." }, origin);
    const byId = new Map((employeesResult.data || []).map((row) => [row.id, row]));
    const records = (data || []).map((row) => ({
      ...row,
      employee_name: byId.get(row.staff_directory_id)?.full_name || "Employee record",
      employee_job_title: byId.get(row.staff_directory_id)?.job_title || "",
    }));
    return json(200, { success: true, records }, origin);
  }

  if (action === "create_invitation") {
    const email = String(payload.email || "").trim().toLowerCase();
    const employeeId = String(payload.staff_directory_id || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json(400, { error: "Enter a valid official email address for the bursar." }, origin);
    }
    if (!uuidPattern.test(employeeId)) return json(400, { error: "Select an existing bursar employee record." }, origin);

    const { data: employee, error: employeeError } = await admin.from("school_staff_directory")
      .select("id,full_name,phone,gender,staff_category,job_title,department,responsibilities,employment_start_date,reporting_date,employment_end_date,employment_status,linked_user_id")
      .eq("id", employeeId).maybeSingle();
    if (employeeError || !employee) return json(404, { error: "The selected employee record could not be found." }, origin);
    if (employee.staff_category !== "Non-teaching" || employee.employment_status !== "Active" || employee.linked_user_id) {
      return json(409, { error: "Only an active, unlinked non-teaching employee can receive a bursar invitation." }, origin);
    }
    const roleKey = roleForJobTitle(employee.job_title);
    if (!roleKey) return json(400, { error: "The selected employee is not recorded as Main Bursar or Deputy Bursar." }, origin);

    const { data: duplicate, error: duplicateError } = await admin.from("bursar_account_enrollments")
      .select("id,status").eq("staff_directory_id", employeeId).in("status", [...activeStatuses]).limit(1).maybeSingle();
    if (duplicateError) return json(500, { error: "The employee's existing invitation status could not be checked." }, origin);
    if (duplicate) return json(409, { error: "This bursar already has an invitation or account record. Review its current status instead of creating a duplicate." }, origin);

    const { data: emailMatch, error: emailError } = await admin.from("bursar_account_enrollments")
      .select("id,status").ilike("email", email).in("status", [...activeStatuses]).limit(1).maybeSingle();
    if (emailError) return json(500, { error: "The email address could not be checked against existing bursar enrollments." }, origin);
    if (emailMatch) return json(409, { error: "This email is already assigned to another bursar enrollment." }, origin);

    const { data: enrollment, error: insertError } = await admin.from("bursar_account_enrollments").insert({
      staff_directory_id: employeeId, email, role_key: roleKey, status: "inviting", created_by: authData.user.id,
    }).select("id").single();
    if (insertError || !enrollment) return json(409, { error: "The pending bursar invitation record could not be created. Check for an existing invitation." }, origin);
    await recordEvent(enrollment.id, "invitation_requested", authData.user.id, { role_key: roleKey });

    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name: employee.full_name, cornhill_invitation_type: "bursar" },
      redirectTo: setupRedirect,
    });
    if (inviteError || !invitation?.user) {
      const code = cleanDeliveryCode(inviteError);
      await admin.from("bursar_account_enrollments").update({
        status: "delivery_failed", delivery_error_code: code, updated_at: new Date().toISOString(),
      }).eq("id", enrollment.id);
      await recordEvent(enrollment.id, "delivery_failed", authData.user.id, { error_code: code });
      return json(502, {
        success: false, status: "delivery_failed",
        error: "Supabase Auth could not accept the invitation for email delivery. No bursar login was activated. Check the school's verified SMTP settings and the invitation redirect URL, then correct the issue before trying again.",
        error_code: code,
      }, origin);
    }

    const { error: updateError } = await admin.from("bursar_account_enrollments").update({
      auth_user_id: invitation.user.id, status: "invited",
      invitation_sent_at: new Date().toISOString(), delivery_error_code: null, updated_at: new Date().toISOString(),
    }).eq("id", enrollment.id);
    if (updateError) {
      // Deliberately do not create a staff profile or link the employee if the enrollment update failed.
      return json(500, { error: "The invitation was accepted by Auth, but its secure tracking record needs repair. Do not invite again; contact the system administrator." }, origin);
    }
    await recordEvent(enrollment.id, "invitation_accepted_for_delivery", authData.user.id, { role_key: roleKey });
    return json(200, {
      success: true, status: "invited", email, employee_name: employee.full_name, role_key: roleKey,
      message: "Supabase Auth accepted the invitation for email delivery. The bursar must verify the email, wait for Director approval, and then set a private password.",
    }, origin);
  }

  if (action === "approve" || action === "reject") {
    const enrollmentId = String(payload.enrollment_id || "");
    if (!uuidPattern.test(enrollmentId)) return json(400, { error: "Select a valid bursar invitation." }, origin);
    if (action === "approve") {
      const { data, error } = await admin.from("bursar_account_enrollments")
        .update({ status: "approved", approved_by: authData.user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", enrollmentId).eq("status", "email_verified")
        .select("id,email,role_key").maybeSingle();
      if (error || !data) return json(409, { error: "Only a bursar whose email has been verified can be approved. Refresh the list and check the current status." }, origin);
      await recordEvent(enrollmentId, "director_approved", authData.user.id, { role_key: data.role_key });
      return json(200, { success: true, status: "approved", message: "Approved. The bursar can return to the secure account setup page and create a private password." }, origin);
    }
    const { data, error } = await admin.from("bursar_account_enrollments")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", enrollmentId).in("status", ["inviting", "invited", "email_verified", "approved"])
      .select("id,role_key").maybeSingle();
    if (error || !data) return json(409, { error: "This invitation cannot be rejected in its current status. Refresh the list." }, origin);
    await recordEvent(enrollmentId, "director_rejected", authData.user.id, { role_key: data.role_key });
    return json(200, { success: true, status: "rejected" }, origin);
  }

  if (action === "record_password_reset") {
    const authUser = authData.user;
    const { data: enrollment, error } = await admin.from("bursar_account_enrollments")
      .select("id,email,role_key,status")
      .eq("auth_user_id", authUser.id).eq("status", "active").maybeSingle();
    const confirmedAt = authUser.email_confirmed_at || authUser.confirmed_at || null;
    if (error || !enrollment || !confirmedAt ||
        String(authUser.email || "").toLowerCase() !== enrollment.email.toLowerCase()) {
      return json(403, { error: "This password reset is not attached to an active verified bursar account." }, origin);
    }
    const recorded = await recordEvent(enrollment.id, "password_reset_completed", authUser.id, {
      role_key: enrollment.role_key,
    });
    if (!recorded) return json(500, { error: "The password changed, but the school audit record could not be saved. Contact the Director." }, origin);
    return json(200, { success: true, status: "active", message: "Your password reset has been recorded." }, origin);
  }

  if (action === "verify_email" || action === "status" || action === "complete_setup") {
    const authUser = authData.user;
    const { data: enrollment, error } = await admin.from("bursar_account_enrollments")
      .select("id,email,role_key,status,email_verified_at,approved_at")
      .eq("auth_user_id", authUser.id).maybeSingle();
    if (error || !enrollment) return json(404, { error: "No bursar invitation is attached to this signed-in account." }, origin);
    const confirmedAt = authUser.email_confirmed_at || authUser.confirmed_at || null;

    if (action === "verify_email") {
      if (!confirmedAt || String(authUser.email || "").toLowerCase() !== enrollment.email.toLowerCase()) {
        return json(403, { error: "The invitation email has not yet been verified for this account." }, origin);
      }
      if (enrollment.status === "invited") {
        const { error: updateError } = await admin.from("bursar_account_enrollments").update({
          status: "email_verified", email_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", enrollment.id).eq("status", "invited");
        if (updateError) return json(500, { error: "Your email is verified, but the invitation status could not be updated. Contact the Director." }, origin);
        await recordEvent(enrollment.id, "email_verified", authUser.id, { role_key: enrollment.role_key });
        enrollment.status = "email_verified";
      }
    }

    if (action === "complete_setup") {
      if (!confirmedAt || enrollment.status !== "approved") {
        return json(403, { error: "The email must be verified and the Director must approve the account before activation." }, origin);
      }
      const { data: activated, error: activationError } = await admin.rpc("activate_bursar_account_enrollment", {
        p_enrollment_id: enrollment.id, p_auth_user_id: authUser.id,
      });
      if (activationError || !activated?.success) {
        return json(409, { error: "The password was updated, but the school account could not be activated. Do not create another invitation; contact the Director to repair this enrollment." }, origin);
      }
      return json(200, { success: true, status: "active", message: "Your CORNHILL bursar account is now active." }, origin);
    }

    return json(200, {
      success: true, status: enrollment.status, email: enrollment.email,
      role_key: enrollment.role_key, email_verified: !!confirmedAt,
    }, origin);
  }

  return json(400, { error: "Unknown bursar account action." }, origin);
});
