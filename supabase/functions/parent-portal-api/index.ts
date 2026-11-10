import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const PROD_ORIGIN = "https://cornhill-school-cypher-projects1.vercel.app";
const PROD_ORIGINS = new Set([
  PROD_ORIGIN,
  "https://cornhill-school-swart.vercel.app"
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = PROD_ORIGINS.has(origin) || /^https:\/\/cornhill-school-[a-z0-9-]+-cypher-projects1\.vercel\.app$/.test(origin);
  return { allowed, headers: {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  }};
}
function reply(body: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}
function randomToken() {
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
}
function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/[^0-9]/g,"");
  if (digits.length === 10 && digits.startsWith("0")) return "+256" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("256")) return "+" + digits;
  return null;
}
function jsonError(message: string, status = 400) { return reply({ error: message }, status); }

async function getSession(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i,"").trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await db.from("parent_portal_sessions")
    .select("id,guardian_contact_id,student_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data) return null;
  const { data: contact, error: contactError } = await db.from("parent_guardian_contacts")
    .select("id").eq("id",data.guardian_contact_id).eq("student_id",data.student_id).eq("is_active",true).maybeSingle();
  if (contactError || !contact) return null;
  await db.from("parent_portal_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return data;
}
async function getStaffSession(req: Request) {
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token||token.length<40||token.length>4096)return null;
 const {data:authData,error:authError}=await db.auth.getUser(token);
 const user=authData?.user;if(authError||!user)return null;
 const {data:staff,error}=await db.from("user_profiles").select("id,full_name,role,employment_status").eq("id",user.id).maybeSingle();
 if(error||!staff||(staff.employment_status&&staff.employment_status!=="Active"))return null;
 if(!["Admin","Teacher","Staff"].includes(String(staff.role||"")))return null;
 return {user,staff};
}

