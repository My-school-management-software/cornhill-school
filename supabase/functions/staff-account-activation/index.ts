import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAGE = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#14532d\">\n<title>CORNHILL · Staff account activation</title>\n<style>\n:root{color-scheme:light;--ink:#17251c;--muted:#647267;--line:#dce7de;--green:#14532d;--soft:#f3f7f3}\n*{box-sizing:border-box}body{margin:0;background:var(--soft);color:var(--ink);font-family:Inter,system-ui,Arial,sans-serif;padding:18px;line-height:1.5}\nmain{width:min(100%,920px);margin:0 auto}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:clamp(18px,4vw,30px);margin:0 0 16px;box-shadow:0 10px 30px #183a2110}\n.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}.mark{width:46px;height:46px;background:var(--green);color:white;border-radius:13px;display:grid;place-items:center;font-size:24px;font-weight:900}.brand strong{display:block;font-size:13px}.brand small,.muted{color:var(--muted);font-size:13px}\nh1{font-size:clamp(24px,5vw,34px);margin:0 0 8px}h2{font-size:20px;margin:0 0 8px}h3{font-size:16px;margin:0 0 5px}\np{margin:8px 0 14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}\nlabel{display:block;font-size:13px;font-weight:750;margin:10px 0 5px}\ninput{width:100%;border:1px solid #cbd8ce;border-radius:10px;padding:13px;font:inherit;min-width:0}\nbutton{border:0;border-radius:10px;padding:12px 15px;background:var(--green);color:#fff;font:inherit;font-weight:750;cursor:pointer}\nbutton.secondary{background:#e8f0e9;color:var(--green)}button.danger{background:#9f1239}button:disabled{opacity:.55;cursor:wait}\n.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.notice{padding:12px 14px;border-radius:10px;background:#eff6ff;color:#1e40af;margin:12px 0;font-size:13px;white-space:pre-wrap}.notice.error{background:#fff1f2;color:#9f1239}.notice.success{background:#ecfdf3;color:#166534}\n.hidden{display:none!important}.item{border:1px solid var(--line);border-radius:12px;padding:14px;margin:10px 0}.item-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.pill{font-size:11px;padding:4px 8px;border-radius:999px;background:#edf4ee;color:#245235;white-space:nowrap}.code{font-size:18px;letter-spacing:1.5px;word-break:break-all;background:#f5f7f5;border-radius:8px;padding:9px;margin:8px 0;font-weight:900}\nhr{border:0;border-top:1px solid var(--line);margin:22px 0}footer{font-size:12px;color:var(--muted);text-align:center;padding:4px}\n@media(max-width:520px){body{padding:10px}.item-top{display:block}.pill{display:inline-block;margin-top:7px}.actions button{flex:1}}\n</style>\n</head>\n<body>\n<main>\n<header class=\"card\">\n  <div class=\"brand\"><div class=\"mark\">C</div><div><strong>CORNHILL NURSERY AND PRIMARY SCHOOL</strong><small>Secure individual staff accounts</small></div></div>\n  <h1>Staff account activation</h1>\n  <p class=\"muted\">A Director-issued activation code can be used once. The staff member enters their own email address and chooses a private password. The Director never sees or receives that password.</p>\n  <div class=\"notice\">Keep activation codes private. They expire after seven days and can only be redeemed once. Every staff member must use their own account.</div>\n</header>\n\n<section class=\"card\">\n  <h2>Activate your staff account</h2>\n  <p class=\"muted\">Complete this section only after the Director has given you a one-time activation code.</p>\n  <form id=\"activateForm\">\n    <div class=\"grid\">\n      <div><label for=\"activationCode\">One-time activation code</label><input id=\"activationCode\" autocomplete=\"off\" autocapitalize=\"characters\" spellcheck=\"false\" minlength=\"18\" maxlength=\"18\" required></div>\n      <div><label for=\"activationEmail\">Your own email address</label><input id=\"activationEmail\" type=\"email\" autocomplete=\"email\" maxlength=\"254\" required></div>\n      <div><label for=\"activationPassword\">Create your private password</label><input id=\"activationPassword\" type=\"password\" autocomplete=\"new-password\" minlength=\"12\" required></div>\n      <div><label for=\"activationConfirm\">Confirm your password</label><input id=\"activationConfirm\" type=\"password\" autocomplete=\"new-password\" minlength=\"12\" required></div>\n    </div>\n    <p class=\"muted\">Use at least 12 characters. Do not give your password to the Director, another staff member, or anyone else.</p>\n    <div class=\"actions\"><button id=\"activateButton\" type=\"submit\">Activate my account</button></div>\n  </form>\n  <div id=\"activationResult\" class=\"notice hidden\" role=\"status\" aria-live=\"polite\"></div>\n</section>\n\n<section class=\"card\">\n  <h2>Director account control</h2>\n  <p class=\"muted\">Sign in using the existing Director account. These controls are available only after the server independently confirms that the account is the active Director.</p>\n  <form id=\"directorLoginForm\" class=\"grid\">\n    <div><label for=\"directorEmail\">Director email</label><input id=\"directorEmail\" type=\"email\" autocomplete=\"username\" required></div>\n    <div><label for=\"directorPassword\">Director password</label><input id=\"directorPassword\" type=\"password\" autocomplete=\"current-password\" required></div>\n    <div class=\"actions\"><button id=\"directorLoginButton\" type=\"submit\">Sign in as Director</button><button id=\"directorSignOut\" type=\"button\" class=\"secondary hidden\">Sign out</button></div>\n  </form>\n  <div id=\"directorMessage\" class=\"notice hidden\" role=\"status\" aria-live=\"polite\"></div>\n  <div id=\"directorPanel\" class=\"hidden\">\n    <hr>\n    <h2>Existing staff sign-in codes</h2>\n    <p class=\"muted\">Issue or revoke a personal sign-in code for an already activated Teacher, Headteacher, Deputy Headteacher or DOS account. Codes are shown once and stored only as a secure hash.</p>\n    <div id=\"existingAccounts\"></div>\n    <hr>\n    <h2>New staff activation codes</h2>\n    <p class=\"muted\">Issue a single-use activation code for an active, unlinked Bursar, Headteacher, Deputy Headteacher or DOS employee record. The staff member chooses their email and password when redeeming it.</p>\n    <div id=\"activationTargets\"></div>\n  </div>\n</section>\n<footer>Never share passwords or activation links. The Director's original full-access account is not used for staff activation.</footer>\n</main>\n\n<script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script>\n<script>\n\"use strict\";\nconst SUPABASE_URL=\"https://yemhortbudwbcrzsoozk.supabase.co\";\nconst SUPABASE_KEY=\"sb_publishable_jmw4qoKOkV2ga9GiZ5n1sg_dQoHnE97\";\nconst authClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:\"cornhill-director-activation-v1\"}});\nconst $=id=>document.getElementById(id);\nlet directorSession=null;\nfunction note(id,message,type){const el=$(id);el.textContent=message;el.className=\"notice\"+(type===\"error\"?\" error\":type===\"success\"?\" success\":\"\");el.classList.remove(\"hidden\")}\nasync function api(action,data={},authenticated=true){\n const headers={\"Content-Type\":\"application/json\"};\n if(authenticated){if(!directorSession?.access_token)throw new Error(\"Sign in with the Director account first.\");headers.Authorization=\"Bearer \"+directorSession.access_token}\n const response=await fetch(location.pathname,{method:\"POST\",headers,body:JSON.stringify({action,...data})});\n const result=await response.json().catch(()=>({error:\"The server returned an unreadable response.\"}));\n if(!response.ok||!result.success)throw new Error(result.error||\"The request could not be completed.\");\n return result;\n}\nfunction showCode(container,code,message){\n const wrap=document.createElement(\"div\");wrap.className=\"notice success\";\n const label=document.createElement(\"div\");label.textContent=message;\n const value=document.createElement(\"div\");value.className=\"code\";value.textContent=code;\n const copy=document.createElement(\"button\");copy.type=\"button\";copy.className=\"secondary\";copy.textContent=\"Copy code\";\n copy.addEventListener(\"click\",async()=>{try{await navigator.clipboard.writeText(code);copy.textContent=\"Copied\"}catch{copy.textContent=\"Select and copy the code above\"}});\n wrap.append(label,value,copy);container.appendChild(wrap);\n}\nasync function refreshDirectorLists(){\n const result=await api(\"list\");\n const existing=$(\"existingAccounts\");existing.replaceChildren();\n if(!result.existingAccounts.length){existing.textContent=\"No eligible active individual staff accounts are linked yet.\"}\n for(const row of result.existingAccounts){\n  const item=document.createElement(\"article\");item.className=\"item\";\n  const top=document.createElement(\"div\");top.className=\"item-top\";\n  const info=document.createElement(\"div\");const name=document.createElement(\"h3\");name.textContent=row.full_name;\n  const sub=document.createElement(\"div\");sub.className=\"muted\";sub.textContent=row.role_key+\" · \"+row.job_title;\n  info.append(name,sub);const pill=document.createElement(\"span\");pill.className=\"pill\";pill.textContent=row.code_active?\"Personal code active\":\"No personal code\";top.append(info,pill);\n  const actions=document.createElement(\"div\");actions.className=\"actions\";\n  const issue=document.createElement(\"button\");issue.type=\"button\";issue.textContent=row.code_active?\"Reset personal code\":\"Issue personal code\";\n  issue.addEventListener(\"click\",async()=>{issue.disabled=true;try{const r=await api(\"issue_existing\",{user_id:row.user_id,role_key:row.role_key});const codeBox=document.createElement(\"div\");showCode(codeBox,r.access_code,\"New sign-in code for \"+row.full_name+\". It will not be shown again.\");item.appendChild(codeBox);pill.textContent=\"Personal code active\"}catch(e){note(\"directorMessage\",e.message,\"error\")}finally{issue.disabled=false}});\n  const revoke=document.createElement(\"button\");revoke.type=\"button\";revoke.className=\"danger\";revoke.textContent=\"Revoke code\";revoke.disabled=!row.code_active;\n  revoke.addEventListener(\"click\",async()=>{if(!confirm(\"Revoke the personal sign-in code for \"+row.full_name+\"?\"))return;revoke.disabled=true;try{await api(\"revoke_existing\",{user_id:row.user_id,role_key:row.role_key});pill.textContent=\"No personal code\";revoke.disabled=true;note(\"directorMessage\",\"The selected personal code was revoked. The staff member must use the approved sign-in method.\",\"success\")}catch(e){note(\"directorMessage\",e.message,\"error\");revoke.disabled=false}});\n  actions.append(issue,revoke);item.append(top,actions);existing.appendChild(item);\n }\n const targets=$(\"activationTargets\");targets.replaceChildren();\n if(!result.activationTargets.length){targets.textContent=\"No unlinked active Bursar or leadership employee records are ready for activation. Add the employee record first, then refresh this list.\"}\n for(const row of result.activationTargets){\n  const item=document.createElement(\"article\");item.className=\"item\";\n  const top=document.createElement(\"div\");top.className=\"item-top\";\n  const info=document.createElement(\"div\");const name=document.createElement(\"h3\");name.textContent=row.full_name;\n  const sub=document.createElement(\"div\");sub.className=\"muted\";sub.textContent=row.role_key+\" · \"+row.job_title;\n  info.append(name,sub);const pill=document.createElement(\"span\");pill.className=\"pill\";pill.textContent=row.code_active?\"Activation code active\":(row.enrollment_status?\"Enrollment: \"+row.enrollment_status:\"Ready for activation\");top.append(info,pill);\n  const actions=document.createElement(\"div\");actions.className=\"actions\";\n  const issue=document.createElement(\"button\");issue.type=\"button\";issue.textContent=row.code_active?\"Replace activation code\":\"Issue one-time activation code\";\n  issue.addEventListener(\"click\",async()=>{issue.disabled=true;try{const r=await api(\"issue_activation\",{staff_directory_id:row.staff_directory_id,role_key:row.role_key});const box=document.createElement(\"div\");showCode(box,r.activation_code,\"Give this one-time code privately to \"+row.full_name+\". Expires in seven days.\");item.appendChild(box);pill.textContent=\"Activation code active\";issue.textContent=\"Replace activation code\"}catch(e){note(\"directorMessage\",e.message,\"error\")}finally{issue.disabled=false}});\n  const revoke=document.createElement(\"button\");revoke.type=\"button\";revoke.className=\"danger\";revoke.textContent=\"Revoke code\";revoke.disabled=!row.code_active;\n  revoke.addEventListener(\"click\",async()=>{if(!confirm(\"Revoke the activation code for \"+row.full_name+\"?\"))return;revoke.disabled=true;try{await api(\"revoke_activation\",{staff_directory_id:row.staff_directory_id});pill.textContent=\"No activation code\";revoke.disabled=true;note(\"directorMessage\",\"The activation code was revoked.\",\"success\")}catch(e){note(\"directorMessage\",e.message,\"error\");revoke.disabled=false}});\n  actions.append(issue,revoke);item.append(top,actions);targets.appendChild(item);\n }\n}\n$(\"directorLoginForm\").addEventListener(\"submit\",async event=>{\n event.preventDefault();const btn=$(\"directorLoginButton\");btn.disabled=true;\n try{\n  const {data,error}=await authClient.auth.signInWithPassword({email:$(\"directorEmail\").value.trim(),password:$(\"directorPassword\").value});\n  if(error||!data?.session)throw error||new Error(\"Director sign-in failed.\");\n  directorSession=data.session;\n  await refreshDirectorLists();\n  $(\"directorPanel\").classList.remove(\"hidden\");$(\"directorSignOut\").classList.remove(\"hidden\");\n  note(\"directorMessage\",\"Signed in. The server verified the active Director role.\",\"success\");\n  $(\"directorPassword\").value=\"\";\n }catch(error){directorSession=null;$(\"directorPanel\").classList.add(\"hidden\");note(\"directorMessage\",error.message||\"Director sign-in failed.\",\"error\")}\n finally{btn.disabled=false}\n});\n$(\"directorSignOut\").addEventListener(\"click\",async()=>{\n await authClient.auth.signOut({scope:\"local\"});directorSession=null;$(\"directorPanel\").classList.add(\"hidden\");$(\"directorSignOut\").classList.add(\"hidden\");note(\"directorMessage\",\"Director signed out.\",\"success\");\n});\n$(\"activateForm\").addEventListener(\"submit\",async event=>{\n event.preventDefault();const button=$(\"activateButton\");button.disabled=true;button.textContent=\"Verifying code and activating account…\";\n const box=$(\"activationResult\");box.classList.add(\"hidden\");box.replaceChildren();\n try{\n  const code=$(\"activationCode\").value.trim().toUpperCase(),email=$(\"activationEmail\").value.trim().toLowerCase();\n  const password=$(\"activationPassword\").value,confirmPassword=$(\"activationConfirm\").value;\n  if(password.length<12)throw new Error(\"Use a password with at least 12 characters.\");\n  if(password!==confirmPassword)throw new Error(\"The two passwords do not match.\");\n  const r=await api(\"redeem\",{activation_code:code,email,password},false);\n  note(\"activationResult\",\"Your account has been activated. Sign in with the email address and password you just created.\",\"success\");\n  if(r.signin_code){const holder=document.createElement(\"div\");showCode(holder,r.signin_code,\"Your personal staff sign-in code. Keep it private; it is only an additional sign-in method.\");$(\"activationResult\").appendChild(holder)}\n  $(\"activateForm\").reset();\n }catch(error){note(\"activationResult\",error.message||\"Activation could not be completed.\",\"error\")}\n finally{button.disabled=false;button.textContent=\"Activate my account\"}\n});\n</script>\n</body>\n</html>";
const allowedOrigins = new Set([
  "https://yemhortbudwbcrzsoozk.supabase.co",
  "https://cornhill-school-swart.vercel.app",
  "https://cornhill-school.vercel.app",
  "https://services-cornhill-school.vercel.app",
]);
const encoder = new TextEncoder();
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
type RoleKey = "Teacher" | "Headteacher" | "Deputy Headteacher" | "DOS" | "Main Bursar" | "Deputy Bursar";

