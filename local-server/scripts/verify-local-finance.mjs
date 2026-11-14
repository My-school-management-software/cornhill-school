import assert from "node:assert/strict";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";

const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());

async function expectPgError(client, name, sql, values, code) {
  await client.query("SAVEPOINT " + name);
  let caught;
  try { await client.query(sql, values); } catch (error) { caught = error; }
  await client.query("ROLLBACK TO SAVEPOINT " + name);
  await client.query("RELEASE SAVEPOINT " + name);
  assert.equal(caught?.code, code, name + " should fail with PostgreSQL code " + code);
}

try {
  // Verify the dedicated finance API role can call only its scoped function.
  const roles = await pool.query(`
    SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('cornhill_finance_runtime','cornhill_finance_api')
  `);
  assert.equal(roles.rowCount, 2, "Both finance roles must exist.");
  for (const role of roles.rows) {
    assert.equal(role.rolcanlogin, false, role.rolname + " must be NOLOGIN.");
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolcreatedb, false);
    assert.equal(role.rolcreaterole, false);
    assert.equal(role.rolreplication, false);
    assert.equal(role.rolbypassrls, false);
  }
  const acl = await pool.query(`
    SELECT pg_has_role('cornhill_finance_api','cornhill_finance_runtime','MEMBER') AS member,
      has_database_privilege('cornhill_finance_api',current_database(),'CONNECT') AS can_connect,
      has_database_privilege('cornhill_finance_api',current_database(),'TEMP') AS can_temp,
      has_schema_privilege('cornhill_finance_api','cornhill_school','USAGE') AS schema_usage,
      has_schema_privilege('cornhill_finance_api','cornhill_school','CREATE') AS schema_create,
      has_table_privilege('cornhill_finance_api','cornhill_school.payment_records','SELECT') AS payment_read,
      has_table_privilege('cornhill_finance_api','cornhill_school.payment_records','INSERT') AS payment_insert,
      has_table_privilege('cornhill_finance_api','cornhill_school.payment_allocations','UPDATE') AS allocation_update,
      has_table_privilege('cornhill_finance_api','cornhill_school.payment_receipts','SELECT') AS receipt_read,
      has_sequence_privilege('cornhill_finance_api','cornhill_school.receipt_number_sequence','USAGE') AS sequence_usage,
      has_function_privilege('cornhill_finance_api',
        'cornhill_school.post_local_payment(uuid,uuid,bigint,text,uuid,jsonb,text,text,text,text,text)','EXECUTE') AS can_post,
      has_function_privilege('cornhill_finance_api',
        'cornhill_school.finance_search_learners(uuid,text)','EXECUTE') AS can_search,
      has_function_privilege('cornhill_finance_api',
        'cornhill_school.finance_get_learner_account(uuid,uuid)','EXECUTE') AS can_get_account
  `);
  const a=acl.rows[0];
  assert.equal(a.member,true);
  assert.equal(a.can_connect,true);
  assert.equal(a.can_temp,false);
  assert.equal(a.schema_usage,true);
  assert.equal(a.schema_create,false);
  assert.equal(a.payment_read,false);
  assert.equal(a.payment_insert,false);
  assert.equal(a.allocation_update,false);
  assert.equal(a.receipt_read,false);
  assert.equal(a.sequence_usage,false);
  assert.equal(a.can_post,true);
  assert.equal(a.can_search,true);
  assert.equal(a.can_get_account,true);

  // All business data below is synthetic and rolled back as one transaction.
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const staff=await client.query(
      "INSERT INTO cornhill_auth.staff_accounts(username,username_normalized,password_hash,account_status) VALUES('ci-bursar','ci-bursar','$argon2id$ci-only','active') RETURNING id"
    );
    const staffId=staff.rows[0].id;
    await client.query(
      "INSERT INTO cornhill_school.staff_profiles(staff_account_id,staff_number,legal_name,job_title) VALUES($1,'CI-BURSAR','CI Bursar','Bursar')",
      [staffId]
    );
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_assignments(staff_account_id,role_code) VALUES($1,'bursar')",
      [staffId]
    );
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_permissions(role_code,permission_code,granted_by_staff_id) VALUES('bursar','finance.payments_record',$1)",
      [staffId]
    );

    const learner=await client.query(
      "INSERT INTO cornhill_school.learners(first_name,last_name,gender) VALUES('CI','FinanceLearner','Female') RETURNING id,pupil_code"
    );
    const learnerId=learner.rows[0].id;
    await client.query(
      "INSERT INTO cornhill_school.guardian_contacts(learner_id,guardian_name,phone_e164,is_primary,is_active,sms_opt_in) VALUES($1,'CI Guardian','+256700000091',true,true,true)",
      [learnerId]
    );

    const yearOld=await client.query(
      "INSERT INTO cornhill_school.academic_years(year_label,starts_on,ends_on,status) VALUES('2091','2091-01-01','2091-12-31','Completed') RETURNING id"
    );
    const yearNow=await client.query(
      "INSERT INTO cornhill_school.academic_years(year_label,starts_on,ends_on,status) VALUES('2092','2092-01-01','2092-12-31','Active') RETURNING id"
    );
    const termOld=await client.query(
      "INSERT INTO cornhill_school.academic_terms(academic_year_id,term_number,term_name,starts_on,ends_on,status) VALUES($1,1,'Term 1','2091-01-01','2091-04-30','Completed') RETURNING id",
      [yearOld.rows[0].id]
    );
    const termNow=await client.query(
      "INSERT INTO cornhill_school.academic_terms(academic_year_id,term_number,term_name,starts_on,ends_on,status) VALUES($1,1,'Term 1','2092-01-01','2092-04-30','Active') RETURNING id",
      [yearNow.rows[0].id]
    );
    const tuition=await client.query("SELECT id FROM cornhill_school.fee_catalogue WHERE item_code='TUITION'");
    const oldFee=await client.query(
      "INSERT INTO cornhill_school.fee_obligations(learner_id,academic_term_id,fee_item_id,amount_ugx) VALUES($1,$2,$3,50000) RETURNING id",
      [learnerId,termOld.rows[0].id,tuition.rows[0].id]
    );
    const currentFee=await client.query(
      "INSERT INTO cornhill_school.fee_obligations(learner_id,academic_term_id,fee_item_id,amount_ugx) VALUES($1,$2,$3,100000) RETURNING id",
      [learnerId,termNow.rows[0].id,tuition.rows[0].id]
    );

    const args=[
      staffId,learnerId,85000,'cash','11111111-1111-4111-8111-111111111111',
      JSON.stringify([
        {fee_obligation_id:oldFee.rows[0].id,amount_ugx:50000},
        {fee_obligation_id:currentFee.rows[0].id,amount_ugx:25000}
      ]),
      null,null,'School fees','CI Parent','Previous term and current term'
    ];
    const posted=await client.query(
      "SELECT * FROM cornhill_school.post_local_payment($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)",args
    );
    assert.equal(posted.rowCount,1);
    assert.equal(posted.rows[0].payment_status,'Posted');
    assert.equal(Number(posted.rows[0].allocated_amount_ugx),75000);
    assert.equal(Number(posted.rows[0].unallocated_amount_ugx),10000);

    const retry=await client.query(
      "SELECT * FROM cornhill_school.post_local_payment($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)",args
    );
    assert.equal(retry.rows[0].payment_id,posted.rows[0].payment_id,"Retry must return the original payment.");
    assert.equal(retry.rows[0].receipt_number,posted.rows[0].receipt_number,"Retry must return the original receipt.");
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const receipt=await client.query(
      "SELECT receipt_number,receipt_data_snapshot FROM cornhill_school.payment_receipts WHERE payment_id=$1",
      [posted.rows[0].payment_id]
    );
    assert.equal(receipt.rowCount,1);
    assert.match(receipt.rows[0].receipt_number,/^CR-[0-9]{4}-[0-9]{7}$/);
    assert.equal(receipt.rows[0].receipt_data_snapshot.pupil_code,learner.rows[0].pupil_code);
    assert.equal(Number(receipt.rows[0].receipt_data_snapshot.unallocated_amount_ugx),10000);
    assert.equal(receipt.rows[0].receipt_data_snapshot.payer_name,'CI Parent');
    assert.equal(receipt.rows[0].receipt_data_snapshot.collection_item,'School fees');
    const learnerSearch=await client.query(
      "SELECT * FROM cornhill_school.finance_search_learners($1,'Finance')",
      [staffId]
    );
    assert.equal(learnerSearch.rowCount,1);
    assert.equal(learnerSearch.rows[0].learner_id,learnerId);
    assert.equal(learnerSearch.rows[0].pupil_code,learner.rows[0].pupil_code);

    const learnerAccount=await client.query(
      "SELECT cornhill_school.finance_get_learner_account($1,$2) AS account",
      [staffId,learnerId]
    );
    const account=learnerAccount.rows[0].account;
    assert.equal(account.learner.pupil_code,learner.rows[0].pupil_code);
    assert.equal(Number(account.totals.charged_ugx),150000);
    assert.equal(Number(account.totals.paid_ugx),75000);
    assert.equal(Number(account.totals.balance_ugx),75000);
    assert.equal(account.fee_obligations.length,2);

    const outbox=await client.query(
      "SELECT status,destination_phone FROM cornhill_school.payment_notification_outbox WHERE payment_id=$1",
      [posted.rows[0].payment_id]
    );
    assert.equal(outbox.rowCount,1);
    assert.equal(outbox.rows[0].status,'queued');
    assert.equal(outbox.rows[0].destination_phone,'+256700000091');

    const noPermission=await client.query(
      "INSERT INTO cornhill_auth.staff_accounts(username,username_normalized,password_hash,account_status) VALUES('ci-no-finance','ci-no-finance','$argon2id$ci-only','active') RETURNING id"
    );
    await expectPgError(client,'finance_permission_test',
      "SELECT * FROM cornhill_school.post_local_payment($1,$2,1000,'cash',$3,'[]'::jsonb)",
      [noPermission.rows[0].id,learnerId,'22222222-2222-4222-8222-222222222222'],'42501');
    await expectPgError(client,'finance_learner_lookup_permission_test',
      "SELECT * FROM cornhill_school.finance_search_learners($1,'Finance')",
      [noPermission.rows[0].id],'42501');


    await expectPgError(client,'idempotency_payload_test',
      "SELECT * FROM cornhill_school.post_local_payment($1,$2,86000,'cash',$3,$4::jsonb,NULL,NULL,'School fees','CI Parent','Previous term and current term')",
      [staffId,learnerId,'11111111-1111-4111-8111-111111111111',args[5]],'23505');

    await expectPgError(client,'fee_overpayment_test',
      "SELECT * FROM cornhill_school.post_local_payment($1,$2,80000,'cash',$3,$4::jsonb)",
      [staffId,learnerId,'33333333-3333-4333-8333-333333333333',
       JSON.stringify([{fee_obligation_id:currentFee.rows[0].id,amount_ugx:80000}])],'23514');

    await expectPgError(client,'posted_credit_mutation_test',
      "UPDATE cornhill_school.payment_records SET unallocated_amount_ugx=0 WHERE id=$1",
      [posted.rows[0].payment_id],'23514');
    await expectPgError(client,'posted_allocation_mutation_test',
      "UPDATE cornhill_school.payment_allocations SET amount_ugx=amount_ugx-1 WHERE payment_id=$1",
      [posted.rows[0].payment_id],'23514');

    const balances=await client.query(
      "SELECT paid_ugx,balance_ugx FROM cornhill_school.fee_obligation_balances WHERE fee_obligation_id=$1",
      [currentFee.rows[0].id]
    );
    assert.equal(Number(balances.rows[0].paid_ugx),25000);
    assert.equal(Number(balances.rows[0].balance_ugx),75000);

    await client.query("ROLLBACK");
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  console.log("Local finance verification passed: scoped finance privileges, split payment, unallocated credit, immutable receipt, guardian consent outbox, idempotency and rejection tests.");
} finally {
  await pool.end();
}
