// CORNHILL V49: transactional office->teacher custody->learner use/return and Director surplus.
// The runtime may INSERT only; ledger entries are immutable. No school-fee/payment postings.
import {reconcileNurseryMaterialStock} from "../security/nursery-material-movement-contract.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(x){if(typeof x!=="string"||!UUID.test(x))throw new TypeError("Invalid learner or staff UUID.");return x;}
function conflict(){const e=new Error("Material stock, recipient or request conflicts.");e.code="MATERIAL_STOCK_CONFLICT";return e;}
const NUMBER=x=>{const n=Number(x??0);if(!Number.isSafeInteger(n)||n<0)throw new RangeError("Material quantity exceeds safe range.");return n;};
const FIELDS=`id::text AS id, request_id::text AS "requestId",
learner_id::text AS "learnerId", material_name AS "materialName",
movement_type AS "movementType", quantity, movement_date::text AS "movementDate",
teacher_staff_id::text AS "teacherStaffId",
recorded_by_staff_id::text AS "recordedByStaffId",
approved_by_director_staff_id::text AS "approvedByDirectorStaffId",
surplus_unit_value_ugx::text AS "surplusUnitValueUgx", reason,
created_at AS "createdAt"`;
function equal(a,b,actor){
 return a.learnerId.toLowerCase()===b.learnerId.toLowerCase()&&
 a.requestId.toLowerCase()===b.requestId.toLowerCase()&&
 a.materialName.toLowerCase()===b.materialName.toLowerCase()&&
 a.movementType===b.movementType&&Number(a.quantity)===b.quantity&&
 a.movementDate===b.movementDate&&
 (a.teacherStaffId?.toLowerCase()??null)===(b.teacherStaffId?.toLowerCase()??null)&&
 a.recordedByStaffId.toLowerCase()===actor.toLowerCase()&&
 (a.approvedByDirectorStaffId?.toLowerCase()??null)===(b.movementType==="director_surplus"?actor.toLowerCase():null)&&
 (a.surplusUnitValueUgx===null?null:Number(a.surplusUnitValueUgx))===b.surplusUnitValueUgx&&
 a.reason===b.reason;
}
export function createPostgresNurseryMaterialMovementsRepository(pool){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")throw new TypeError("Transactional Postgres pool required.");
 async function listMovements(learnerId){
  uuid(learnerId);
  const r=await pool.query(`SELECT ${FIELDS} FROM cornhill_school.nursery_material_movements
    WHERE learner_id=$1::uuid ORDER BY movement_date DESC,created_at DESC,id DESC LIMIT 1000`,[learnerId]);
  return r.rows;
 }
 async function listTeachers(){
  const r=await pool.query(`SELECT DISTINCT a.id::text AS id,a.username AS name
    FROM cornhill_auth.staff_accounts a
    JOIN cornhill_auth.staff_role_assignments sr ON sr.staff_account_id=a.id
    WHERE a.account_status='active'
      AND sr.role_code IN ('teacher','class_teacher','nursery_head')
    ORDER BY name LIMIT 300`);
  return r.rows;
 }
 async function summary(learnerId){
  uuid(learnerId);
  const r=await pool.query(`WITH received AS (
    SELECT lower(material_name) AS material_key,MIN(material_name) AS "materialName",
      SUM(quantity_received)::text AS received
    FROM cornhill_school.nursery_material_receipts
    WHERE learner_id=$1::uuid GROUP BY lower(material_name)
  ), moved AS (
    SELECT lower(material_name) AS material_key,
      COALESCE(SUM(quantity) FILTER(WHERE movement_type='teacher_issue'),0)::text AS issued,
      COALESCE(SUM(quantity) FILTER(WHERE movement_type='teacher_return'),0)::text AS returned,
      COALESCE(SUM(quantity) FILTER(WHERE movement_type='learner_used'),0)::text AS used,
      COALESCE(SUM(quantity) FILTER(WHERE movement_type='director_surplus'),0)::text AS surplus,
      COALESCE(SUM(quantity*surplus_unit_value_ugx)
          FILTER(WHERE movement_type='director_surplus'),0)::text AS "directorTransferValueUgx"
    FROM cornhill_school.nursery_material_movements
    WHERE learner_id=$1::uuid GROUP BY lower(material_name)
  )
  SELECT r."materialName",r.received,
    COALESCE(m.issued,'0') AS issued,COALESCE(m.returned,'0') AS returned,
    COALESCE(m.used,'0') AS used,COALESCE(m.surplus,'0') AS surplus,
    COALESCE(m."directorTransferValueUgx",'0') AS "directorTransferValueUgx"
  FROM received r LEFT JOIN moved m ON m.material_key=r.material_key
  ORDER BY r."materialName"`,[learnerId]);
  return r.rows.map(row=>{
   const stock=reconcileNurseryMaterialStock({
     received:NUMBER(row.received),issued:NUMBER(row.issued),returned:NUMBER(row.returned),
     used:NUMBER(row.used),surplus:NUMBER(row.surplus)});
   return {...stock,materialName:row.materialName,
     directorTransferValueUgx:NUMBER(row.directorTransferValueUgx)};
  });
 }
 async function recordMovement({actorStaffId,movement}){
  uuid(actorStaffId);uuid(movement.learnerId);uuid(movement.requestId);
  const c=await pool.connect();
  let committed=false;
  try{
   await c.query("BEGIN");
   // Serializes competing withdrawals and director transfers for the same
   // learner/material. Distinct learners can collect materials concurrently.
   await c.query("SELECT pg_advisory_xact_lock(hashtext($1::text),hashtext($2::text))",
     [movement.learnerId,movement.materialName.toLowerCase()]);
   const previous=await c.query(`SELECT ${FIELDS} FROM cornhill_school.nursery_material_movements
      WHERE request_id=$1::uuid LIMIT 1`,[movement.requestId]);
   if(previous.rows.length){
     if(!equal(previous.rows[0],movement,actorStaffId))throw conflict();
     await c.query("COMMIT");committed=true;
     return {created:false,movement:previous.rows[0]};
   }
   const l=await c.query(`SELECT l.status,c.section,l.class_id AS "classId"
      FROM cornhill_school.learners l
      JOIN cornhill_school.classes c ON c.id=l.class_id
      WHERE l.id=$1::uuid`,[movement.learnerId]);
   if(l.rows[0]?.status!=="Active"||l.rows[0]?.section!=="Nursery")throw conflict();
   if(movement.teacherStaffId){
     const t=await c.query(`SELECT a.id FROM cornhill_auth.staff_accounts a
       JOIN cornhill_auth.staff_role_assignments sr ON sr.staff_account_id=a.id
       JOIN cornhill_auth.staff_class_assignments ca
         ON ca.staff_account_id=a.id AND ca.is_active=true AND ca.class_id=$2::uuid
       WHERE a.id=$1::uuid AND a.account_status='active'
         AND sr.role_code IN ('teacher','class_teacher','nursery_head') LIMIT 1`,
       [movement.teacherStaffId,l.rows[0].classId]);
     if(!t.rows.length)throw conflict();
   }
   // Stock must be available on the MOVEMENT DAY, not merely after later
   // receipts. Backdating cannot borrow supplies that arrived afterwards.
   const r=await c.query(`SELECT COALESCE(SUM(quantity_received) FILTER
         (WHERE received_date <= $3::date),0)::text AS received,
       MIN(received_date)::text AS first_date
       FROM cornhill_school.nursery_material_receipts
       WHERE learner_id=$1::uuid AND lower(material_name)=lower($2::text)`,
       [movement.learnerId,movement.materialName,movement.movementDate]);
   const received=NUMBER(r.rows[0]?.received);
   if(received===0||movement.movementDate<r.rows[0].first_date)throw conflict();
   // Do not allow backdating past an existing movement for this material;
   // previously reconciled snapshots must remain chronologically defensible.
   const q=await c.query(`SELECT MAX(movement_date)::text AS latest,
     COALESCE(SUM(quantity) FILTER(WHERE movement_type='teacher_issue'),0)::text AS issued,
     COALESCE(SUM(quantity) FILTER(WHERE movement_type='teacher_return'),0)::text AS returned,
     COALESCE(SUM(quantity) FILTER(WHERE movement_type='learner_used'),0)::text AS used,
     COALESCE(SUM(quantity) FILTER(WHERE movement_type='director_surplus'),0)::text AS surplus,
     COALESCE(SUM(quantity) FILTER(WHERE movement_type='teacher_issue' AND teacher_staff_id=$3::uuid),0)::text AS "teacherIssued",
     COALESCE(SUM(quantity) FILTER(WHERE movement_type='teacher_return' AND teacher_staff_id=$3::uuid),0)::text AS "teacherReturned",
     COALESCE(SUM(quantity) FILTER(WHERE movement_type='learner_used' AND teacher_staff_id=$3::uuid),0)::text AS "teacherUsed"
     FROM cornhill_school.nursery_material_movements
     WHERE learner_id=$1::uuid AND lower(material_name)=lower($2::text)`,
     [movement.learnerId,movement.materialName,movement.teacherStaffId]);
   const x=q.rows[0];
   if(x.latest && movement.movementDate<x.latest)throw conflict();
   const balance=reconcileNurseryMaterialStock({
     received,issued:NUMBER(x.issued),returned:NUMBER(x.returned),
     used:NUMBER(x.used),surplus:NUMBER(x.surplus),
     teacherIssued:NUMBER(x.teacherIssued),teacherReturned:NUMBER(x.teacherReturned),
     teacherUsed:NUMBER(x.teacherUsed)});
   if(["teacher_issue","director_surplus"].includes(movement.movementType) &&
      movement.quantity>balance.officeRemaining)throw conflict();
   if(["teacher_return","learner_used"].includes(movement.movementType) &&
      movement.quantity>balance.teacherHolding)throw conflict();
   const result=await c.query(`INSERT INTO cornhill_school.nursery_material_movements
    (request_id,learner_id,material_name,movement_type,quantity,movement_date,
      teacher_staff_id,recorded_by_staff_id,approved_by_director_staff_id,
      surplus_unit_value_ugx,reason)
    VALUES ($1::uuid,$2::uuid,$3::text,$4::text,$5::integer,$6::date,
      $7::uuid,$8::uuid,$9::uuid,$10::bigint,$11::text)
    ON CONFLICT (request_id) DO NOTHING RETURNING ${FIELDS}`,[
    movement.requestId,movement.learnerId,movement.materialName,movement.movementType,
    movement.quantity,movement.movementDate,movement.teacherStaffId,actorStaffId,
    movement.movementType==="director_surplus"?actorStaffId:null,
    movement.surplusUnitValueUgx,movement.reason]);
   if(!result.rows.length) {
      const already=await c.query(`SELECT ${FIELDS} FROM cornhill_school.nursery_material_movements WHERE request_id=$1::uuid`,[movement.requestId]);
      if(!already.rows.length||!equal(already.rows[0],movement,actorStaffId))throw conflict();
      await c.query("COMMIT");committed=true;
      return {created:false,movement:already.rows[0]};
   }
   await c.query("COMMIT");committed=true;
   return {created:true,movement:result.rows[0]};
  }catch(e){if(!committed)try{await c.query("ROLLBACK");}catch{}throw e;}
  finally{c.release();}
 }
 async function recordsCentre(){
  // Director-only handler; this SQL cannot receive a classId from the browser.
  const r=await pool.query(`WITH receipts AS (
    SELECT learner_id,lower(material_name) AS key,MIN(material_name) AS name,
      SUM(quantity_received)::bigint AS received
    FROM cornhill_school.nursery_material_receipts
    GROUP BY learner_id,lower(material_name)
  ),movements AS (
    SELECT learner_id,lower(material_name) AS key,
      COALESCE(SUM(quantity) FILTER(WHERE movement_type='teacher_issue'),0)::bigint AS issued,
      COALESCE(SUM(quantity) FILTER(WHERE movement_type='teacher_return'),0)::bigint AS returned,
      COALESCE(SUM(quantity) FILTER(WHERE movement_type='learner_used'),0)::bigint AS used,
      COALESCE(SUM(quantity) FILTER(WHERE movement_type='director_surplus'),0)::bigint AS surplus,
      COALESCE(SUM(quantity*surplus_unit_value_ugx) FILTER(WHERE movement_type='director_surplus'),0)::bigint AS transfer_ugx
    FROM cornhill_school.nursery_material_movements GROUP BY learner_id,lower(material_name)
  )
  SELECT l.id::text AS "learnerId",l.pupil_code AS "pupilCode",
    trim(concat_ws(' ',l.first_name,l.middle_name,l.last_name)) AS "learnerName",
    c.display_name AS "className",r.name AS "materialName",r.received::text AS received,
    COALESCE(m.issued,0)::text AS issued,COALESCE(m.returned,0)::text AS returned,
    COALESCE(m.used,0)::text AS used,COALESCE(m.surplus,0)::text AS surplus,
    COALESCE(m.transfer_ugx,0)::text AS "directorTransferValueUgx"
  FROM receipts r JOIN cornhill_school.learners l ON l.id=r.learner_id
  JOIN cornhill_school.classes c ON c.id=l.class_id
  LEFT JOIN movements m ON m.learner_id=r.learner_id AND m.key=r.key
  WHERE c.section='Nursery'
  ORDER BY c.display_name,l.last_name,l.first_name,r.name LIMIT 1001`);
  const limited=r.rows.length>1000,rows=r.rows.slice(0,1000).map(x=>({
   learnerId:x.learnerId,pupilCode:x.pupilCode,learnerName:x.learnerName,className:x.className,
   materialName:x.materialName,directorTransferValueUgx:NUMBER(x.directorTransferValueUgx),
   ...reconcileNurseryMaterialStock({
     received:NUMBER(x.received),issued:NUMBER(x.issued),returned:NUMBER(x.returned),
     used:NUMBER(x.used),surplus:NUMBER(x.surplus)})
  }));
  return {rows,limited,financialPosting:"NOT_POSTED_TO_FINANCE",
    directorTransfers:"DIRECTOR_APPROVAL_AND_VALUATION_ONLY_NOT_AUTOMATIC_PROFIT"};
 }
 return Object.freeze({listMovements,listTeachers,summary,recordMovement,recordsCentre});
}