async function getFeeClearance(studentId: string, contactId: string, termRows: any[]) {
  const { data: student, error: studentError } = await db.from("students").select("learner_type").eq("id",studentId).maybeSingle();
  if (studentError || !student) throw new Error("Unable to verify learner fee account");
  const isBoarding = String(student.learner_type || "").toLowerCase().includes("board");
  const requiredCategory = isBoarding ? "boarding" : "school fees";
  const { data: charges, error: chargeError } = await db.from("learner_charges").select("id,term_id,amount_ugx,fee_item_id").eq("student_id",studentId);
  if (chargeError) throw new Error("Unable to read learner charges");
  const feeIds = [...new Set((charges || []).map((c:any)=>c.fee_item_id).filter(Boolean))];
  const { data: feeItems, error: feeError } = feeIds.length ? await db.from("fee_items").select("id,category").in("id",feeIds) : {data:[],error:null};
  if (feeError) throw new Error("Unable to verify school-fee categories");
  const requiredIds = new Set((feeItems || []).filter((f:any)=>String(f.category||"").toLowerCase()===requiredCategory).map((f:any)=>f.id));
  const requiredCharges = (charges || []).filter((c:any)=>requiredIds.has(c.fee_item_id));
  const chargeIds = requiredCharges.map((c:any)=>c.id);
  const { data: allocations, error: allocationError } = chargeIds.length ? await db.from("payment_allocations").select("charge_id,payment_id,amount_ugx").in("charge_id",chargeIds) : {data:[],error:null};
  if (allocationError) throw new Error("Unable to verify posted fee allocations");
  const paymentIds = [...new Set((allocations || []).map((a:any)=>a.payment_id).filter(Boolean))];
  const { data: payments, error: paymentError } = paymentIds.length ? await db.from("school_payments").select("id,status,reversed_at").in("id",paymentIds) : {data:[],error:null};
  if (paymentError) throw new Error("Unable to verify payment status");
  const validPayments = new Set((payments || []).filter((p:any)=>p.status==="Posted" && !p.reversed_at).map((p:any)=>p.id));
  const paidByCharge = new Map<string,number>();
  for (const a of (allocations || [])) if(validPayments.has(a.payment_id)) paidByCharge.set(a.charge_id,(paidByCharge.get(a.charge_id)||0)+Number(a.amount_ugx||0));
  const termIds = [...new Set([...(termRows||[]).map((t:any)=>t.term_id||t.id),...requiredCharges.map((c:any)=>c.term_id)].filter(Boolean))];
  const { data: terms, error: termsError } = termIds.length ? await db.from("academic_terms").select("id,ends_on").in("id",termIds) : {data:[],error:null};
  if (termsError) throw new Error("Unable to verify academic term dates");
  const termMap = new Map((terms||[]).map((t:any)=>[t.id,t]));
  const result: Record<string,any> = {};
  for (const target of (termRows||[])) {
    const targetId = target.term_id || target.id;
    const targetTerm = termMap.get(targetId);
    const relevant = targetTerm ? requiredCharges.filter((c:any)=>{
      if(!c.term_id) return true;
      const chargeTerm:any = termMap.get(c.term_id);
      return !!chargeTerm && String(chargeTerm.ends_on||"") <= String(targetTerm.ends_on||"");
    }) : [];
    const currentCount = relevant.filter((c:any)=>c.term_id===targetId).length;
    const billed = relevant.reduce((sum:number,c:any)=>sum+Number(c.amount_ugx||0),0);
    const paid = relevant.reduce((sum:number,c:any)=>sum+(paidByCharge.get(c.id)||0),0);
    const outstanding = Math.max(0,billed-paid);
    const configured = !!targetTerm && !!targetTerm.ends_on && currentCount>0;
    const cleared = configured && outstanding===0;
    result[targetId] = { cleared, configured, required_charge_count:relevant.length, billed_ugx:billed, allocated_ugx:paid, outstanding_ugx:outstanding };
    await db.from("parent_report_access_audit").insert({
      guardian_contact_id:contactId,student_id:studentId,term_id:targetId,
      decision:!configured?"not_configured":cleared?"unlocked":"locked",
      required_charge_count:relevant.length,required_total_ugx:billed,allocated_total_ugx:paid,outstanding_ugx:outstanding
    });
  }
  return result;
}

