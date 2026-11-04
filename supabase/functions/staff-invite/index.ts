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
    .from("user_profiles").select("role").eq("id", authData.user.id).single();
  if (actorError || actor?.role !== "Admin") return json(403, { error: "Only a school administrator can invite staff." });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid request body." }); }

  const email = String(payload.email || "").trim().toLowerCase();
  const fullName = String(payload.full_name || "").trim();
  const role = String(payload.role || "Teacher");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid staff email address." });
  if (fullName.length < 2 || fullName.length > 120) return json(400, { error: "Enter the staff member's full name." });
  if (!["Teacher", "Staff"].includes(role)) return json(400, { error: "Choose Teacher or Staff. Administrator access is not granted through staff invitations." });

  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name: fullName },
  });
  if (inviteError || !invitation.user) {
    const detail = inviteError?.message || "The invitation could not be sent.";
    return json(400, { error: detail });
  }

  const { error: profileError } = await admin.from("user_profiles").upsert({
    id: invitation.user.id,
    full_name: fullName,
    role,
    employment_status: "Active",
  }, { onConflict: "id" });

  if (profileError) {
    // Keep the newly-created Auth identity, but report that profile setup needs administrator attention.
    return json(500, { error: "The invitation was created, but the staff profile could not be saved. Contact support before inviting this person again." });
  }

  return json(200, { success: true, email, full_name: fullName, role, message: "Invitation email sent. The staff member must accept it and set a password before signing in." });
});
