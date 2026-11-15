import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapDirectorAccount } from "../src/security/director-bootstrap.mjs";
const STAFF="11111111-1111-4111-8111-111111111111";
const permissionCodes=[
 "system.roles_manage","system.backups_manage","learners.read","learners.manage",
 "academics.marks_enter","academics.results_publish","finance.payments_record",
 "finance.reports_read","staff.attendance_manage","staff.payroll_read"
];
function fakePool({directorCount=0,grantCount=0,failProfile=false}={}){
 const calls=[];
 const client={
  async query(sql,values=[]){
   calls.push({sql,values});
   if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK"||sql.startsWith("LOCK TABLE"))return {rows:[],rowCount:0};
   if(sql.includes("SELECT role_code FROM cornhill_auth.staff_roles"))return {rows:[{role_code:"director"}],rowCount:1};
   if(sql.includes("FROM cornhill_auth.staff_role_assignments WHERE role_code = 'director'"))return {rows:[{count:directorCount}],rowCount:1};
   if(sql.includes("FROM cornhill_auth.staff_role_permissions"))return {rows:[{count:grantCount}],rowCount:1};
   if(sql.includes("SELECT permission_code FROM cornhill_auth.permission_catalog"))return {rows:permissionCodes.map(permission_code=>({permission_code})),rowCount:permissionCodes.length};
   if(sql.includes("INSERT INTO cornhill_auth.staff_accounts"))return {rows:[{id:STAFF,username:"school.director"}],rowCount:1};
   if(failProfile&&sql.includes("INSERT INTO cornhill_school.staff_profiles"))throw new Error("profile constraint");
   return {rows:[],rowCount:1};
  },
  release(){calls.push({released:true});}
 };
 return {calls,async connect(){return client;}};
}
const hasher={async hash(value){assert.ok(value.length>=14);return "$argon2id$test-hash";},isArgon2idHash(value){return value.startsWith("$argon2id$");}};
const input={username:"school.director",legalName:"School Director",staffNumber:"DIR-001",password:"Sufficiently-Long-Private-Secret-91",hiredOn:"2026-11-15"};
test("first Director bootstrap creates account, profile, role and full initial permission set atomically",async()=>{
 const db=fakePool();
 const result=await bootstrapDirectorAccount({pool:db,passwordHasher:hasher,...input,email:"DIRECTOR@CORNHILL.UG"});
 assert.equal(result.staffAccountId,STAFF);assert.equal(result.roleCode,"director");assert.equal(result.permissionCount,permissionCodes.length);
 assert.ok(db.calls.some(x=>x.sql==="BEGIN"));assert.ok(db.calls.some(x=>x.sql==="COMMIT"));
 assert.ok(db.calls.some(x=>x.sql.includes("INSERT INTO cornhill_auth.staff_role_permissions")));
 assert.ok(db.calls.some(x=>x.sql.includes("security.director_bootstrap_completed")));
 assert.ok(db.calls.some(x=>x.sql==="ROLLBACK")===false);
 assert.ok(db.calls.at(-1).released);
 const account=db.calls.find(x=>x.sql.includes("INSERT INTO cornhill_auth.staff_accounts"));
 assert.equal(account.values[1],"director@cornhill.ug");
 assert.equal(account.values[3],"$argon2id$test-hash");
});
test("bootstrap refuses to replace an existing Director or a previously approved permission matrix",async()=>{
 const alreadyHasDirector=fakePool({directorCount:1});
 await assert.rejects(bootstrapDirectorAccount({pool:alreadyHasDirector,passwordHasher:hasher,...input}),/already exists/);
 assert.ok(alreadyHasDirector.calls.some(x=>x.sql==="ROLLBACK"));
 const existingMatrix=fakePool({grantCount:1});
 await assert.rejects(bootstrapDirectorAccount({pool:existingMatrix,passwordHasher:hasher,...input}),/permission matrix/);
});
test("profile failure rolls back the entire Director account bootstrap",async()=>{
 const db=fakePool({failProfile:true});
 await assert.rejects(bootstrapDirectorAccount({pool:db,passwordHasher:hasher,...input}),/profile constraint/);
 assert.ok(db.calls.some(x=>x.sql==="ROLLBACK"));
 assert.equal(db.calls.some(x=>x.sql==="COMMIT"),false);
});
test("bootstrap validates password policy and real hire dates before opening the database",async()=>{
 let connected=false;const db={async connect(){connected=true;throw new Error("should not connect");}};
 await assert.rejects(bootstrapDirectorAccount({pool:db,passwordHasher:hasher,...input,password:"short"}),/14-to-128-character/);
 await assert.rejects(bootstrapDirectorAccount({pool:db,passwordHasher:hasher,...input,hiredOn:"2026-02-30"}),/hire date/);
 assert.equal(connected,false);
});