async function handle(req: Request) {
  if (req.method !== "POST") return jsonError("Method not allowed",405);
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 6_000_000) return jsonError("Request is too large.",413);
  const input = await req.json().catch(() => null);
  if (!input || typeof input !== "object") return jsonError("Invalid request");
  const action = String(input.action || "");

  if (action === "auth-method") {
    const { data, error } = await db.rpc("parent_portal_guardian_pin_required");
    if (error || typeof data !== "boolean") {
      return jsonError("Parent Portal sign-in settings are temporarily unavailable. Please try again.",503);
    }
    return reply({ guardian_pin_required: data });
  }

  if (action === "verify") {
    const code = String(input.pupil_code || "").trim();
    const phone = normalizePhone(String(input.phone || ""));
    const pin = String(input.pin || "");
    if (!code || code.length > 32 || !phone) {
      return jsonError("Enter the learner pupil code and registered guardian phone number.",400);
    }

    const { data: pinRequired, error: settingError } = await db.rpc("parent_portal_guardian_pin_required");
    if (settingError || typeof pinRequired !== "boolean") {
      return jsonError("Parent Portal sign-in settings are temporarily unavailable. Please try again.",503);
    }

    let learnerData: any;
    let verifyError: any = null;
    if (pinRequired) {
      if (!/^\d{8}$/.test(pin)) {
        return jsonError("Guardian PIN is now required by the school. Enter the 8-digit PIN and try again.",400);
      }
      const result = await db.rpc("parent_portal_get_learner_with_pin", {
        p_pupil_code: code, p_registered_phone: phone, p_pin: pin
      });
      learnerData = result.data;
      verifyError = result.error;
    } else {
      const result = await db.rpc("parent_portal_get_learner_by_code_and_phone", {
        p_pupil_code: code,
        p_registered_phone: phone
      });
      learnerData = result.data;
      verifyError = result.error;
    }

    if (verifyError || learnerData?.error) return jsonError("Guardian verification failed. Check the learner code and registered phone number, or contact the school office.",401);
    const learnerCode = learnerData?.learner?.pupil_code;
    if (!learnerCode) return jsonError("Guardian verification could not be completed.",401);
    if (code.toUpperCase() !== String(learnerCode).toUpperCase()) {
      learnerData.code_change_notice = {
        previous_code_entered: code,
        current_pupil_code: learnerCode,
        message: "The code entered is an older school code that remains linked to this learner’s record. Please use the current permanent pupil code shown here for future sign-ins. The learner’s history and parent access remain linked."
      };
    }
    const { data: student, error: studentError } = await db.from("students").select("id").eq("admission_number",learnerCode).maybeSingle();
    if (studentError || !student) return jsonError("Guardian verification failed.",401);
    const { data: contact, error: contactError } = await db.from("parent_guardian_contacts")
      .select("id").eq("student_id",student.id).eq("phone_e164",phone).eq("is_active",true).limit(1).maybeSingle();
    if (contactError || !contact) return jsonError("Guardian verification failed.",401);
    const { data: academicHistory, error: historyError } = await db.rpc("parent_portal_academic_history",{p_student_id:student.id});
    if (historyError || !academicHistory) return jsonError("Academic history is temporarily unavailable. Please try again.",503);
    const reportTerms = academicHistory.report_cards || [];
    let feeStatus: Record<string,any>;
    try { feeStatus = await getFeeClearance(student.id,contact.id,reportTerms); }
    catch { return jsonError("The school-fee clearance could not be verified. End-of-Term records remain protected.",503); }
    const termStatus = (termId:string) => feeStatus[termId] || {cleared:false,configured:false};
    const classify = (row:any) => {
      const label = (String(row.assessment_type||"")+" "+String(row.assessment||row.assessment_title||"")).toLowerCase();
      if (label.includes("begin") || label.includes("start")) return "beginning";
      if (label.includes("mid")) return "mid";
      return "end";
    };
    learnerData.assessments = (academicHistory.results||[]).filter((row:any)=> {
      const period = classify(row);
      return period==="beginning" || period==="mid" || termStatus(row.term_id).cleared===true;
    });
    learnerData.published_reports = reportTerms.filter((row:any)=>termStatus(row.term_id).cleared===true);
    learnerData.locked_reports = reportTerms.filter((row:any)=>termStatus(row.term_id).cleared!==true).map((row:any)=>({
      term:row.term,academic_year:row.academic_year,lock_reason:termStatus(row.term_id).configured?"End-of-Term report is not available until required school fees are fully cleared.":"End-of-Term report is waiting for the school's fee-clearance policy to be configured."
    }));
    const token=randomToken(),tokenHash=await sha256(token),expires=new Date(Date.now()+12*60*60*1000).toISOString();
    const ua=req.headers.get("user-agent")||"";
    const {error:sessionError}=await db.from("parent_portal_sessions").insert({
      token_hash:tokenHash,guardian_contact_id:contact.id,student_id:student.id,
      expires_at:expires,user_agent_hash:await sha256(ua.slice(0,512))
    });
    if(sessionError)return jsonError("A secure parent session could not be created. Please try again.",503);
    return reply({session_token:token,expires_at:expires,learner:learnerData});
  }

  if (action === "reset-pin") {
    const phone = normalizePhone(String(input.phone || ""));
    const recovery = String(input.recovery_code || "").trim(), nextPin = String(input.new_pin || "");
    if (!phone || !recovery || !/^\d{8}$/.test(nextPin)) return jsonError("Check the registered phone number, recovery code and new 8-digit PIN.");
    const { data, error } = await db.rpc("parent_reset_guardian_pin_by_phone", {
      p_registered_phone:phone, p_recovery_code:recovery, p_new_pin:nextPin
    });
    if (error || data !== true) return jsonError("PIN reset failed. Check the registered number and recovery code, or contact the school office.",401);
    return reply({ success:true });
  }

  if (action === "change-pin") {
    const phone = normalizePhone(String(input.phone || ""));
    const currentPin = String(input.current_pin || ""), nextPin = String(input.new_pin || "");
    if (!phone || !/^\d{8}$/.test(currentPin) || !/^\d{8}$/.test(nextPin)) return jsonError("Enter the registered phone number and valid current/new 8-digit PINs.");
    const { data, error } = await db.rpc("parent_change_guardian_pin_by_phone", {
      p_registered_phone:phone, p_current_pin:currentPin, p_new_pin:nextPin
    });
    if (error || data !== true) return jsonError("PIN could not be changed. Check your current PIN or contact the school office.",401);
    return reply({ success:true });
  }

  if (action === "staff-inbox" || action === "staff-reply" || action === "staff-status") {
    const ss=await getStaffSession(req);if(!ss)return jsonError("A valid active school staff session is required.",401);
    const uid=ss.user.id,isAdmin=ss.staff.role==="Admin";
    if(action==="staff-inbox"){
      let query=db.from("parent_school_messages").select("id,student_id,guardian_contact_id,recipient_kind,recipient_user_id,category,message_type,subject,body,media_path,media_duration_seconds,status,created_at,updated_at").order("created_at",{ascending:false}).limit(100);
      if(!isAdmin)query=query.eq("recipient_kind","staff").eq("recipient_user_id",uid);
      const {data:messages,error}=await query;if(error)return jsonError("Parent message inbox is temporarily unavailable.",503);
      const rows=messages||[],sids=[...new Set(rows.map((m:any)=>m.student_id).filter(Boolean))],cids=[...new Set(rows.map((m:any)=>m.guardian_contact_id).filter(Boolean))];
      const {data:learners,error:le}=sids.length?await db.from("students").select("id,admission_number,first_name,middle_name,last_name,class_id").in("id",sids):{data:[],error:null};
      if(le)return jsonError("Learner details could not be loaded.",503);
      const classIds=[...new Set((learners||[]).map((l:any)=>l.class_id).filter(Boolean))];
      const {data:classes}=classIds.length?await db.from("school_classes").select("id,name").in("id",classIds):{data:[]};
      const {data:contacts,error:ce}=cids.length?await db.from("parent_guardian_contacts").select("id,guardian_name,relationship").in("id",cids):{data:[],error:null};
      if(ce)return jsonError("Guardian details could not be loaded.",503);
      const ids=rows.map((m:any)=>m.id);
      const {data:events,error:ee}=ids.length?await db.from("parent_school_message_events").select("message_id,actor_user_id,event_type,event_data,created_at").in("message_id",ids).order("created_at",{ascending:true}):{data:[],error:null};
      if(ee)return jsonError("Conversation history is temporarily unavailable.",503);
      const lm=new Map((learners||[]).map((x:any)=>[x.id,x])),cm=new Map((classes||[]).map((x:any)=>[x.id,x.name])),gm=new Map((contacts||[]).map((x:any)=>[x.id,x])),em=new Map<string,any[]>();
      for(const ev of(events||[]))if(ev.event_type==="staff_reply"){if(!em.has(ev.message_id))em.set(ev.message_id,[]);em.get(ev.message_id)!.push({body:String(ev.event_data?.body||""),created_at:ev.created_at,author_name:ev.actor_user_id===uid?"You":"School staff"});}
      const items=[];
      for(const row of rows){const l:any=lm.get(row.student_id),g:any=gm.get(row.guardian_contact_id);let audio_url=null;if(row.media_path){const {data:signed}=await db.storage.from("parent-voice-notes").createSignedUrl(row.media_path,300);audio_url=signed?.signedUrl||null;}
        items.push({id:row.id,category:row.category,message_type:row.message_type,subject:row.subject,body:row.body,status:row.status,created_at:row.created_at,updated_at:row.updated_at,recipient_kind:row.recipient_kind,audio_url,learner_name:l?[l.first_name,l.middle_name,l.last_name].filter(Boolean).join(" "):"Learner record unavailable",pupil_code:l?.admission_number||"—",class_name:l?cm.get(l.class_id)||"—":"—",guardian_name:g?.guardian_name||"Guardian",guardian_relationship:g?.relationship||"",replies:em.get(row.id)||[]});
      }
      return reply({messages:items,staff:{id:uid,name:ss.staff.full_name,role:ss.staff.role}});
    }
    const mid=String(input.message_id||"");if(!/^[0-9a-f-]{36}$/i.test(mid))return jsonError("Choose a valid parent message.");
    const {data:target,error:te}=await db.from("parent_school_messages").select("id,recipient_kind,recipient_user_id").eq("id",mid).maybeSingle();
    if(te||!target||(!isAdmin&&(target.recipient_kind!=="staff"||target.recipient_user_id!==uid)))return jsonError("This parent message is not assigned to your account.",403);
    if(action==="staff-reply"){
      const body=String(input.body||"").trim();if(!body||body.length>4000)return jsonError("Write a reply of up to 4,000 characters.");
      const {error:re}=await db.from("parent_school_message_events").insert({message_id:mid,actor_user_id:uid,actor_kind:"staff",event_type:"staff_reply",event_data:{body}});
      if(re)return jsonError("Your reply could not be saved. Please try again.",503);
      const {error:ue}=await db.from("parent_school_messages").update({status:"answered",updated_at:new Date().toISOString()}).eq("id",mid);
      if(ue)return jsonError("Your reply was saved, but the status could not be updated. Refresh the inbox.",503);
      return reply({success:true,status:"answered"});
    }
    const status=String(input.status||"");if(!["open","in_progress","answered","closed"].includes(status))return jsonError("Choose a valid message status.");
    const {error:ue}=await db.from("parent_school_messages").update({status,updated_at:new Date().toISOString()}).eq("id",mid);if(ue)return jsonError("The message status could not be updated.",503);
    const {error:ae}=await db.from("parent_school_message_events").insert({message_id:mid,actor_user_id:uid,actor_kind:"staff",event_type:"status_changed",event_data:{status}});
    if(ae)return jsonError("Status changed, but its audit event could not be recorded.",503);
    return reply({success:true,status});
  }

  const session = await getSession(req);
  if (!session) return jsonError("Parent session expired. Please sign in again.",401);

  if (action === "photo") {
    const { data: learner, error: learnerError } = await db.from("students")
      .select("photo_path").eq("id",session.student_id).maybeSingle();
    if (learnerError) return jsonError("Learner photo is temporarily unavailable.",503);
    if (!learner?.photo_path) return reply({ photo_url:null });
    const { data: signed, error: signError } = await db.storage.from("learner-photos").createSignedUrl(learner.photo_path,300);
    if (signError || !signed?.signedUrl) return jsonError("Learner photo is temporarily unavailable.",503);
    return reply({ photo_url:signed.signedUrl, expires_in_seconds:300 });
  }

  if (action === "directory") {
    const [{data,error},{data:school,error:schoolError}] = await Promise.all([
      db.from("user_profiles").select("id,full_name,job_title,department,role,parent_contact_phone,parent_contact_visible")
        .eq("employment_status","Active"),
      db.from("school_public_contact_settings").select("school_phone,school_email,school_website,school_address").eq("id",1).maybeSingle()
    ]);
    if (error || schoolError) return jsonError("School contact directory is temporarily unavailable.",503);
    const rank=(p:any)=>{const title=String(p.job_title||p.role||"").toLowerCase();const order=["director","headteacher","deputy headteacher","director of studies","bursar","deputy bursar","nursery head","senior woman","senior man","patron","matron","class teacher","teacher","store manager","cook"];const i=order.findIndex(x=>title.includes(x));return i<0?100:i;};
    const staff=(data||[]).map((p:any)=>({id:p.id,full_name:p.full_name,job_title:p.job_title||p.role,department:p.department,public_phone:p.parent_contact_visible===true?String(p.parent_contact_phone||"").trim()||null:null,contact_available:p.parent_contact_visible===true&&!!String(p.parent_contact_phone||"").trim()})).sort((a:any,b:any)=>rank(a)-rank(b)||String(a.full_name||"").localeCompare(String(b.full_name||"")));
    return reply({staff,school:school||{school_phone:null,school_email:null,school_website:null,school_address:null},administration_available:true});
  }

  if (action === "send") {
    const recipientKind = input.recipient_kind === "administration" ? "administration" : "staff";
    const recipientId = recipientKind === "staff" ? String(input.recipient_user_id || "") : null;
    const category = ["message","question","feedback","issue"].includes(input.category) ? input.category : "message";
    const type = input.message_type === "voice" ? "voice" : "text";
    const subject = String(input.subject || "").trim().slice(0,120) || null;
    let body: string | null = String(input.body || "").trim() || null;
    let mediaPath: string | null = null, mime: string | null = null, size: number | null = null, duration: number | null = null;
    if (recipientKind === "staff") {
      if (!/^[0-9a-f-]{36}$/i.test(recipientId || "")) return jsonError("Choose an active staff member.");
      const { data: staff } = await db.from("user_profiles").select("id").eq("id",recipientId).eq("employment_status","Active").maybeSingle();
      if (!staff) return jsonError("That staff member is not currently available.",403);
    }
    if (type === "text") {
      if (!body || body.length > 4000) return jsonError("Write a message of up to 4,000 characters.");
    } else {
      mime = String(input.media_mime_type || "");
      duration = Number(input.media_duration_seconds);
      const base64 = String(input.audio_base64 || "");
      if (!["audio/webm","audio/ogg","audio/mp4","audio/mpeg"].includes(mime) || !Number.isInteger(duration) || duration < 1 || duration > 180 || !base64 || base64.length > 5600000) return jsonError("Voice notes must be an accepted audio format and no longer than 3 minutes.");
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(base64.replace(/^data:[^,]+,/,"")), c => c.charCodeAt(0)); } catch { return jsonError("The voice note could not be read."); }
      if (bytes.length < 1 || bytes.length > 4194304) return jsonError("Voice notes must be 4 MB or smaller.");
      size = bytes.length;
      const ext = mime === "audio/webm" ? "webm" : mime === "audio/ogg" ? "ogg" : mime === "audio/mp4" ? "m4a" : "mp3";
      mediaPath = session.student_id + "/" + session.guardian_contact_id + "/" + crypto.randomUUID() + "." + ext;
      const { error: uploadError } = await db.storage.from("parent-voice-notes").upload(mediaPath, bytes, { contentType:mime, upsert:false });
      if (uploadError) return jsonError("The voice note could not be stored securely.",503);
      body = null;
    }
    const since = new Date(Date.now()-10*60*1000).toISOString();
    const { count: recent } = await db.from("parent_school_messages").select("id",{count:"exact",head:true}).eq("guardian_contact_id",session.guardian_contact_id).gte("created_at",since);
    const daySince = new Date(Date.now()-24*60*60*1000).toISOString();
    const { count: daily } = await db.from("parent_school_messages").select("id",{count:"exact",head:true}).eq("guardian_contact_id",session.guardian_contact_id).gte("created_at",daySince);
    if ((recent || 0) >= 5 || (daily || 0) >= 20) {
      if (mediaPath) await db.storage.from("parent-voice-notes").remove([mediaPath]);
      return jsonError("Message limit reached. Please try again later.",429);
    }
    const { data: message, error: insertError } = await db.from("parent_school_messages").insert({
      guardian_contact_id:session.guardian_contact_id, student_id:session.student_id,
      recipient_kind:recipientKind, recipient_user_id:recipientId, category, message_type:type,
      subject, body, media_path:mediaPath, media_mime_type:mime, media_size_bytes:size,
      media_duration_seconds:duration
    }).select("id,category,message_type,status,created_at,recipient_kind").single();
    if (insertError) {
      if (mediaPath) await db.storage.from("parent-voice-notes").remove([mediaPath]);
      return jsonError("Your message could not be sent. Please try again.",503);
    }
    await db.from("parent_school_message_events").insert({ message_id:message.id, actor_kind:"guardian", event_type:"created", event_data:{ recipient_kind:recipientKind, category } });
    return reply({ message });
  }

  if (action === "history") {
    const {data,error}=await db.from("parent_school_messages").select("id,category,message_type,subject,body,media_path,media_mime_type,media_duration_seconds,status,created_at,updated_at,recipient_kind,recipient_user_id").eq("guardian_contact_id",session.guardian_contact_id).eq("student_id",session.student_id).order("created_at",{ascending:false}).limit(100);
    if(error)return jsonError("Message history is temporarily unavailable.",503);
    const recipientIds=[...new Set((data||[]).map((r:any)=>r.recipient_user_id).filter(Boolean))],ids=(data||[]).map((r:any)=>r.id);
    const [{data:recipients},{data:events,error:eventError}]=await Promise.all([
      recipientIds.length?db.from("user_profiles").select("id,full_name,job_title").in("id",recipientIds):Promise.resolve({data:[]}),
      ids.length?db.from("parent_school_message_events").select("message_id,event_type,event_data,created_at").in("message_id",ids).eq("event_type","staff_reply").order("created_at",{ascending:true}):Promise.resolve({data:[],error:null})
    ]);
    if(eventError)return jsonError("Message replies are temporarily unavailable.",503);
    const rm=new Map((recipients||[]).map((p:any)=>[p.id,[p.job_title,p.full_name].filter(Boolean).join(" · ")])),replyMap=new Map<string,any[]>();
    for(const ev of(events||[])){if(!replyMap.has(ev.message_id))replyMap.set(ev.message_id,[]);replyMap.get(ev.message_id)!.push({body:String(ev.event_data?.body||""),created_at:ev.created_at,author_name:"CORNHILL School"});}
    const items=[];for(const row of(data||[])){let audio_url=null;if(row.media_path){const {data:signed}=await db.storage.from("parent-voice-notes").createSignedUrl(row.media_path,300);audio_url=signed?.signedUrl||null;}
      items.push({...row,recipient_name:row.recipient_kind==="administration"?"School Administration":(rm.get(row.recipient_user_id)||"Staff member"),media_path:undefined,audio_url,staff_replies:replyMap.get(row.id)||[]});
    }
    return reply({messages:items});
  }if (action === "signout") {
    await db.from("parent_portal_sessions").update({ revoked_at:new Date().toISOString() }).eq("id",session.id);
    return reply({ signed_out:true });
  }
  return jsonError("Unknown action");
}

Deno.serve(async (req: Request) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:c.headers});
  if (!c.allowed) return reply({error:"Origin not allowed"},403,c.headers);
  try { return await handle(req).then(r => {
    const headers = new Headers(r.headers);
    for (const [k,v] of Object.entries(c.headers)) headers.set(k,v);
    return new Response(r.body,{status:r.status,headers});
  }); } catch (e) {
    console.error("parent-portal-api failure", e instanceof Error ? e.message : "unknown");
    return reply({error:"The parent portal service is temporarily unavailable."},500,c.headers);
  }
});
