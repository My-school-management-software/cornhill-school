import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "0",
  "Content-Type": "application/json",
};
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SECRET_KEYS")
  ? JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default
  : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminDb = createClient(PROJECT_URL, SERVICE_KEY, { auth: { persistSession: false } });
const enc = new TextEncoder();
const dec = new TextDecoder();
const TABLES = [
  "school_classes","academic_years","academic_terms","subjects","academic_grade_bands",
  "uneb_subject_grade_bands","school_curriculum_subjects","class_subjects","assessments",
  "assessment_scores","report_card_publications","student_class_history","student_status_history",
  "students","user_profiles","learner_enrolment_periods","learner_bursary_awards",
  "parent_guardian_contacts","parent_contact_change_log","learner_conduct_reports",
  "fee_items","fee_schedules","learner_charges","school_payments","payment_allocations",
  "daily_collection_records","school_expenses","expense_categories","payroll_periods","payroll_items",
  "staff_salary_agreements","staff_salary_advances","staff_attendance_events",
  "staff_attendance_adjustments","staff_attendance_incidents","staff_attendance_alerts",
  "staff_attendance_deduction_settings","staff_attendance_device_users","staff_attendance_import_batches",
  "staff_work_schedules","staff_attendance_schedule_assignments","communication_delivery_events",
  "communication_outbox","communication_templates","school_sms_outbox","staff_communication_posts",
  "staff_communication_comments","staff_communication_reactions","staff_direct_messages",
  "staff_media_messages","staff_call_signals","inventory_categories","inventory_items",
  "inventory_movements","school_position_catalogue"
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function unbase64(value: string) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
async function digest(value: string) {
  return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
}
async function cryptoKey() {
  const raw = Deno.env.get("BACKUP_ENCRYPTION_KEY");
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not configured");
  const bytes = unbase64(raw);
  if (bytes.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be base64-encoded 32 random bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt","decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), enc.encode(value));
  return JSON.stringify({ v: 1, alg: "AES-256-GCM", iv: base64(iv), data: base64(new Uint8Array(cipher)) });
}
async function decrypt(value: string) {
  const item = JSON.parse(value);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(item.iv) }, await cryptoKey(), unbase64(item.data));
  return dec.decode(plain);
}
async function requireAdmin(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in as a school administrator first.");
  const { data: userData, error: userError } = await adminDb.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Your session is invalid or has expired. Please sign in again.");
  const { data: profile, error } = await adminDb.from("user_profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (error || profile?.role !== "Admin") throw new Error("Only a signed-in CORNHILL administrator can manage Google Drive backups.");
  return userData.user;
}
async function saveState(userId: string) {
  const state = base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  await adminDb.from("google_drive_backup_oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error } = await adminDb.from("google_drive_backup_oauth_states").insert({
    state_hash: await digest(state), user_id: userId,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
  if (error) throw new Error("Could not start secure Google connection: " + error.message);
  return state;
}
function googleConfig() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google OAuth is not configured yet. The school Google OAuth client details must be added to Supabase Function Secrets.");
  return { clientId, clientSecret, redirectUri };
}
async function getConnection() {
  const { data, error } = await adminDb.from("google_drive_backup_connections").select("*").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function driveToken(connection: any) {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  let accessToken = "";
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() > Date.now() + 60000) {
    // Access tokens are deliberately not persisted in plaintext. Refresh for each server-side operation.
  }
  const refreshToken = await decrypt(connection.refresh_token_ciphertext);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id:clientId, client_secret:clientSecret, refresh_token:refreshToken, grant_type:"refresh_token", redirect_uri:redirectUri })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error("Google Drive authorization expired or was revoked. Reconnect the school Google account.");
  accessToken = payload.access_token;
  return accessToken;
}
async function ensureDriveFolder(accessToken: string, connection: any) {
  if (connection.drive_folder_id) return connection.drive_folder_id;
  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "CORNHILL School Backups",
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const responseText = await response.text();
  let data: any = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { error: { message: responseText.slice(0, 500) } };
  }
  if (!response.ok || !data.id) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    const reasons = Array.isArray(data?.error?.errors)
      ? data.error.errors.map((item: any) => item.reason).filter(Boolean).join(", ")
      : "";
    throw new Error(
      `Google Drive folder creation failed (${response.status}): ${message}` +
      (reasons ? ` [${reasons}]` : "")
    );
  }
  const { error: saveError } = await adminDb
    .from("google_drive_backup_connections")
    .update({ drive_folder_id: data.id, updated_at: new Date().toISOString() })
    .eq("id", connection.id);
  if (saveError) {
    throw new Error(`Folder created, but its ID could not be saved: ${saveError.message}`);
  }
  return data.id;
}
async function makeBackup(userId: string, connection: any) {
  const runInsert = await adminDb.from("google_drive_backup_runs").insert({status:"started",started_by:userId}).select("id").single();
  if (runInsert.error) throw new Error("Could not create backup audit record: "+runInsert.error.message);
  const runId = runInsert.data.id;
  try {
    const records: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const rows: unknown[] = [];
      let start = 0;
      while (true) {
        const {data,error} = await adminDb.from(table).select("*").range(start,start+999);
        if (error) throw new Error("Backup stopped at "+table+": "+error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
        start += 1000;
      }
      records[table] = rows;
    }
    const counts = Object.fromEntries(Object.entries(records).map(([key,value])=>[key,value.length]));
    const total = Object.values(counts).reduce((sum,n)=>sum+n,0);
    const snapshot = {
      school:"CORNHILL NURSERY AND PRIMARY SCHOOL",
      format:"cornhill-google-drive-backup-v1",
      created_at:new Date().toISOString(),
      created_by:userId,
      scope:"Encrypted application database snapshot. Supabase Storage files, authentication accounts and message contents are not included in this version.",
      record_counts:counts,
      total_records:total,
      records
    };
    const encrypted = await encrypt(JSON.stringify(snapshot));
    const verifiedSnapshot = JSON.parse(await decrypt(encrypted));
    if (verifiedSnapshot.format !== snapshot.format || verifiedSnapshot.total_records !== total ||
        Object.keys(verifiedSnapshot.records ?? {}).length !== Object.keys(records).length) {
      throw new Error("Encrypted cloud backup failed its integrity verification; upload was cancelled.");
    }
    const stamp = new Date().toISOString().replace(/[:.]/g,"-");
    const fileName = "cornhill-school-backup-"+stamp+".json.enc";
    const token = await driveToken(connection);
    const folderId = await ensureDriveFolder(token, connection);
    const boundary = "cornhill_"+crypto.randomUUID();
    const metadata = { name:fileName, mimeType:"application/octet-stream", parents:[folderId], description:"Encrypted CORNHILL school database backup. AES-256-GCM." };
    const body = new Blob([
      "--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify(metadata)+"\r\n",
      "--"+boundary+"\r\nContent-Type: application/octet-stream\r\n\r\n"+encrypted+"\r\n",
      "--"+boundary+"--"
    ]);
    const uploaded = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime",{
      method:"POST",
      headers:{Authorization:"Bearer "+token,"Content-Type":"multipart/related; boundary="+boundary},
      body
    });
    const file = await uploaded.json();
    if (!uploaded.ok || !file.id) throw new Error("Google Drive upload failed: "+(file.error?.message||uploaded.status));
    await adminDb.from("google_drive_backup_runs").update({status:"success",drive_file_id:file.id,file_name:fileName,record_counts:counts,total_records:total,completed_at:new Date().toISOString()}).eq("id",runId);
    await adminDb.from("google_drive_backup_connections").update({updated_at:new Date().toISOString()}).eq("id",connection.id);
    return {run_id:runId,file_name:fileName,record_counts:counts,total_records:total,drive_file_id:file.id,created_at:file.createdTime};
  } catch(error) {
    await adminDb.from("google_drive_backup_runs").update({status:"failed",error_message:String(error).slice(0,1000),completed_at:new Date().toISOString()}).eq("id",runId);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const requestedHeaders = req.headers.get("access-control-request-headers") || "";
    const preflightHeaders = new Headers(cors);
    if (requestedHeaders) preflightHeaders.set("Access-Control-Allow-Headers", requestedHeaders);
    preflightHeaders.set("Access-Control-Allow-Origin", "*");
    preflightHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    preflightHeaders.set("Access-Control-Max-Age", "0");
    console.log("CORN HILL CORS PREFLIGHT RESPONSE", JSON.stringify({
      origin: req.headers.get("origin"),
      requestedMethod: req.headers.get("access-control-request-method"),
      requestedHeaders,
      allowOrigin: preflightHeaders.get("Access-Control-Allow-Origin"),
      allowMethods: preflightHeaders.get("Access-Control-Allow-Methods"),
      allowHeaders: preflightHeaders.get("Access-Control-Allow-Headers"),
      userAgent: req.headers.get("user-agent")
    }));
    // Standard Supabase SDK CORS headers, with the browser's requested headers echoed.
    // Administrator bearer-token validation remains mandatory on POST.
    return new Response("ok", { status: 200, headers: preflightHeaders });
  }
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("code")) {
    try {
      const state = url.searchParams.get("state") || "";
      const code = url.searchParams.get("code") || "";
      const {data:stateRow,error:stateError} = await adminDb.from("google_drive_backup_oauth_states").select("*").eq("state_hash",await digest(state)).gt("expires_at",new Date().toISOString()).maybeSingle();
      if (stateError || !stateRow) throw new Error("Google connection request expired or could not be verified. Start again from CORNHILL.");
      await adminDb.from("google_drive_backup_oauth_states").delete().eq("state_hash",stateRow.state_hash);
      const {clientId,clientSecret,redirectUri} = googleConfig();
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:"authorization_code"})});
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || !tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve the requested Drive access.");
      const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+tokens.access_token}});
      const googleUser = await userResponse.json();
      if (!userResponse.ok || !googleUser.email) throw new Error("Could not verify the connected Google account.");
      const requiredSchoolEmail = "info.cornhillnurandprisch2026@gmail.com";
      if (String(googleUser.email).trim().toLowerCase() !== requiredSchoolEmail) throw new Error("Please connect the dedicated CORNHILL account: "+requiredSchoolEmail+". The Google account selected was not accepted.");
      const row = {connected_email:googleUser.email,access_token_ciphertext:await encrypt(tokens.access_token),refresh_token_ciphertext:await encrypt(tokens.refresh_token),token_expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),connected_by:stateRow.user_id,updated_at:new Date().toISOString()};
      const existing = await getConnection();
      if (existing) await adminDb.from("google_drive_backup_connections").update(row).eq("id",existing.id);
      else await adminDb.from("google_drive_backup_connections").insert(row);
      const target = Deno.env.get("APP_BASE_URL") || "https://cornhill-school.vercel.app";
      return new Response("<!doctype html><meta name='viewport' content='width=device-width'><title>CORNHILL Google Drive</title><main style='font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px'><h2>Google Drive connected</h2><p>The school Google account "+String(googleUser.email).replace(/[&<>"]/g,"") +" is connected. Return to CORNHILL, open Settings → Backup & Recovery, and refresh cloud status.</p><a href='"+target+"'>Return to CORNHILL</a></main>",{headers:{"Content-Type":"text/html; charset=utf-8"}});
    } catch(error) {
      return new Response("<!doctype html><meta name='viewport' content='width=device-width'><main style='font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px'><h2>Google Drive connection failed</h2><p>"+String(error).replace(/[&<>"]/g,"")+"</p><p>Return to CORNHILL and try again.</p></main>",{status:400,headers:{"Content-Type":"text/html; charset=utf-8"}});
    }
  }
  if (req.method !== "POST") return json({error:"Method not allowed"},405);
  try {
    const body = await req.json();
    if (body.action === "scheduled_backup") {
      const schedulerToken = req.headers.get("x-cornhill-scheduler-token") || "";
      const { data: tokenValid, error: tokenError } = await adminDb.rpc("verify_cornhill_backup_scheduler_token", { p_token: schedulerToken });
      if (tokenError || tokenValid !== true) return json({error:"Scheduled backup authentication failed."},401);
      const { data: settings, error: settingsError } = await adminDb.from("google_drive_backup_settings").select("enabled,frequency").eq("id",true).maybeSingle();
      if (settingsError) throw new Error("Could not read scheduled backup settings: "+settingsError.message);
      if (!settings?.enabled) return json({success:true,skipped:true,reason:"Automatic backup is disabled in school settings."});
      const connection = await getConnection();
      if (!connection) throw new Error("Connect the dedicated school Google account before enabling automatic backups.");
      const backup = await makeBackup(connection.connected_by, connection);
      const scheduledAt = new Date().toISOString();
      const { error: updateError } = await adminDb.from("google_drive_backup_settings").update({last_scheduled_at:scheduledAt}).eq("id",true);
      if (updateError) throw new Error("Backup succeeded but schedule timestamp could not be saved: "+updateError.message);
      return json({success:true,scheduled:true,backup});
    }
    const user = await requireAdmin(req);
    if (body.action === "connect") {
      const {clientId,redirectUri} = googleConfig();
      const state = await saveState(user.id);
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.search = new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:"openid email https://www.googleapis.com/auth/drive.file",access_type:"offline",prompt:"consent",include_granted_scopes:"true",state}).toString();
      return json({url:authUrl.toString()});
    }
    if (body.action === "status") {
      const connection = await getConnection();
      const {data:runs} = await adminDb.from("google_drive_backup_runs").select("id,status,drive_file_id,file_name,total_records,created_at,completed_at,error_message").order("created_at",{ascending:false}).limit(10);
      const runIds=(runs??[]).map(run=>run.id);
      const {data:validations} = runIds.length ? await adminDb.from("google_drive_backup_validations").select("id,backup_run_id,validation_status,file_name,total_records,dataset_count,error_message,validated_at").in("backup_run_id",runIds).order("validated_at",{ascending:false}) : {data:[]};
      const {data:settings} = await adminDb.from("google_drive_backup_settings").select("enabled,frequency,last_scheduled_at").eq("id",true).maybeSingle();
      return json({connected:!!connection,connected_email:connection?.connected_email??null,runs:runs??[],validations:validations??[],settings:settings??{enabled:false,frequency:"daily"}});
    }
    if (body.action === "validate_backup") {
      const user = await requireAdmin(req);
      const runId = String(body.run_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Select a valid backup from the backup history.");
      const { data: run, error: runError } = await adminDb.from("google_drive_backup_runs")
        .select("id,status,drive_file_id,file_name,total_records,record_counts")
        .eq("id", runId).eq("status", "success").maybeSingle();
      if (runError || !run?.drive_file_id) throw new Error("That backup is not a completed, verifiable cloud backup.");
      try {
        const connection = await getConnection();
        if (!connection) throw new Error("Reconnect the dedicated CORNHILL Google account before validating backups.");
        const token = await driveToken(connection);
        const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(run.drive_file_id) + "?alt=media", {
          headers: { Authorization: "Bearer " + token }
        });
        if (!response.ok) throw new Error("Google Drive could not download this backup for validation (HTTP " + response.status + ").");
        const encrypted = await response.text();
        const snapshot = JSON.parse(await decrypt(encrypted));
        if (snapshot.format !== "cornhill-google-drive-backup-v1" || !snapshot.records || typeof snapshot.records !== "object")
          throw new Error("Backup format is not recognised. No restore was attempted.");
        const allowed = new Set(TABLES);
        const names = Object.keys(snapshot.records);
        if (names.length !== TABLES.length || names.some(name => !allowed.has(name)))
          throw new Error("Backup dataset list does not match the current CORNHILL backup format.");
        let counted = 0;
        for (const name of TABLES) {
          const rows = snapshot.records[name];
          if (!Array.isArray(rows) || Number(snapshot.record_counts?.[name]) !== rows.length ||
              Number(run.record_counts?.[name]) !== rows.length)
            throw new Error("Backup record-count verification failed for " + name + ".");
          counted += rows.length;
        }
        if (counted !== Number(snapshot.total_records) || counted !== Number(run.total_records))
          throw new Error("Backup total-record verification failed.");
        const {error:auditError}=await adminDb.from("google_drive_backup_validations").insert({
          backup_run_id:run.id,validated_by:user.id,validation_status:"passed",file_name:run.file_name,
          total_records:counted,dataset_count:names.length
        });
        if(auditError)throw new Error("Backup content passed validation, but its validation history could not be saved: "+auditError.message);
        return json({ success: true, validated: true, run_id: run.id, file_name: run.file_name,
          total_records: counted, dataset_count: names.length, created_at: snapshot.created_at,
          message: "Encrypted backup decrypted successfully. Dataset names and all record counts match the backup audit. Validation result saved to administrator history. No school data was changed." });
      } catch(error) {
        const reason=String(error?.message||error).slice(0,1000);
        const {error:auditError}=await adminDb.from("google_drive_backup_validations").insert({
          backup_run_id:run.id,validated_by:user.id,validation_status:"failed",file_name:run.file_name,error_message:reason
        });
        if(auditError)console.error("Could not save backup validation failure history:",auditError.message);
        throw error;
      }
    }
    if (body.action === "backup") {
      const connection = await getConnection();
      if (!connection) throw new Error("Connect the school Google account before creating a cloud backup.");
      return json({success:true,backup:await makeBackup(user.id,connection)});
    }
    return json({error:"Unsupported action"},400);
  } catch(error) {
    return json({error:String(error?.message||error)},400);
  }
});
