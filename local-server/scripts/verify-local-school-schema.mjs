import { readLocalDatabaseConfig } from "../src/db/config.mjs";

const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'cornhill_school' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  const expected = [
    "admission_enquiries",
    "admission_events",
    "classes",
    "enrolment_periods",
    "guardian_contacts",
    "learners"
  ];
  assert(JSON.stringify(tables.rows.map(row => row.table_name)) === JSON.stringify(expected),
    "Local school schema must contain exactly the six expected learner/admissions tables.");

  const classes = await pool.query(
    "SELECT class_code, display_name, section, level_order FROM cornhill_school.classes ORDER BY level_order"
  );
  assert(classes.rows.length === 10, "Expected Baby, Middle, Top and P.1 through P.7.");
  assert(classes.rows.slice(0, 3).every(row => row.section === "Nursery"), "First three levels must be Nursery.");
  assert(classes.rows.slice(3).every(row => row.section === "Primary"), "Primary classes must follow Nursery.");
  assert(classes.rows[9]?.class_code === "P7", "P.7 must be the final seeded class.");

  const permissionCount = await pool.query(
    "SELECT count(*)::int AS count FROM cornhill_auth.permission_catalog"
  );
  assert(permissionCount.rows[0]?.count === 19, "Expected 19 permission catalogue entries after admissions permissions are added.");

  const publicAccess = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'cornhill_school'
        AND a.grantee = 0
        AND a.privilege_type IN ('USAGE', 'CREATE')
    ) AS public_access
  `);
  assert(publicAccess.rows[0]?.public_access === false, "PUBLIC must not access the local school schema.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const first = await client.query("INSERT INTO cornhill_school.learners (first_name, last_name, gender) VALUES ('CI', 'LearnerA', 'Female') RETURNING id, pupil_code");
    const second = await client.query("INSERT INTO cornhill_school.learners (first_name, last_name, gender) VALUES ('CI', 'LearnerB', 'Male') RETURNING id, pupil_code");
    assert(first.rows[0].pupil_code !== second.rows[0].pupil_code, "Generated pupil codes must be unique.");
    assert(/^CH-[0-9]{4}-[0-9]{6}$/.test(first.rows[0].pupil_code), "Generated pupil code must use the expected school format.");

    let immutableRejected = false;
    try {
      await client.query("UPDATE cornhill_school.learners SET pupil_code = 'CH-9999-999999' WHERE id = $1", [first.rows[0].id]);
    } catch (error) {
      immutableRejected = error.code === "23514";
    }
    assert(immutableRejected, "Permanent pupil code must reject updates.");

    await client.query("UPDATE cornhill_school.learners SET lin = 'UG-CI-LIN-001' WHERE id = $1", [first.rows[0].id]);
    let duplicateLinRejected = false;
    try {
      await client.query("UPDATE cornhill_school.learners SET lin = 'UG-CI-LIN-001' WHERE id = $1", [second.rows[0].id]);
    } catch (error) {
      duplicateLinRejected = error.code === "23505";
    }
    assert(duplicateLinRejected, "LIN must be unique when supplied.");

    const guardian = await client.query(
      "INSERT INTO cornhill_school.guardian_contacts (learner_id, guardian_name, phone_e164, is_primary) VALUES ($1, 'CI Guardian', '+256700000001', true) RETURNING id",
      [first.rows[0].id]
    );
    let duplicatePrimaryRejected = false;
    try {
      await client.query(
        "INSERT INTO cornhill_school.guardian_contacts (learner_id, guardian_name, phone_e164, is_primary) VALUES ($1, 'Second Guardian', '+256700000002', true)",
        [first.rows[0].id]
      );
    } catch (error) {
      duplicatePrimaryRejected = error.code === "23505";
    }
    assert(duplicatePrimaryRejected, "Only one active primary guardian is allowed per learner.");

    await client.query(
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id) VALUES ($1, CURRENT_DATE, (SELECT id FROM cornhill_school.classes WHERE class_code = 'P1'))",
      [first.rows[0].id]
    );
    let duplicateActivePeriodRejected = false;
    try {
      await client.query(
        "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id) VALUES ($1, CURRENT_DATE, (SELECT id FROM cornhill_school.classes WHERE class_code = 'P2'))",
        [first.rows[0].id]
      );
    } catch (error) {
      duplicateActivePeriodRejected = error.code === "23505";
    }
    assert(duplicateActivePeriodRejected, "A learner cannot have two active enrolment periods.");

    await client.query("ROLLBACK");
    console.log("Local school schema verified: six tables, ten seeded classes, unique generated and immutable pupil codes, unique LIN, guardian constraints and active enrolment integrity.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
