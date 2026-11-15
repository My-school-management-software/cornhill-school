import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresStaffAdministrationRepository } from "../src/db/staff-administration-repositories.mjs";
const ACTOR="11111111-1111-4111-8111-111111111111";
const ACCOUNT="22222222-2222-4222-8222-222222222222";
function pool(results=[]){const calls=[];let index=0;return {calls,async query(sql,values=[]){calls.push({sql,values});return results[index++]||{rows:[],rowCount:0};}};}
test("Director administration workspace loads roles, permission catalogue, grants and staff index",async()=>{
 const db=pool([
  {rows:[{roleCode:"teacher",displayName:"Teacher"}]},
  {rows:[{permissionCode:"academics.marks_enter",category:"academics",highRisk:false}]},
  {rows:[{roleCode:"teacher",permissionCode:"academics.marks_enter"}]},
  {rows:[{id:ACCOUNT,username:"teacher.one",roles:["teacher"]}]}
 ]);
 const result=await createPostgresStaffAdministrationRepository(db).getAdministrationWorkspace();
 assert.equal(db.calls.length,4);assert.equal(result.roles[0].roleCode,"teacher");
 assert.equal(result.permissions[0].permissionCode,"academics.marks_enter");
 assert.equal(result.grants[0].roleCode,"teacher");assert.equal(result.staff[0].username,"teacher.one");
 assert.match(db.calls[3].sql,/staff_role_assignments/);
});
test("role permission changes call the database-enforced Director function",async()=>{
 const db=pool([{rows:[{result:{roleCode:"teacher",permissionCount:1}}]}]);
 const result=await createPostgresStaffAdministrationRepository(db).setRolePermissions({
  actorStaffId:ACTOR,roleCode:"teacher",permissionCodes:["academics.marks_enter"]
 });
 assert.equal(result.permissionCount,1);
 assert.match(db.calls[0].sql,/set_staff_role_permissions/);
 assert.deepEqual(db.calls[0].values,[ACTOR,"teacher",["academics.marks_enter"]]);
});
test("staff account repository receives only the already-hashed password",async()=>{
 const db=pool([{rows:[{result:{staffAccountId:ACCOUNT,username:"teacher.one",roleCode:"teacher"}}]}]);
 const result=await createPostgresStaffAdministrationRepository(db).createStaffAccount({
  actorStaffId:ACTOR,username:"teacher.one",email:null,passwordHash:"$argon2id$hashed",
  staffNumber:"TCH-001",legalName:"Teacher One",preferredName:null,jobTitle:"Class Teacher",
  department:"Primary",phoneE164:null,roleCode:"teacher",hiredOn:"2026-11-15"
 });
 assert.equal(result.staffAccountId,ACCOUNT);
 assert.match(db.calls[0].sql,/create_staff_account/);
 assert.ok(db.calls[0].values.includes("$argon2id$hashed"));
 assert.ok(!db.calls[0].values.includes("plaintext-password"));
});
test("invalid role and permission-list size are rejected before SQL",async()=>{
 const db=pool();
 const repo=createPostgresStaffAdministrationRepository(db);
 await assert.rejects(repo.setRolePermissions({actorStaffId:ACTOR,roleCode:"bad role",permissionCodes:[]}),/invalid/);
 await assert.rejects(repo.setRolePermissions({actorStaffId:ACTOR,roleCode:"teacher",permissionCodes:Array(51).fill("academics.marks_enter")}),/invalid/);
 assert.equal(db.calls.length,0);
});
