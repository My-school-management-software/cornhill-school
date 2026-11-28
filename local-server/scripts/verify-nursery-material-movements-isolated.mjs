// V49 isolated PostgreSQL17 end-to-end Nursery materials ledger acceptance.
// This WILL insert CI-only synthetic records. It refuses the real cornhill_local DB.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readLocalDatabaseConfig,readIsolatedTestDatabaseTarget} from "../src/db/config.mjs";
import {createPostgresNurseryMaterialMovementsRepository} from "../src/db/nursery-material-movements-repository.mjs";
import {validateMovementInput} from "../src/security/nursery-material-movement-contract.mjs";

const isolate=readIsolatedTestDatabaseTarget();
if (!isolate || process.env.CORNHILL_DB_TARGET!=="isolated-test" ||
    process.env.CORNHILL_DB_HOST!=="127.0.0.1" ||
    String(process.env.CORNHILL_DB_PORT)!=="54329" ||
    !/^cornhill_isolated_test_[0-9a-f]{32}$/.test(process.env.CORNHILL_DB_NAME??"")) {
  throw new Error("REFUSED: Nursery movement end-to-end tests require dedicated isolated CI PG17 target.");
}
const {Pool}=await import("pg");
const admin=new Pool(readLocalDatabaseConfig());
let client;
function dateUganda(){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Kampala",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const part=k=>parts.find(p=>p.type===k)?.value;
 return [part("year"),part("month"),part("day")].join("-");
}
const today=dateUganda();
const base=process.env.CORNHILL_DB_NAME;
async function makeFixture(){
 client=await admin.connect();
 try{
  const id=await client.query(`SELECT current_database() AS name,current_setting('server_version_num')::integer AS v,
   current_setting('port')::integer AS port,
   (SELECT system_identifier::text FROM pg_control_system()) AS sys`);
  assert.equal(id.rows[0].name,base);
  assert.ok(id.rows[0].v>=170000&&id.rows[0].v<180000);
  assert.equal(id.rows[0].sys,isolate.systemIdentifier);
  // Docker service is exposed as 54329 to the client, but listens on port 5432 inside container.
  assert.equal(id.rows[0].port,5432);
  await client.query("BEGIN");
  const office=await client.query(`INSERT INTO cornhill_auth.staff_accounts
   (username,username_normalized,password_hash,account_status,must_change_password)
   VALUES ($1,$1,$2,'active',false) RETURNING id::text AS id`,
   ["v49_ci_director_"+randomUUID().replaceAll("-",""),
    "$argon2id$test-fixture-not-a-real-password"]);
  const teacher=await client.query(`INSERT INTO cornhill_auth.staff_accounts
   (username,username_normalized,password_hash,account_status,must_change_password)
   VALUES ($1,$1,$2,'active',false) RETURNING id::text AS id`,
   ["v49_ci_teacher_"+randomUUID().replaceAll("-",""),
    "$argon2id$test-fixture-not-a-real-password"]);
  const directorId=office.rows[0].id,teacherId=teacher.rows[0].id;
  await client.query(`INSERT INTO cornhill_auth.staff_role_assignments(staff_account_id,role_code)
   VALUES ($1::uuid,'director'),($2::uuid,'class_teacher')`,[directorId,teacherId]);
  const classes=await client.query(`SELECT id::text AS id FROM cornhill_school.classes
   WHERE class_code='BABY' LIMIT 1`);
  assert.equal(classes.rows.length,1);
  const classId=classes.rows[0].id;
  await client.query(`INSERT INTO cornhill_auth.staff_class_assignments
   (staff_account_id,class_id,assignment_type,is_active)
   VALUES ($1::uuid,$2::uuid,'class_teacher',true)`,[teacherId,classId]);
  const learner=await client.query(`INSERT INTO cornhill_school.learners
   (first_name,last_name,gender,class_id,admission_date)
   VALUES ('V49CI','SyntheticOnly','Female',$1::uuid,$2::date)
   RETURNING id::text AS id`,[classId,today]);
  const learnerId=learner.rows[0].id;
  await client.query(`INSERT INTO cornhill_school.nursery_material_receipts
   (learner_id,request_id,material_name,quantity_received,received_date,recorded_by_staff_id)
   VALUES ($1::uuid,$2::uuid,'Crayons',5,$3::date,$4::uuid)`,
   [learnerId,randomUUID(),today,directorId]);
  await client.query("COMMIT");
  return {learnerId,teacherId,directorId};
 }catch(e){try{await client.query("ROLLBACK");}catch{}throw e;}
 finally{client.release();client=null;}
}
const movement=(ids,type,quantity,extra={})=>validateMovementInput({
 requestId:randomUUID(),materialName:"Crayons",movementType:type,quantity,
 movementDate:today,teacherStaffId:type==="director_surplus"?null:ids.teacherId,
 surplusUnitValueUgx:type==="director_surplus"?900:null,
 reason:"CI-only approved materials accountability",...extra
},{learnerId:ids.learnerId});
try{
 const ids=await makeFixture();
 const repo=createPostgresNurseryMaterialMovementsRepository(admin);
 let result=await repo.recordMovement({actorStaffId:ids.directorId,
   movement:movement(ids,"teacher_issue",3)});
 assert.equal(result.created,true);
 let retry=await repo.recordMovement({actorStaffId:ids.directorId,
   movement:{...movement(ids,"teacher_issue",3),requestId:result.movement.requestId,
    reason:result.movement.reason}});
 assert.equal(retry.created,false,"same request ID cannot double record");
 await repo.recordMovement({actorStaffId:ids.directorId,movement:movement(ids,"learner_used",2)});
 await repo.recordMovement({actorStaffId:ids.directorId,movement:movement(ids,"teacher_return",1)});
 await repo.recordMovement({actorStaffId:ids.directorId,movement:movement(ids,"director_surplus",1)});
 const stocks=await repo.summary(ids.learnerId);
 assert.equal(stocks.length,1);
 assert.deepEqual([stocks[0].received,stocks[0].issued,stocks[0].used,
   stocks[0].returned,stocks[0].surplus,stocks[0].officeRemaining,
   stocks[0].teacherOutstanding,stocks[0].directorTransferValueUgx],
 [5,3,2,1,1,2,0,900]);
 let blocked=false;
 try{await repo.recordMovement({actorStaffId:ids.directorId,
   movement:movement(ids,"teacher_issue",99)});}
 catch(e){blocked=e.code==="MATERIAL_STOCK_CONFLICT";}
 assert.equal(blocked,true,"Cannot issue more than learner's remaining stock");
 const centre=await repo.recordsCentre();
 const row=centre.rows.find(x=>x.learnerId===ids.learnerId&&x.materialName==="Crayons");
 assert.equal(row?.officeRemaining,2);
 assert.equal(row?.teacherOutstanding,0);
 assert.equal(row?.directorTransferValueUgx,900);
 assert.equal(centre.financialPosting,"NOT_POSTED_TO_FINANCE");
 const acl=await admin.query(`SELECT has_table_privilege('cornhill_auth_api',
  'cornhill_school.nursery_material_movements','UPDATE') AS may_update,
  has_table_privilege('cornhill_auth_api',
  'cornhill_school.nursery_material_movements','DELETE') AS may_delete`);
 assert.equal(acl.rows[0].may_update,false);
 assert.equal(acl.rows[0].may_delete,false);
 const c=await admin.connect();
 try{
  await c.query("BEGIN");
  let blockedUpdate=false;
  try{
   await c.query(`UPDATE cornhill_school.nursery_material_movements
     SET reason='hidden change' WHERE request_id=$1::uuid`,[result.movement.requestId]);
  }catch(e){blockedUpdate=e.code==="23514";}
  assert.equal(blockedUpdate,true,"Append-only trigger must reject tampering");
  await c.query("ROLLBACK");
 }finally{c.release();}
 console.log("V49_NURSERY_DISPOSABLE_POSTGRES17=PASS");
 console.log("V49_NURSERY_SIMULATED_RECEIVED=5");
 console.log("V49_NURSERY_SIMULATED_ISSUED=3");
 console.log("V49_NURSERY_SIMULATED_USED=2");
 console.log("V49_NURSERY_SIMULATED_RETURNED=1");
 console.log("V49_NURSERY_SIMULATED_DIRECTOR_SURPLUS=1");
 console.log("V49_NURSERY_SIMULATED_OFFICE_REMAINING=2");
 console.log("V49_NURSERY_SIMULATED_TEACHER_OUTSTANDING=0");
 console.log("V49_NURSERY_FINANCIAL_POSTINGS=0");
}finally{await admin.end();}
