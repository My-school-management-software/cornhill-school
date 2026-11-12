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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return json(500, { error: "Staff invitation service is not configured." });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Please sign in as a school administrator." });

  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Your session could not be verified. Sign in again." });

  const { data: actor, error: actorError } = await admin
    .from("user_profiles").select("role,employment_status").eq("id", authData.user.id).single();
  if (actorError || actor?.role !== "Admin" || actor?.employment_status !== "Active") return json(403, { error: "Only the active Director account can invite staff." });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid request body." }); }

  const email = String(payload.email || "").trim().toLowerCase();
  const fullNameInput = String(payload.full_name || "").trim();
  const role = String(payload.role || "Teacher");
  const staffDirectoryId = String(payload.staff_directory_id || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid staff email address." });
  if (fullNameInput.length < 2 || fullNameInput.length > 120) return json(400, { error: "Enter the staff member's full name." });
  if (!["Teacher", "Staff"].includes(role)) return json(400, { error: "Choose Teacher or Staff. Administrator access is not granted through staff invitations." });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(staffDirectoryId)) {
    return json(400, { error: "Select an existing employee record before sending the invitation." });
  }

  const { data: employee, error: employeeError } = await admin
    .from("school_staff_directory")
    .select("id,full_name,phone,gender,staff_category,job_title,department,responsibilities,employment_start_date,reporting_date,employment_end_date,employment_status,linked_user_id")
    .eq("id", staffDirectoryId)
    .is("linked_user_id", null)
    .single();
  if (employeeError || !employee) return json(409, { error: "The selected employee record is already linked or no longer available. Refresh Staff profiles and select it again." });
  if (employee.employment_status !== "Active") return json(400, { error: "Only an active employee record can be invited to sign in." });

  const expectedRole = employee.staff_category === "Teaching" ? "Teacher" : "Staff";
  if (role !== expectedRole) return json(400, { error: "The invitation role does not match the selected employee's teaching / non-teaching category." });
  const normalizedJobTitle = String(employee.job_title || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (role === "Staff" && ["director", "school director"].includes(normalizedJobTitle)) {
    return json(409, { error: "The Director's original full-access account is reserved and cannot be recreated through staff invitations." });
  }
  const fullName = String(employee.full_name || "").trim();
  if (fullNameInput.toLocaleLowerCase() !== fullName.toLocaleLowerCase()) {
    return json(400, { error: "The typed name does not match the selected employee record. Refresh the form and choose the correct employee." });
  }

  let teacherDirectoryId: string | null = null;
  let teacherDirectoryPhone: string | null = null;
  let createTeacherDirectory = false;
  if (role === "Teacher") {
    const { data: matches, error: teacherLookupError } = await admin
      .from("academic_teacher_directory")
      .select("id,full_name,phone,linked_user_id")
      .eq("full_name", fullName)
      .limit(5);
    if (teacherLookupError) return json(500, { error: "The teacher directory could not be checked. No invitation was sent." });
    const candidates = matches || [];
    if (candidates.length > 1) return json(409, { error: "More than one teacher-directory entry has this exact name. Resolve the teacher record before inviting; no new account was created." });
    if (candidates.length === 1) {
      const candidate = candidates[0];
      if (candidate.linked_user_id) return json(409, { error: "A teacher-directory record with this name is already linked to an account. Check the existing account instead of creating another." });
      const normalizePhone = (value: string | null) => String(value || "").replace(/[^0-9]/g, "");
      if (candidate.phone && employee.phone && normalizePhone(candidate.phone) !== normalizePhone(employee.phone)) {
        return json(409, { error: "The teacher-directory phone does not match this employee record. Resolve the identity link before inviting." });
      }
      teacherDirectoryId = candidate.id;
      teacherDirectoryPhone = candidate.phone;
    } else {
      createTeacherDirectory = true;
    }
  }

  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name: fullName },
  });
  if (inviteError || !invitation.user) {
    const detail = inviteError?.message || "The invitation could not be sent.";
    return json(400, { error: detail });
  }

  const invitedUserId = invitation.user.id;
  const { error: profileError } = await admin.from("user_profiles").upsert({
    id: invitedUserId,
    full_name: fullName,
    role,
    phone: employee.phone,
    gender: employee.gender,
    staff_category: employee.staff_category,
    job_title: employee.job_title,
    department: employee.department,
    responsibilities: employee.responsibilities,
    employment_start_date: employee.employment_start_date,
    reporting_date: employee.reporting_date,
    employment_end_date: employee.employment_end_date,
    employment_status: employee.employment_status,
  }, { onConflict: "id" });
  if (profileError) {
    return json(500, { error: "The invitation was created, but the staff profile could not be saved. Do not invite again; ask the administrator to repair this account." });
  }

  const { data: linkedEmployee, error: linkError } = await admin
    .from("school_staff_directory")
    .update({ linked_user_id: invitedUserId })
    .eq("id", staffDirectoryId)
    .is("linked_user_id", null)
    .select("id")
    .maybeSingle();
  if (linkError || !linkedEmployee) {
    return json(500, { error: "The invitation and account were created, but the employee-directory link could not be completed. Do not invite again; repair the existing account link." });
  }

  if (role === "Teacher") {
    if (teacherDirectoryId) {
      const { data: linkedTeacher, error: teacherLinkError } = await admin
        .from("academic_teacher_directory")
        .update({ linked_user_id: invitedUserId, employment_status: "Active", phone: employee.phone || teacherDirectoryPhone })
        .eq("id", teacherDirectoryId)
        .is("linked_user_id", null)
        .select("id")
        .maybeSingle();
      if (teacherLinkError || !linkedTeacher) {
        return json(500, { error: "The account was invited and linked to the employee, but its teacher-directory link needs administrator repair. Do not invite again." });
      }
    } else if (createTeacherDirectory) {
      const { error: teacherCreateError } = await admin.from("academic_teacher_directory").insert({
        full_name: fullName,
        phone: employee.phone,
        subject_specialism: employee.job_title,
        linked_user_id: invitedUserId,
        employment_status: "Active",
        created_by: authData.user.id,
      });
      if (teacherCreateError) {
        return json(500, { error: "The account was invited and linked to the employee, but the teacher-directory entry could not be created. Do not invite again; repair the existing account." });
      }
    }
  }

  return json(200, {
    success: true,
    email,
    full_name: fullName,
    role,
    user_id: invitedUserId,
    employee_record_id: staffDirectoryId,
    message: "Invitation email sent. The new account is linked to the employee record. The staff member must accept the email and set a password before signing in.",
  });
});
