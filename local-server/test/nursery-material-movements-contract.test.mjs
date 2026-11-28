import test from "node:test";
import assert from "node:assert/strict";
import {validateMovementInput,reconcileNurseryMaterialStock} from "../src/security/nursery-material-movement-contract.mjs";
const LEARNER="11111111-1111-4111-8111-111111111111";
const REQUEST="22222222-2222-4222-8222-222222222222";
const TEACHER="33333333-3333-4333-8333-333333333333";
const input=(x={})=>({requestId:REQUEST,materialName:"Crayons",movementType:"teacher_issue",
 quantity:3,movementDate:"2026-11-28",teacherStaffId:TEACHER,reason:"Provided for learner lessons",...x});
const validate=x=>validateMovementInput(x,{learnerId:LEARNER});

test("teacher may take some of a learner's material with date and custodian",()=>{
 const m=validate(input());assert.equal(m.learnerId,LEARNER);
 assert.equal(m.teacherStaffId,TEACHER);assert.equal(m.quantity,3);
 assert.ok(Object.isFrozen(m));
});
test("teacher may take ALL remaining supplies without automatic marking as used",()=>{
 const s=reconcileNurseryMaterialStock({received:6,issued:6,returned:0,used:0,surplus:0});
 assert.equal(s.officeRemaining,0);assert.equal(s.teacherOutstanding,6);
 assert.equal(s.totalPhysicalRemaining,6);
});
test("separate return and used movements reconcile office and custody",()=>{
 const s=reconcileNurseryMaterialStock({received:10,issued:7,returned:2,used:3,surplus:1,
  teacherIssued:5,teacherReturned:1,teacherUsed:3});
 assert.deepEqual([s.officeRemaining,s.teacherOutstanding,s.teacherHolding,s.totalPhysicalRemaining],[4,2,1,6]);
});
test("stock cannot become negative even if issue/return/use is invalid",()=>{
 for(const x of [
   {received:3,issued:4,returned:0,used:0,surplus:0},
   {received:3,issued:2,returned:0,used:3,surplus:0},
   {received:3,issued:1,returned:0,used:0,surplus:3}
 ])assert.throws(()=>reconcileNurseryMaterialStock(x),RangeError);
});
test("no class-wide, bulk or browser-supplied office actor operation",()=>{
 for(const extra of [{classId:LEARNER},{actorStaffId:TEACHER},{learnerIds:[LEARNER]},{allLearners:true}]){
   assert.throws(()=>validate(input(extra)),/Unknown movement field/);
 }
});
test("quantity must be positive whole number and plausible date",()=>{
 for(const quantity of [0,-1,1.5,1001,NaN,"5"])assert.throws(()=>validate(input({quantity})));
 for(const movementDate of ["2026-11-31","2026-02-30","28/11/2026"])assert.throws(()=>validate(input({movementDate})));
});
test("teacher actions require a valid staff UUID and never carry valuation",()=>{
 for(const movementType of ["teacher_issue","teacher_return","learner_used"]){
   assert.equal(validate(input({movementType})).movementType,movementType);
   assert.throws(()=>validate(input({movementType,teacherStaffId:null})));
   assert.throws(()=>validate(input({movementType,surplusUnitValueUgx:5})));
 }
});
test("Director surplus requires value and cannot assign material to a teacher",()=>{
 const director={...input({movementType:"director_surplus",teacherStaffId:null,surplusUnitValueUgx:1500})};
 assert.equal(validate(director).surplusUnitValueUgx,1500);
 assert.throws(()=>validate({...director,teacherStaffId:TEACHER}));
 assert.throws(()=>validate({...director,surplusUnitValueUgx:undefined}));
 assert.throws(()=>validate({...director,surplusUnitValueUgx:-5}));
});
test("surplus value is evidence, not automatic profit or payment posting",()=>{
 const m=validate(input({movementType:"director_surplus",teacherStaffId:null,surplusUnitValueUgx:900}));
 assert.equal(m.movementType,"director_surplus");assert.equal(m.surplusUnitValueUgx,900);
 assert.equal(Object.hasOwn(m,"profitPosted"),false);
});
test("notes and status are part of immutable audit contract",()=>{
 assert.throws(()=>validate(input({reason:"ab"})));
 assert.throws(()=>validate(input({reason:"\nmisleading"})));
 assert.throws(()=>validate(input({requestId:"not-uuid"})));
 assert.throws(()=>validate(input({materialName:""})));
});
