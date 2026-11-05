import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return out(405,{error:"Method not allowed."});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SECRET_KEY")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return out(500,{error:"Teacher account service is not configured."});
 const token=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return out(401,{error:"Sign in as administrator first."});
 const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:auth,error:authErr}=await admin.auth.getUser(token);if(authErr||!auth.user)return out(401,{error:"Administrator session is invalid."});
 const {data:actor,error:actorErr}=await admin.from("user_profiles").select("role").eq("id",auth.user.id).single();if(actorErr||actor?.role!=="Admin")return out(403,{error:"Only a school administrator can create or reset class teacher codes."});
 let p:Record<string,unknown>;try{p=await req.json()}catch{return out(400,{error:"Invalid request."})}
 const classKey=String(p.class_key||"").trim(),teacherName=String(p.teacher_name||"").trim(),code=String(p.class_code||"").trim().toLowerCase();
 if(!/^(Baby|Middle|Top|P[1-7])$/.test(classKey))return out(400,{error:"Choose a valid class."});
 if(teacherName.length<2||teacherName.length>120)return out(400,{error:"Enter the teacher's name."});
 if(code.length<8||code.length>72||!/[a-z]/.test(code)||!/[0-9]/.test(code))return out(400,{error:"Use at least 8 characters, including at least one letter and one number."});
 const {data:cls,error:ce}=await admin.from("school_classes").select("id,name").ilike("name",classKey).maybeSingle();if(ce||!cls)return out(404,{error:"That class is not configured."});
 const email="teacher."+classKey.toLowerCase()+"@cornhill.school";
 const {data:list,error:le}=await admin.auth.admin.listUsers({page:1,perPage:1000});if(le)return out(500,{error:"Could not check existing teacher account."});
 const old=list.users.find(u=>(u.email||"").toLowerCase()===email);let uid:string;
 if(old){uid=old.id;const {error}=await admin.auth.admin.updateUserById(uid,{password:code,email_confirm:true,user_metadata:{name:teacherName,class_key:classKey}});if(error)return out(400,{error:"Could not reset code: "+error.message})}
 else{const {data,error}=await admin.auth.admin.createUser({email,password:code,email_confirm:true,user_metadata:{name:teacherName,class_key:classKey}});if(error||!data.user)return out(400,{error:"Could not create teacher account: "+(error?.message||"Unknown error")});uid=data.user.id}
 const {error:pe}=await admin.from("user_profiles").upsert({id:uid,full_name:teacherName,role:"Teacher",employment_status:"Active",job_title:"Class Teacher",department:cls.name},{onConflict:"id"});if(pe)return out(500,{error:"Teacher profile could not be saved."});
 const {error:ae}=await admin.from("class_teacher_access").upsert({class_id:cls.id,user_id:uid},{onConflict:"class_id"});if(ae)return out(500,{error:"Class access could not be saved: "+ae.message});
 const group=["Baby","Middle","Top"].includes(classKey)?"Nursery":["P1","P2","P3"].includes(classKey)?"P1-P3":"P4-P7";
 const {data:curr,error:currErr}=await admin.from("school_curriculum_subjects").select("subject_id").eq("school_level_group",group);if(currErr||!curr?.length)return out(500,{error:"Class curriculum subjects could not be loaded."});
 const rows=curr.map(x=>({class_id:cls.id,subject_id:x.subject_id,teacher_user_id:uid}));
 const {error:se}=await admin.from("class_subjects").upsert(rows,{onConflict:"class_id,subject_id"});if(se)return out(500,{error:"Class subjects could not be assigned: "+se.message});
 const {error:de}=await admin.from("class_login_directory").update({teacher_name:teacherName,updated_at:new Date().toISOString()}).eq("class_key",classKey);if(de)return out(500,{error:"Class teacher name could not be updated."});
 return out(200,{success:true,class_key:classKey,teacher_name:teacherName,subjects_assigned:rows.length});
});