function headersFor(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headersFor(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}
function normalizeTitle(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function roleForTitle(value: unknown): RoleKey | null {
  const title = normalizeTitle(value);
  if (["main bursar", "bursar", "school bursar", "bursar (main)", "bursar main"].includes(title)) return "Main Bursar";
  if (["deputy bursar", "deputy school bursar", "deputy bursar (school)"].includes(title)) return "Deputy Bursar";
  if (["headteacher", "head teacher"].includes(title)) return "Headteacher";
  if (["deputy headteacher", "deputy head teacher"].includes(title)) return "Deputy Headteacher";
  if (["dos", "director of studies", "director of studies (dos)"].includes(title)) return "DOS";
  return null;
}
function roleForProfile(profile: Record<string, any>): RoleKey | null {
  if (profile.role === "Teacher") return "Teacher";
  if (profile.role !== "Staff") return null;
  return roleForTitle(profile.job_title);
}
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
}
function pepper() {
  const value = Deno.env.get("STAFF_ACCESS_CODE_PEPPER") ||
    Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!value) throw new Error("Staff activation security is not configured.");
  return value;
}
async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function validUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
function authClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("Staff activation service is not configured.");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function directorFor(req: Request, admin: ReturnType<typeof createClient>) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return null;
  const { data: profile, error } = await admin.from("user_profiles")
    .select("id,role,employment_status").eq("id", auth.user.id).maybeSingle();
  if (error || profile?.role !== "Admin" || profile?.employment_status !== "Active") return null;
  return auth.user;
}
async function verifyExistingAccount(admin: ReturnType<typeof createClient>, userId: string, role: RoleKey) {
  const { data: profile, error } = await admin.from("user_profiles")
    .select("id,full_name,role,job_title,employment_status").eq("id", userId).maybeSingle();
  if (error || !profile || profile.employment_status !== "Active" || roleForProfile(profile) !== role) return null;
  if (role === "Teacher") {
    const { data: teacher, error: teacherError } = await admin.from("academic_teacher_directory")
      .select("id").eq("linked_user_id", userId).eq("employment_status", "Active").limit(1).maybeSingle();
    if (teacherError || !teacher) return null;
  } else {
    const { data: employee, error: employeeError } = await admin.from("school_staff_directory")
      .select("id").eq("linked_user_id", userId).eq("employment_status", "Active").limit(1).maybeSingle();
    if (employeeError || !employee) return null;
  }
  return profile;
}
async function logActivation(admin: ReturnType<typeof createClient>, row: Record<string, any>) {
  const { error } = await admin.from("staff_activation_code_audit").insert(row);
  return !error;
}
async function listDirectorRecords(admin: ReturnType<typeof createClient>) {
  const { data: profiles, error } = await admin.from("user_profiles")
    .select("id,full_name,role,job_title,employment_status")
    .in("role", ["Teacher", "Staff"]).eq("employment_status", "Active").order("full_name");
  if (error) throw new Error("Active staff accounts could not be loaded.");
  const existingAccounts: Array<Record<string, unknown>> = [];
  for (const profile of profiles || []) {
    const roleKey = roleForProfile(profile) as RoleKey | null;
    if (!roleKey || !["Teacher", "Headteacher", "Deputy Headteacher", "DOS"].includes(roleKey)) continue;
    const verified = await verifyExistingAccount(admin, profile.id, roleKey);
    if (!verified) continue;
    const { data: code, error: codeError } = await admin.from("staff_access_codes")
      .select("is_active").eq("user_id", profile.id).maybeSingle();
    if (codeError) throw new Error("Existing personal code status could not be loaded.");
    existingAccounts.push({
      user_id: profile.id,
      full_name: profile.full_name || "Staff member",
      job_title: profile.job_title || roleKey,
      role_key: roleKey,
      code_active: !!code?.is_active,
    });
  }

  const { data: employees, error: employeeError } = await admin.from("school_staff_directory")
    .select("id,full_name,job_title,staff_category,employment_status,linked_user_id")
    .eq("employment_status", "Active").eq("staff_category", "Non-teaching")
    .is("linked_user_id", null).order("full_name");
  if (employeeError) throw new Error("Unlinked staff records could not be loaded.");
  const activationTargets: Array<Record<string, unknown>> = [];
  for (const employee of employees || []) {
    const roleKey = roleForTitle(employee.job_title);
    if (!roleKey || roleKey === "Teacher") continue;
    let enrollment: Record<string, any> | null = null;
    if (roleKey === "Main Bursar" || roleKey === "Deputy Bursar") {
      const { data, error } = await admin.from("bursar_account_enrollments")
        .select("id,auth_user_id,status").eq("staff_directory_id", employee.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error("The existing bursar enrollment could not be checked.");
      enrollment = data;
      if (enrollment?.status === "active") continue;
      if (enrollment && !["inviting", "invited", "email_verified", "approved", "rejected", "delivery_failed"].includes(enrollment.status)) continue;
    }
    const { data: activation, error: activationError } = await admin.from("staff_activation_codes")
      .select("is_active,expires_at,redeemed_at,revoked_at")
      .eq("staff_directory_id", employee.id).maybeSingle();
    if (activationError) throw new Error("Activation code status could not be checked.");
    const activeCode = !!activation?.is_active && !activation?.redeemed_at &&
      !activation?.revoked_at && new Date(activation.expires_at).getTime() > Date.now();
    activationTargets.push({
      staff_directory_id: employee.id,
      full_name: employee.full_name || "Staff member",
      job_title: employee.job_title || roleKey,
      role_key: roleKey,
      enrollment_status: enrollment?.status || null,
      code_active: activeCode,
    });
  }
  return { success: true, existingAccounts, activationTargets };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return new Response("forbidden", { status: 403 });
    return new Response("ok", { headers: headersFor(origin) });
  }
  if (origin && !allowedOrigins.has(origin)) return json(403, { error: "This application origin is not approved." }, origin);
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(req.method === "HEAD" ? null : PAGE, {
      status: 200,
      headers: {
        ...headersFor(origin),
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self' https://yemhortbudwbcrzsoozk.supabase.co https://cdn.jsdelivr.net; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        "X-Frame-Options": "DENY",
      },
    });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, origin);

  const admin = authClient();
  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid request." }, origin); }
  const action = String(payload.action || "");
  const codePepper = pepper();

  if (action === "redeem") {
    const code = String(payload.activation_code || "").trim().toUpperCase();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    if (!/^[A-HJ-NP-Z2-9]{18}$/.test(code) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        password.length < 12 || password.length > 128) {
      return json(400, { error: "Enter a valid activation code, email address and password of at least 12 characters." }, origin);
    }
    const ip = req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const ipHash = await hmacHex(codePepper, "cornhill-login-rate-v1:" + ip + ":" + userAgent);
    const { data: allowed, error: rateError } = await admin.rpc("consume_staff_access_code_attempt", {
      p_ip_hash: ipHash, p_reset: false,
    });
    if (rateError || allowed !== true) {
      return json(429, { error: "Too many activation attempts. Wait 15 minutes before trying again." }, origin);
    }
    const codeHash = await hmacHex(codePepper, "cornhill-activation-v1:" + code);
    const { data: found, error: lookupError } = await admin.from("staff_activation_codes")
      .select("staff_directory_id,enrollment_id,role_key,issued_by,expires_at,is_active,redeemed_at,revoked_at")
      .eq("code_hash", codeHash).maybeSingle();
    if (lookupError || !found || !found.is_active || found.redeemed_at || found.revoked_at ||
        new Date(found.expires_at).getTime() <= Date.now()) {
      await admin.rpc("consume_staff_access_code_attempt", { p_ip_hash: ipHash, p_reset: false });
      return json(401, { error: "The activation code is invalid, expired, revoked or already used." }, origin);
    }

    const { data: employee, error: employeeError } = await admin.from("school_staff_directory")
      .select("id,full_name,phone,gender,staff_category,job_title,department,responsibilities,employment_start_date,reporting_date,employment_end_date,employment_status,linked_user_id")
      .eq("id", found.staff_directory_id).maybeSingle();
    if (employeeError || !employee || employee.employment_status !== "Active" ||
        employee.staff_category !== "Non-teaching" || employee.linked_user_id ||
        roleForTitle(employee.job_title) !== found.role_key) {
      return json(409, { error: "This staff record is no longer eligible for activation. Ask the Director to review it." }, origin);
    }

    let bursarEnrollment: Record<string, any> | null = null;
    const isBursar = found.role_key === "Main Bursar" || found.role_key === "Deputy Bursar";
    if (isBursar) {
      if (found.enrollment_id) {
        const { data, error } = await admin.from("bursar_account_enrollments")
          .select("id,auth_user_id,status,email,role_key,staff_directory_id")
          .eq("id", found.enrollment_id).maybeSingle();
        if (error || !data || data.staff_directory_id !== employee.id || data.role_key !== found.role_key ||
            data.status === "active") {
          return json(409, { error: "The existing bursar enrollment has changed. Ask the Director to refresh the activation code." }, origin);
        }
        bursarEnrollment = data;
      }
    }

    let existingAuthId: string | null = bursarEnrollment?.auth_user_id || null;
    const { data: authList, error: authListError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authListError) return json(503, { error: "Staff account verification is temporarily unavailable. Try again later." }, origin);
    const emailOwner = (authList.users || []).find((user: any) => String(user.email || "").toLowerCase() === email);
    if (emailOwner && emailOwner.id !== existingAuthId) {
      return json(409, { error: "That email address is already linked to another sign-in account. Use a different personal email." }, origin);
    }
    if (existingAuthId) {
      const { data: linkedProfile, error: linkedProfileError } = await admin.from("user_profiles")
        .select("id").eq("id", existingAuthId).maybeSingle();
      if (linkedProfileError || linkedProfile) {
        return json(409, { error: "This bursar already has a linked staff account. Ask the Director to review the records instead of creating another account." }, origin);
      }
    }

    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin.from("staff_activation_codes")
      .update({ is_active: false, redeemed_at: now, updated_at: now })
      .eq("staff_directory_id", employee.id).eq("code_hash", codeHash)
      .eq("is_active", true).is("redeemed_at", null).is("revoked_at", null)
      .gt("expires_at", now)
      .select("staff_directory_id,enrollment_id,role_key,issued_by").maybeSingle();
    if (claimError || !claimed) {
      return json(409, { error: "This activation code has already been redeemed or replaced." }, origin);
    }

    let activatedUserId = existingAuthId;
    let signinCode: string | null = null;
    if (isBursar && existingAuthId) {
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(existingAuthId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { name: employee.full_name, cornhill_staff_role: found.role_key },
      });
      if (updateAuthError) {
        await admin.from("staff_activation_codes").update({ is_active: true, redeemed_at: null, updated_at: new Date().toISOString() })
          .eq("staff_directory_id", employee.id).eq("code_hash", codeHash).is("redeemed_by", null);
        return json(400, { error: "The email or password could not be saved. Check the email address and try again, or ask the Director to issue a fresh activation code." }, origin);
      }
      const { error: enrollmentError } = await admin.from("bursar_account_enrollments").update({
        email,
        status: "approved",
        approved_by: claimed.issued_by,
        approved_at: now,
        email_verified_at: now,
        updated_at: now,
      }).eq("id", bursarEnrollment!.id).eq("auth_user_id", existingAuthId);
      if (enrollmentError) return json(500, { error: "Your credentials were saved, but the bursar activation record needs Director repair. Do not use another code; contact the Director." }, origin);
    } else if (isBursar) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { name: employee.full_name, cornhill_staff_role: found.role_key },
      });
      if (createError || !created.user) {
        return json(400, { error: "The staff login could not be created. Ask the Director to issue a fresh activation code." }, origin);
      }
      activatedUserId = created.user.id;
      let enrollmentId: string | null = null;
      const { data: enrollment, error: enrollmentInsertError } = await admin.from("bursar_account_enrollments").insert({
        staff_directory_id: employee.id, auth_user_id: activatedUserId, email,
        role_key: found.role_key, status: "approved",
        created_by: claimed.issued_by, approved_by: claimed.issued_by,
        approved_at: now, email_verified_at: now,
      }).select("id").single();
      if (enrollmentInsertError || !enrollment) {
        await admin.auth.admin.deleteUser(activatedUserId);
        return json(500, { error: "The new bursar login was created but its enrollment record could not be saved. Ask the Director to issue a fresh activation code." }, origin);
      }
      enrollmentId = enrollment.id;
      const { error: codeLinkError } = await admin.from("staff_activation_codes")
        .update({ enrollment_id: enrollmentId, redeemed_by: activatedUserId, updated_at: now })
        .eq("staff_directory_id", employee.id);
      if (codeLinkError) return json(500, { error: "The bursar login was created but its activation audit link needs repair. Contact the Director." }, origin);
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { name: employee.full_name, cornhill_staff_role: found.role_key },
      });
      if (createError || !created.user) {
        await admin.from("staff_activation_codes").update({ is_active: true, redeemed_at: null, updated_at: new Date().toISOString() })
          .eq("staff_directory_id", employee.id).eq("code_hash", codeHash);
        return json(400, { error: "The staff login could not be created. Check the email address and ask the Director to issue a new activation code." }, origin);
      }
      activatedUserId = created.user.id;
      const { error: profileError } = await admin.from("user_profiles").insert({
        id: activatedUserId,
        full_name: employee.full_name,
        role: "Staff",
        phone: employee.phone,
        gender: employee.gender,
        staff_category: employee.staff_category,
        job_title: employee.job_title,
        department: employee.department,
        responsibilities: employee.responsibilities,
        employment_start_date: employee.employment_start_date,
        reporting_date: employee.reporting_date,
        employment_end_date: employee.employment_end_date,
        employment_status: "Active",
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(activatedUserId);
        await admin.from("staff_activation_codes").update({ is_active: true, redeemed_at: null, updated_at: new Date().toISOString() })
          .eq("staff_directory_id", employee.id).eq("code_hash", codeHash);
        return json(500, { error: "The staff profile could not be created. The activation code has been released for another attempt; contact the Director if the problem continues." }, origin);
      }
      const { data: linked, error: linkError } = await admin.from("school_staff_directory")
        .update({ linked_user_id: activatedUserId, updated_at: now })
        .eq("id", employee.id).is("linked_user_id", null).select("id").maybeSingle();
      if (linkError || !linked) {
        await admin.from("user_profiles").delete().eq("id", activatedUserId);
        await admin.auth.admin.deleteUser(activatedUserId);
        await admin.from("staff_activation_codes").update({ is_active: true, redeemed_at: null, updated_at: new Date().toISOString() })
          .eq("staff_directory_id", employee.id).eq("code_hash", codeHash);
        return json(409, { error: "The staff record changed during activation. The account was rolled back; ask the Director to refresh the list." }, origin);
      }

      if (["Headteacher", "Deputy Headteacher", "DOS"].includes(String(found.role_key))) {
        signinCode = randomCode();
        const personalHash = await hmacHex(codePepper, "cornhill-staff-access-v1:" + signinCode);
        const { error: personalCodeError } = await admin.from("staff_access_codes").upsert({
          user_id: activatedUserId, role_key: found.role_key,
          code_hash: personalHash, is_active: true,
          created_by: claimed.issued_by, updated_at: now,
        }, { onConflict: "user_id" });
        if (personalCodeError) {
          signinCode = null;
        }
      }
    }

    if (isBursar) {
      const { data: activated, error: activationError } = await admin.rpc("activate_bursar_account_enrollment", {
        p_enrollment_id: bursarEnrollment?.id || claimed.enrollment_id ||
          (await admin.from("bursar_account_enrollments").select("id").eq("staff_directory_id", employee.id).eq("auth_user_id", activatedUserId).single()).data?.id,
        p_auth_user_id: activatedUserId,
      });
      if (activationError || !activated?.success) {
        return json(500, { error: "Your credentials were saved, but account linking did not finish. Do not request another invitation or code; ask the Director to complete the existing activation." }, origin);
      }
    } else {
      const { error: markCodeError } = await admin.from("staff_activation_codes")
        .update({ redeemed_by: activatedUserId, updated_at: new Date().toISOString() })
        .eq("staff_directory_id", employee.id);
      if (markCodeError) return json(500, { error: "The account is active, but the activation audit needs Director review." }, origin);
    }

    await logActivation(admin, {
      staff_directory_id: employee.id,
      enrollment_id: bursarEnrollment?.id || claimed.enrollment_id || null,
      role_key: found.role_key,
      action: "redeemed",
      performed_by: activatedUserId,
      metadata: { email_domain: email.split("@")[1] || "", method: "director_issued_single_use_code" },
    });
    await admin.rpc("consume_staff_access_code_attempt", { p_ip_hash: ipHash, p_reset: true });
    return json(200, {
      success: true,
      role_key: found.role_key,
      message: "Account activated. Sign in using the email address and password you created.",
      signin_code: signinCode,
    }, origin);
  }

  const director = await directorFor(req, admin);
  if (!director) return json(403, { error: "Only the active original Director account can manage staff codes." }, origin);

  if (action === "list") {
    try {
      return json(200, await listDirectorRecords(admin), origin);
    } catch (error) {
      return json(500, { error: error instanceof Error ? error.message : "Staff account lists could not be loaded." }, origin);
    }
  }

  if (action === "issue_existing" || action === "revoke_existing") {
    const userId = String(payload.user_id || "");
    const roleKey = String(payload.role_key || "") as RoleKey;
    if (!validUuid(userId) || !["Teacher", "Headteacher", "Deputy Headteacher", "DOS"].includes(roleKey)) {
      return json(400, { error: "Choose a valid active staff account." }, origin);
    }
    const target = await verifyExistingAccount(admin, userId, roleKey);
    if (!target) return json(409, { error: "The selected account is not an active linked staff member for that role." }, origin);
    if (action === "revoke_existing") {
      const { error } = await admin.from("staff_access_codes")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId).eq("role_key", roleKey);
      if (error) return json(500, { error: "The personal sign-in code could not be revoked." }, origin);
      await admin.from("staff_access_code_audit").insert({
        user_id: userId, role_key: roleKey, action: "revoked", performed_by: director.id,
      });
      return json(200, { success: true, message: "Personal sign-in code revoked." }, origin);
    }
    const code = randomCode();
    const hash = await hmacHex(codePepper, "cornhill-staff-access-v1:" + code);
    const { error } = await admin.from("staff_access_codes").upsert({
      user_id: userId, role_key: roleKey, code_hash: hash, is_active: true,
      created_by: director.id, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return json(500, { error: "The personal sign-in code could not be saved." }, origin);
    await admin.from("staff_access_code_audit").insert({
      user_id: userId, role_key: roleKey, action: "issued", performed_by: director.id,
    });
    return json(200, {
      success: true, account_name: target.full_name, role_key: roleKey, access_code: code,
    }, origin);
  }

  if (action === "issue_activation" || action === "revoke_activation") {
    const staffDirectoryId = String(payload.staff_directory_id || "");
    if (!validUuid(staffDirectoryId)) return json(400, { error: "Choose a valid active employee record." }, origin);
    if (action === "revoke_activation") {
      const { data, error } = await admin.from("staff_activation_codes")
        .update({ is_active: false, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("staff_directory_id", staffDirectoryId).eq("is_active", true)
        .is("redeemed_at", null).select("role_key").maybeSingle();
      if (error || !data) return json(409, { error: "There is no unused activation code to revoke for that employee." }, origin);
      await logActivation(admin, {
        staff_directory_id: staffDirectoryId, role_key: data.role_key,
        action: "revoked", performed_by: director.id, metadata: {},
      });
      return json(200, { success: true, message: "Activation code revoked." }, origin);
    }

    const { data: employee, error: employeeError } = await admin.from("school_staff_directory")
      .select("id,full_name,job_title,staff_category,employment_status,linked_user_id")
      .eq("id", staffDirectoryId).maybeSingle();
    const roleKey = roleForTitle(employee?.job_title);
    if (employeeError || !employee || employee.employment_status !== "Active" ||
        employee.staff_category !== "Non-teaching" || employee.linked_user_id ||
        !roleKey || roleKey === "Teacher") {
      return json(409, { error: "Choose an active, unlinked Bursar, Headteacher, Deputy Headteacher or DOS employee record." }, origin);
    }
    let enrollmentId: string | null = null;
    if (roleKey === "Main Bursar" || roleKey === "Deputy Bursar") {
      const { data: enrollment, error } = await admin.from("bursar_account_enrollments")
        .select("id,auth_user_id,status").eq("staff_directory_id", employee.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) return json(500, { error: "The existing bursar enrollment could not be checked." }, origin);
      if (enrollment?.status === "active") return json(409, { error: "This employee already has an active bursar account." }, origin);
      if (enrollment && !["inviting", "invited", "email_verified", "approved", "rejected", "delivery_failed"].includes(enrollment.status)) {
        return json(409, { error: "This bursar enrollment needs Director review before another code can be issued." }, origin);
      }
      enrollmentId = enrollment?.id || null;
    }
    const code = randomCode();
    const hash = await hmacHex(codePepper, "cornhill-activation-v1:" + code);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: saveError } = await admin.from("staff_activation_codes").upsert({
      staff_directory_id: employee.id,
      enrollment_id: enrollmentId,
      role_key: roleKey,
      code_hash: hash,
      is_active: true,
      expires_at: expires,
      issued_by: director.id,
      updated_at: new Date().toISOString(),
      redeemed_at: null,
      redeemed_by: null,
      revoked_at: null,
    }, { onConflict: "staff_directory_id" });
    if (saveError) return json(500, { error: "The one-time activation code could not be saved." }, origin);
    await logActivation(admin, {
      staff_directory_id: employee.id, enrollment_id: enrollmentId,
      role_key: roleKey, action: "issued", performed_by: director.id,
      metadata: { expires_at: expires },
    });
    return json(200, {
      success: true, employee_name: employee.full_name, role_key: roleKey,
      activation_code: code, expires_at: expires,
    }, origin);
  }

  return json(400, { error: "Unknown staff account action." }, origin);
});
