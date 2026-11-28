import test from "node:test";
import assert from "node:assert/strict";
import {createPostgresNurseryMaterialMovementsRepository} from "../src/db/nursery-material-movements-repository.mjs";
const LEARNER="11111111-1111-4111-8111-111111111111";
const STAFF="22222222-2222-4222-8222-222222222222";
const TEACHER="33333333-3333-4333-8333-333333333333";
const REQ="44444444-4444-4444-8444-444444444444";
const CLASS="55555555-5555-4555-8555-555555555555";
function movement(patch={}) {
 return {learnerId:LEARNER,requestId:REQ,materialName:"Crayons",
  movementType:"teacher_issue",quantity:3,movementDate:"2026-11-28",
  teacherStaffId:TEACHER,surplusUnitValueUgx:null,reason:"For learner art lesson",...patch};
}
function ledger(options={}){
 const calls=[],sqls=[];
 const row={id:REQ,requestId:REQ,learnerId:LEARNER,materialName:"Crayons",
  movementType:"teacher_issue",quantity:3,movementDate:"2026-11-28",
  teacherStaffId:TEACHER,recordedByStaffId:STAFF,approvedByDirectorStaffId:null,
  surplusUnitValueUgx:null,reason:"For learner art lesson",createdAt:new Date()};
 const client={
  release(){calls.push("RELEASE");},
  async query(q,params){
   const s=String(q);calls.push(s.trim().slice(0,60));sqls.push({s,params});
   if(s==="BEGIN"||s==="COMMIT"||s==="ROLLBACK"||s.includes("pg_advisory_xact_lock"))return{rows:[]};
   if(s.includes("WHERE request_id=$1::uuid LIMIT 1"))return{rows:options.existing?[options.existing]:[]};
   if(s.includes("SELECT l.status,c.section"))return{rows:[{status:"Active",section:"Nursery",classId:CLASS}]};
   if(s.includes("SELECT a.id FROM cornhill_auth.staff_accounts"))return{rows:options.teacherValid===false?[]:[{id:TEACHER}]};
   if(s.includes("MIN(received_date)"))return{rows:[{received:options.received??"5",first_date:"2026-11-01"}]};
   if(s.includes("MAX(movement_date)"))return{rows:[{
    latest:options.latest??null,issued:options.issued??"0",returned:options.returned??"0",
    used:options.used??"0",surplus:options.surplus??"0",
    teacherIssued:options.teacherIssued??"0",teacherReturned:options.teacherReturned??"0",
    teacherUsed:options.teacherUsed??"0"}]};
   if(s.includes("INSERT INTO cornhill_school.nursery_material_movements"))return{rows:[row]};
   throw new Error("Unexpected SQL: "+s.slice(0,160));
  }
 };
 return {pool:{async connect(){calls.push("CONNECT");return client;},async query(){throw Error("not used");}},
   calls,sqls,row};
}
test("transaction issues some material only from learner's office stock",async()=>{
 const {pool,calls,sqls}=ledger();
 const result=await createPostgresNurseryMaterialMovementsRepository(pool).recordMovement({
   actorStaffId:STAFF,movement:movement()});
 assert.equal(result.created,true);
 assert.ok(calls.includes("BEGIN")&&calls.includes("COMMIT")&&calls.includes("RELEASE"));
 assert.equal(calls.includes("ROLLBACK"),false);
 assert.ok(sqls.some(x=>x.s.includes("pg_advisory_xact_lock")));
 assert.ok(sqls.some(x=>x.s.includes("received_date <= $3::date")));
 assert.ok(sqls.some(x=>x.s.includes("ca.class_id=$2::uuid")));
});
test("two materials cannot be issued when stock received only 2 and requested 3",async()=>{
 const d=ledger({received:"2"});
 await assert.rejects(
   ()=>createPostgresNurseryMaterialMovementsRepository(d.pool).recordMovement({actorStaffId:STAFF,movement:movement()}),
   {code:"MATERIAL_STOCK_CONFLICT"});
 assert.ok(d.calls.includes("ROLLBACK"));assert.ok(d.calls.includes("RELEASE"));
 assert.equal(d.calls.some(x=>x.includes("INSERT INTO")),false);
});
test("teacher recipient must be active and assigned to this learner's class",async()=>{
 const d=ledger({teacherValid:false});
 await assert.rejects(()=>createPostgresNurseryMaterialMovementsRepository(d.pool).recordMovement({
   actorStaffId:STAFF,movement:movement()}),{code:"MATERIAL_STOCK_CONFLICT"});
 assert.ok(d.calls.includes("ROLLBACK"));
});
test("a repeated same request succeeds as idempotent without second posting",async()=>{
 const d=ledger();const existing={...d.row};
 const s=ledger({existing});
 const r=await createPostgresNurseryMaterialMovementsRepository(s.pool)
  .recordMovement({actorStaffId:STAFF,movement:movement()});
 assert.equal(r.created,false);assert.ok(s.calls.includes("COMMIT"));
 assert.equal(s.calls.some(x=>x.includes("INSERT INTO")),false);
});
test("changed quantity with existing request is a blocked conflict",async()=>{
 const s=ledger({existing:{...ledger().row,quantity:1}});
 await assert.rejects(()=>createPostgresNurseryMaterialMovementsRepository(s.pool)
  .recordMovement({actorStaffId:STAFF,movement:movement()}),{code:"MATERIAL_STOCK_CONFLICT"});
});
test("teacher return cannot exceed teacher custody",async()=>{
 const s=ledger({received:"10",issued:"5",returned:"1",used:"2",
  teacherIssued:"3",teacherReturned:"1",teacherUsed:"1"});
 await assert.rejects(()=>createPostgresNurseryMaterialMovementsRepository(s.pool)
  .recordMovement({actorStaffId:STAFF,movement:movement({movementType:"teacher_return",quantity:2})}),
  {code:"MATERIAL_STOCK_CONFLICT"});
});
test("Director transfer cannot exceed verified office inventory",async()=>{
 const s=ledger({received:"10",issued:"9",returned:"0",used:"0"});
 await assert.rejects(()=>createPostgresNurseryMaterialMovementsRepository(s.pool).recordMovement({
   actorStaffId:STAFF,movement:movement({movementType:"director_surplus",
    quantity:2,teacherStaffId:null,surplusUnitValueUgx:1500,reason:"End term approved transfer"})}),
  {code:"MATERIAL_STOCK_CONFLICT"});
});
test("backdated movements preceding latest entry are refused",async()=>{
 const s=ledger({latest:"2026-11-29"});
 await assert.rejects(()=>createPostgresNurseryMaterialMovementsRepository(s.pool)
  .recordMovement({actorStaffId:STAFF,movement:movement()}),{code:"MATERIAL_STOCK_CONFLICT"});
});
test("Director Records Centre totals office and teacher custody separately",async()=>{
 const row={learnerId:LEARNER,pupilCode:"CH25F0001AB",
   learnerName:"Sample Learner",className:"Baby",materialName:"Crayons",
   received:"10",issued:"7",returned:"2",used:"3",surplus:"1",directorTransferValueUgx:"1500"};
 const pool={connect(){throw Error("not needed");},async query(s){assert.match(s,/LIMIT 1001/);return{rows:[row]};}};
 const result=await createPostgresNurseryMaterialMovementsRepository(pool).recordsCentre();
 assert.equal(result.limited,false);
 assert.equal(result.rows[0].officeRemaining,4);
 assert.equal(result.rows[0].teacherOutstanding,2);
 assert.equal(result.rows[0].directorTransferValueUgx,1500);
 assert.equal(result.financialPosting,"NOT_POSTED_TO_FINANCE");
});
test("Director report rejects invalid historic stock rather than hiding discrepancies",async()=>{
 const row={learnerId:LEARNER,pupilCode:"CH25F0001AB",
   learnerName:"Sample Learner",className:"Baby",materialName:"Crayons",
   received:"2",issued:"7",returned:"0",used:"0",surplus:"0",directorTransferValueUgx:"0"};
 const pool={connect(){throw Error("not needed");},async query(){return{rows:[row]};}};
 await assert.rejects(()=>createPostgresNurseryMaterialMovementsRepository(pool).recordsCentre(),RangeError);
});
