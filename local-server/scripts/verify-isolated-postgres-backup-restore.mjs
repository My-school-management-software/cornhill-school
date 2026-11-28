import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readIsolatedTestDatabaseTarget, readLocalDatabaseConfig } from "../src/db/config.mjs";
import {
  assertIsolatedDatabaseIdentity,
  assertIsolatedPostgresServerIdentity
} from "../src/db/migrations.mjs";

const EXPECTED_MIGRATION_COUNT = 97;

function quoteIdentifier(value) {
  if (!/^cornhill_isolated_test_[a-f0-9]{32}$/.test(value)) {
    throw new Error("Refusing an invalid isolated restore database name.");
  }
  return `"${value}"`;
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", error => reject(new Error(`${command} could not start: ${error.message}`)));
    child.once("close", code => {
      if (code !== 0) {
        reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim() || "no diagnostic output"}`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function verifyToolVersion(command, env) {
  const { stdout } = await runCommand(command, ["--version"], env);
  if (!/PostgreSQL\) 17(?:\.|\s)/.test(stdout)) {
    throw new Error(`${command} must be a PostgreSQL 17 client tool.`);
  }
}

async function readIdentity(pool) {
  const result = await pool.query(`
    SELECT current_database() AS database,
           host(inet_server_addr()) AS server_address,
           current_setting('port')::integer AS port,
           current_setting('data_directory') AS data_directory,
           (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
           (SELECT count(*)::integer
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
               AND n.nspname NOT IN ('pg_catalog', 'information_schema')
               AND n.nspname NOT LIKE 'pg_toast%') AS user_object_count
  `);
  return result.rows[0];
}

async function readSchemaManifest(pool) {
  const [schemas, tables, sequences, columns, constraints, indexes, triggers, routines, views, relationSecurity, policies, objectPrivileges] = await Promise.all([
    pool.query(`
      SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
         AND schema_name NOT LIKE 'pg_toast%' AND schema_name NOT LIKE 'pg_temp%'
       ORDER BY schema_name
    `),
    pool.query(`
    SELECT table_schema, table_name, table_type
      FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_schema NOT LIKE 'pg_toast%'
     ORDER BY table_schema, table_name, table_type
    `),
    pool.query(`
      SELECT sequence_schema, sequence_name, data_type, start_value, minimum_value,
             maximum_value, increment, cycle_option
        FROM information_schema.sequences
       WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
         AND sequence_schema NOT LIKE 'pg_toast%'
       ORDER BY sequence_schema, sequence_name
    `),
    pool.query(`
      SELECT table_schema, table_name, column_name, ordinal_position, data_type,
             udt_schema, udt_name, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         AND table_schema NOT LIKE 'pg_toast%'
       ORDER BY table_schema, table_name, ordinal_position
    `),
    pool.query(`
      SELECT namespace.nspname AS table_schema, relation.relname AS table_name,
             constraint_row.conname AS constraint_name,
             constraint_row.contype::text AS constraint_type,
             constraint_row.convalidated AS is_validated,
             constraint_row.condeferrable AS is_deferrable,
             constraint_row.condeferred AS initially_deferred,
             ARRAY(
               SELECT attribute.attname
                 FROM unnest(constraint_row.conkey) WITH ORDINALITY key_column(attnum, ordinal)
                 JOIN pg_attribute attribute
                   ON attribute.attrelid = relation.oid AND attribute.attnum = key_column.attnum
                ORDER BY key_column.ordinal
             ) AS columns,
             referenced_namespace.nspname AS referenced_schema,
             referenced_relation.relname AS referenced_table,
             ARRAY(
               SELECT attribute.attname
                 FROM unnest(constraint_row.confkey) WITH ORDINALITY key_column(attnum, ordinal)
                 JOIN pg_attribute attribute
                   ON attribute.attrelid = referenced_relation.oid AND attribute.attnum = key_column.attnum
                ORDER BY key_column.ordinal
             ) AS referenced_columns
        FROM pg_constraint constraint_row
        JOIN pg_class relation ON relation.oid = constraint_row.conrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        LEFT JOIN pg_class referenced_relation ON referenced_relation.oid = constraint_row.confrelid
        LEFT JOIN pg_namespace referenced_namespace ON referenced_namespace.oid = referenced_relation.relnamespace
       WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname NOT LIKE 'pg_toast%'
       ORDER BY namespace.nspname, relation.relname, constraint_row.conname
    `),
    pool.query(`
       SELECT namespace.nspname AS table_schema, relation.relname AS table_name,
             index_relation.relname AS index_name, index_row.indisunique AS is_unique,
             index_row.indisprimary AS is_primary, index_row.indisvalid AS is_valid,
             index_row.indnkeyatts AS key_attribute_count, index_row.indnatts AS attribute_count,
              index_row.indkey::text AS attribute_numbers,
              pg_get_indexdef(index_relation.oid) AS definition
        FROM pg_index index_row
        JOIN pg_class relation ON relation.oid = index_row.indrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
       WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname NOT LIKE 'pg_toast%'
       ORDER BY namespace.nspname, relation.relname, index_relation.relname
    `),
    pool.query(`
       SELECT namespace.nspname AS table_schema, relation.relname AS table_name,
             trigger_row.tgname AS trigger_name, trigger_row.tgenabled AS enabled_state,
              function_namespace.nspname AS function_schema, function_row.proname AS function_name,
              pg_get_triggerdef(trigger_row.oid, true) AS definition
        FROM pg_trigger trigger_row
        JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
        JOIN pg_namespace function_namespace ON function_namespace.oid = function_row.pronamespace
       WHERE NOT trigger_row.tgisinternal
         AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname NOT LIKE 'pg_toast%'
       ORDER BY namespace.nspname, relation.relname, trigger_row.tgname
    `),
    pool.query(`
       SELECT namespace.nspname AS routine_schema, routine.proname AS routine_name,
             pg_get_function_identity_arguments(routine.oid) AS identity_arguments,
             pg_get_function_result(routine.oid) AS result_type,
             routine.prokind AS routine_kind, routine.prosecdef AS security_definer,
              routine.provolatile AS volatility, routine.proisstrict AS is_strict,
              routine.prosrc AS source, routine.proconfig AS configuration,
              routine.proparallel AS parallel_safety, routine.proleakproof AS leakproof,
              language.lanname AS language
        FROM pg_proc routine
        JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
         JOIN pg_language language ON language.oid = routine.prolang
       WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname NOT LIKE 'pg_toast%'
        ORDER BY namespace.nspname, routine.proname, identity_arguments
    `),
    pool.query(`
      SELECT namespace.nspname AS view_schema, relation.relname AS view_name,
             relation.relkind AS relation_kind, relation.reloptions AS options,
             pg_get_viewdef(relation.oid, true) AS definition
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       WHERE relation.relkind IN ('v', 'm')
         AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname NOT LIKE 'pg_toast%'
       ORDER BY namespace.nspname, relation.relname
    `),
    pool.query(`
      SELECT namespace.nspname AS schema_name, relation.relname AS relation_name,
             relation.relkind AS relation_kind, relation.relrowsecurity AS row_security_enabled,
             relation.relforcerowsecurity AS row_security_forced,
             owner_role.rolname AS owner
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        JOIN pg_roles owner_role ON owner_role.oid = relation.relowner
       WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
         AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname NOT LIKE 'pg_toast%'
       ORDER BY namespace.nspname, relation.relname
    `),
    pool.query(`
      SELECT namespace.nspname AS schema_name, relation.relname AS relation_name,
             policy.polname AS policy_name, policy.polcmd AS command,
             policy.polpermissive AS permissive,
             ARRAY(
               SELECT CASE WHEN policy_role.role_oid = 0 THEN 'PUBLIC' ELSE role_row.rolname END
                 FROM unnest(policy.polroles) AS policy_role(role_oid)
                 LEFT JOIN pg_roles role_row ON role_row.oid = policy_role.role_oid
                ORDER BY 1
             ) AS roles,
             pg_get_expr(policy.polqual, policy.polrelid, true) AS using_expression,
             pg_get_expr(policy.polwithcheck, policy.polrelid, true) AS check_expression
        FROM pg_policy policy
        JOIN pg_class relation ON relation.oid = policy.polrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname NOT LIKE 'pg_toast%'
       ORDER BY namespace.nspname, relation.relname, policy.polname
    `),
    pool.query(`
      SELECT object_type, object_schema, object_name, grantor, grantee,
             privilege_type, is_grantable
        FROM (
          SELECT 'schema'::text AS object_type, namespace.nspname AS object_schema,
                 ''::text AS object_name, grantor_role.rolname AS grantor,
                 CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee,
                 acl.privilege_type, acl.is_grantable
            FROM pg_namespace namespace
            CROSS JOIN LATERAL aclexplode(COALESCE(namespace.nspacl, acldefault('n'::"char", namespace.nspowner))) acl
            JOIN pg_roles grantor_role ON grantor_role.oid = acl.grantor
            LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
           WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
             AND namespace.nspname NOT LIKE 'pg_toast%'
             AND acl.grantee <> namespace.nspowner
          UNION ALL
          SELECT CASE WHEN relation.relkind = 'S' THEN 'sequence' ELSE 'relation' END,
                 namespace.nspname, relation.relname, grantor_role.rolname,
                 CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END,
                 acl.privilege_type, acl.is_grantable
            FROM pg_class relation
            JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(
              relation.relacl,
              acldefault(CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, relation.relowner)
            )) acl
            JOIN pg_roles grantor_role ON grantor_role.oid = acl.grantor
            LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
           WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
             AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
             AND namespace.nspname NOT LIKE 'pg_toast%'
             AND acl.grantee <> relation.relowner
          UNION ALL
          SELECT 'routine', namespace.nspname,
                 routine.proname || '(' || pg_get_function_identity_arguments(routine.oid) || ')',
                 grantor_role.rolname,
                 CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END,
                 acl.privilege_type, acl.is_grantable
            FROM pg_proc routine
            JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f'::"char", routine.proowner))) acl
            JOIN pg_roles grantor_role ON grantor_role.oid = acl.grantor
            LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
           WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
             AND namespace.nspname NOT LIKE 'pg_toast%'
             AND acl.grantee <> routine.proowner
        ) privilege_rows
       ORDER BY object_type, object_schema, object_name, grantor, grantee, privilege_type
    `)
  ]);
  return {
    schemas: schemas.rows,
    tables: tables.rows,
    sequences: sequences.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows,
    routines: routines.rows,
    views: views.rows,
    relationSecurity: relationSecurity.rows,
    policies: policies.rows,
    objectPrivileges: objectPrivileges.rows
  };
}

async function readDatabasePrivileges(pool) {
  const result = await pool.query(`
    SELECT CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee,
           grantor_role.rolname AS grantor, acl.privilege_type, acl.is_grantable
      FROM pg_database database_row
      CROSS JOIN LATERAL aclexplode(COALESCE(database_row.datacl, acldefault('d'::"char", database_row.datdba))) acl
      JOIN pg_roles grantor_role ON grantor_role.oid = acl.grantor
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
     WHERE database_row.datname = current_database()
     ORDER BY grantee, grantor, privilege_type
  `);
  return result.rows;
}

async function provisionRestoreDatabasePrivileges(pool, restoreDatabase) {
  const sourcePrivileges = await readDatabasePrivileges(pool);
  const sourceHasRuntimeConnect = ["cornhill_auth_runtime", "cornhill_finance_runtime"]
    .every(roleName => sourcePrivileges.some(privilege =>
      privilege.grantee === roleName && privilege.privilege_type === "CONNECT"));
  const sourceHasPublicTemporary = sourcePrivileges.some(privilege =>
    privilege.grantee === "PUBLIC" && privilege.privilege_type === "TEMPORARY");
  assert.equal(sourceHasRuntimeConnect, true, "Source database must grant CONNECT to both application runtime groups.");
  assert.equal(sourceHasPublicTemporary, false, "Source database must not grant TEMP to PUBLIC.");
  await pool.query(`
    REVOKE TEMPORARY ON DATABASE ${quoteIdentifier(restoreDatabase)}
      FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api, cornhill_finance_runtime, cornhill_finance_api;
    GRANT CONNECT ON DATABASE ${quoteIdentifier(restoreDatabase)}
      TO cornhill_auth_runtime, cornhill_finance_runtime;
  `);
}

async function createHistoryFixture(pool, staffId) {
  const yearLabel = String(2100 + (randomBytes(2).readUInt16BE(0) % 7000));
  const yearStart = `${yearLabel}-01-01`;
  const termOneEnd = `${yearLabel}-04-30`;
  const termTwoStart = `${yearLabel}-05-01`;
  const termTwoEnd = `${yearLabel}-08-31`;
  const yearEnd = `${yearLabel}-12-31`;
  await pool.query(
    "INSERT INTO cornhill_school.staff_profiles (staff_account_id, staff_number, legal_name, job_title) VALUES ($1, $2, 'CI Backup Staff', 'Director of Studies and Bursar')",
    [staffId, `CI-BACKUP-${randomBytes(5).toString("hex").toUpperCase()}`]
  );
  await pool.query(
    "INSERT INTO cornhill_auth.staff_role_assignments (staff_account_id, role_code, assigned_by) VALUES ($1, 'director_of_studies', $1), ($1, 'bursar', $1)",
    [staffId]
  );
  await pool.query(
    "INSERT INTO cornhill_auth.staff_role_permissions (role_code, permission_code, granted_by_staff_id) VALUES ('director_of_studies', 'academics.results_publish', $1), ('director_of_studies', 'learners.manage', $1), ('bursar', 'finance.payments_record', $1) ON CONFLICT (role_code, permission_code) DO NOTHING",
    [staffId]
  );

  const year = await pool.query(
    "INSERT INTO cornhill_school.academic_years (year_label, starts_on, ends_on, status, created_by_staff_id) VALUES ($1, $2, $3, 'Completed', $4) RETURNING id",
    [yearLabel, yearStart, yearEnd, staffId]
  );
  const termOne = await pool.query(
    "INSERT INTO cornhill_school.academic_terms (academic_year_id, term_number, term_name, starts_on, ends_on, status, created_by_staff_id) VALUES ($1, 1, 'Term 1', $2, $3, 'Completed', $4) RETURNING id",
    [year.rows[0].id, yearStart, termOneEnd, staffId]
  );
  const termTwo = await pool.query(
    "INSERT INTO cornhill_school.academic_terms (academic_year_id, term_number, term_name, starts_on, ends_on, status, created_by_staff_id) VALUES ($1, 2, 'Term 2', $2, $3, 'Completed', $4) RETURNING id",
    [year.rows[0].id, termTwoStart, termTwoEnd, staffId]
  );
  const classRows = await pool.query(
    "SELECT id FROM cornhill_school.classes WHERE class_code = 'P1'"
  );
  const p2Rows = await pool.query(
    "SELECT id FROM cornhill_school.classes WHERE class_code = 'P2'"
  );
  assert.equal(classRows.rowCount, 1, "Synthetic academic backup fixture requires P.1.");
  assert.equal(p2Rows.rowCount, 1, "Synthetic academic backup fixture requires P.2.");
  const learner = await pool.query(
    "INSERT INTO cornhill_school.learners (first_name, last_name, gender, class_id, admission_date, admission_year) VALUES ('CI', 'BackupLearner', 'Female', $1, $2, $3::smallint) RETURNING id, pupil_code",
    [classRows.rows[0].id, yearStart, Number(yearLabel)]
  );
  const initialEnrolment = await pool.query(
    "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id, status, created_by_staff_id) VALUES ($1, $2, $3, 'Active', $4) RETURNING id",
    [learner.rows[0].id, yearStart, classRows.rows[0].id, staffId]
  );
  const assessment = await pool.query(
    "INSERT INTO cornhill_school.assessments (academic_term_id, class_id, assessment_name, assessment_type, assessment_date, max_score, status, created_by_staff_id) VALUES ($1, $2, 'CI Backup End of Term', 'End of Term', $3, 100, 'Open', $4) RETURNING id",
    [termOne.rows[0].id, classRows.rows[0].id, termOneEnd, staffId]
  );
  const subjects = await pool.query(
    "SELECT subject.id, subject.subject_code FROM cornhill_school.subjects subject JOIN cornhill_school.class_subjects mapping ON mapping.subject_id = subject.id WHERE mapping.class_id = $1 AND mapping.is_active = true ORDER BY subject.subject_code",
    [classRows.rows[0].id]
  );
  assert.equal(subjects.rowCount, 6, "P.1 synthetic history must include all six mapped subjects.");
  for (const subject of subjects.rows) {
    await pool.query(
      "INSERT INTO cornhill_school.learner_marks (assessment_id, learner_id, class_id, subject_id, score, max_score, entered_by_staff_id) VALUES ($1, $2, $3, $4, 80, 100, $5)",
      [assessment.rows[0].id, learner.rows[0].id, classRows.rows[0].id, subject.id, staffId]
    );
  }
  await pool.query(
    "UPDATE cornhill_school.assessments SET status = 'Locked', locked_at = now(), last_updated_by_staff_id = $2, updated_at = now() WHERE id = $1",
    [assessment.rows[0].id, staffId]
  );
  await pool.query(
    "UPDATE cornhill_school.assessments SET status = 'Published', published_at = now(), last_updated_by_staff_id = $2, updated_at = now() WHERE id = $1",
    [assessment.rows[0].id, staffId]
  );
  const reportCards = await pool.query(
    "SELECT cornhill_school.generate_academic_report_cards($1::uuid, $2::uuid)::integer AS count",
    [assessment.rows[0].id, staffId]
  );
  assert.equal(reportCards.rows[0]?.count, 1, "Published P.1 assessment must create a report-card snapshot.");

  const tuition = await pool.query(
    "SELECT id FROM cornhill_school.fee_catalogue WHERE item_code = 'TUITION'"
  );
  assert.equal(tuition.rowCount, 1, "Synthetic finance backup fixture requires the tuition fee item.");
  const obligation = await pool.query(
    "INSERT INTO cornhill_school.fee_obligations (learner_id, academic_term_id, fee_item_id, amount_ugx, created_by_staff_id) VALUES ($1, $2, $3, 100000, $4) RETURNING id",
    [learner.rows[0].id, termOne.rows[0].id, tuition.rows[0].id, staffId]
  );
  const payment = await pool.query(
    "SELECT * FROM cornhill_school.post_local_payment($1::uuid, $2::uuid, 75000, 'cash', $3::uuid, $4::jsonb, NULL, NULL, 'School fees', 'CI Backup Parent', 'Synthetic backup and restore fixture')",
    [staffId, learner.rows[0].id, randomUUID(), JSON.stringify([{ fee_obligation_id: obligation.rows[0].id, amount_ugx: 50000 }])]
  );
  assert.equal(payment.rowCount, 1);
  assert.equal(payment.rows[0].payment_status, "Posted");
  assert.equal(Number(payment.rows[0].allocated_amount_ugx), 50000);

  const progression = await pool.query(
    "SELECT cornhill_school.record_learner_progression($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, 'Synthetic backup and restore fixture')",
    [staffId, learner.rows[0].id, p2Rows.rows[0].id, termTwo.rows[0].id, termTwoStart]
  );
  assert.equal(progression.rowCount, 1, "Synthetic progression must create one preserved promotion event.");
  return {
    learnerId: learner.rows[0].id,
    pupilCode: learner.rows[0].pupil_code,
    yearLabel,
    initialEnrolmentId: initialEnrolment.rows[0].id,
    progressionEventId: progression.rows[0].record_learner_progression,
    assessmentId: assessment.rows[0].id,
    paymentId: payment.rows[0].payment_id
  };
}

async function readSnapshot(pool, fixtureId, historyFixture) {
  const schemaManifest = await readSchemaManifest(pool);
  const databasePrivileges = await readDatabasePrivileges(pool);
  const ledger = await pool.query(`
    SELECT count(*)::integer AS count,
           COALESCE(string_agg(migration_name || ':' || checksum, E'\\n' ORDER BY migration_name), '') AS signature
      FROM cornhill_meta.schema_migrations
  `);
  const staffFixture = await pool.query(
    "SELECT count(*)::integer AS count FROM cornhill_auth.staff_accounts WHERE id = $1::uuid",
    [fixtureId]
  );
  const staffHistory = await pool.query(`
    SELECT (SELECT count(*)::integer FROM cornhill_school.staff_profiles WHERE staff_account_id = $1::uuid) AS profile_count,
           (SELECT count(*)::integer FROM cornhill_auth.staff_role_assignments WHERE staff_account_id = $1::uuid) AS role_count
  `, [fixtureId]);
  const academicHistory = await pool.query(`
    SELECT count(*)::integer AS report_card_count,
           min(grading_scheme_code) AS grading_scheme,
           min(class_code_snapshot) AS class_code,
           min(academic_year_label_snapshot) AS academic_year,
           min(total_score)::numeric(12,2)::text AS total_score,
           min(total_possible)::numeric(12,2)::text AS total_possible,
           min(aggregate_total)::integer AS aggregate_total,
           min(jsonb_array_length(subject_results))::integer AS subject_count,
           min(subject_results::text) AS subject_results
      FROM cornhill_school.academic_report_cards
     WHERE learner_id = $1::uuid AND assessment_id = $2::uuid
  `, [historyFixture.learnerId, historyFixture.assessmentId]);
  const progressionHistory = await pool.query(`
    WITH learner_events AS (
      SELECT event.id, event.progression_type, event.from_class_id, event.to_class_id,
             event.from_enrolment_period_id, event.to_enrolment_period_id,
             source.class_code AS from_class, destination.class_code AS to_class
        FROM cornhill_school.learner_progression_events event
        JOIN cornhill_school.classes source ON source.id = event.from_class_id
        LEFT JOIN cornhill_school.classes destination ON destination.id = event.to_class_id
       WHERE event.learner_id = $1::uuid
    )
    SELECT count(*)::integer AS progression_count,
           min(event.id::text) AS event_id,
           min(event.progression_type) AS progression_type,
           min(event.from_class) AS from_class,
           min(event.to_class) AS to_class,
           min(event.from_enrolment_period_id::text) AS from_enrolment_period_id,
           min(event.to_enrolment_period_id::text) AS to_enrolment_period_id,
           (SELECT count(*)::integer FROM cornhill_school.enrolment_periods period
             WHERE period.learner_id = $1::uuid) AS enrolment_period_count,
           (SELECT count(*)::integer FROM cornhill_school.enrolment_periods period
             WHERE period.learner_id = $1::uuid AND period.status = 'Completed'
               AND period.class_id = (SELECT from_class_id FROM learner_events LIMIT 1)) AS closed_source_period_count,
           (SELECT count(*)::integer FROM cornhill_school.enrolment_periods period
             WHERE period.learner_id = $1::uuid AND period.status = 'Active'
               AND period.class_id = (SELECT to_class_id FROM learner_events LIMIT 1)
               AND period.previous_period_id = (SELECT from_enrolment_period_id FROM learner_events LIMIT 1)) AS linked_destination_period_count,
           (SELECT learner.status || ':' || class.class_code
              FROM cornhill_school.learners learner
              JOIN cornhill_school.classes class ON class.id = learner.class_id
             WHERE learner.id = $1::uuid) AS current_learner_state
      FROM learner_events event
  `, [historyFixture.learnerId]);
  const financeHistory = await pool.query(`
    SELECT (SELECT count(*)::integer FROM cornhill_school.fee_obligations obligation
             WHERE obligation.learner_id = $1::uuid) AS fee_obligation_count,
           (SELECT count(*)::integer FROM cornhill_school.payment_records payment
             WHERE payment.id = $2::uuid AND payment.learner_id = $1::uuid) AS payment_count,
           (SELECT count(*)::integer FROM cornhill_school.payment_allocations allocation
             WHERE allocation.payment_id = $2::uuid) AS allocation_count,
           (SELECT count(*)::integer FROM cornhill_school.payment_receipts receipt
             WHERE receipt.payment_id = $2::uuid) AS receipt_count,
           (SELECT min(receipt.receipt_number)
              FROM cornhill_school.payment_receipts receipt WHERE receipt.payment_id = $2::uuid) AS receipt_number,
           (SELECT min(receipt.receipt_data_snapshot->>'pupil_code')
              FROM cornhill_school.payment_receipts receipt WHERE receipt.payment_id = $2::uuid) AS receipt_pupil_code,
           (SELECT min(receipt.receipt_data_snapshot->>'unallocated_amount_ugx')
              FROM cornhill_school.payment_receipts receipt WHERE receipt.payment_id = $2::uuid) AS receipt_unallocated_amount_ugx,
           (SELECT receipt.receipt_data_snapshot
              FROM cornhill_school.payment_receipts receipt WHERE receipt.payment_id = $2::uuid LIMIT 1) AS receipt_snapshot
  `, [historyFixture.learnerId, historyFixture.paymentId]);
  const sequenceState = await pool.query(`
    SELECT schemaname, sequencename, last_value::text AS last_value
      FROM pg_sequences
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
     ORDER BY schemaname, sequencename
  `);
  const schemaFingerprint = createHash("sha256")
    .update(JSON.stringify({ schemaManifest, databasePrivileges }), "utf8")
    .digest("hex");
  return {
    schemaManifest,
    databasePrivileges,
    schemaFingerprint,
    migrationCount: ledger.rows[0].count,
    migrationSignature: ledger.rows[0].signature,
    syntheticStaffAccountCount: staffFixture.rows[0].count,
    syntheticStaffHistory: staffHistory.rows[0],
    syntheticAcademicHistory: academicHistory.rows[0],
    syntheticProgressionHistory: progressionHistory.rows[0],
    syntheticFinanceHistory: financeHistory.rows[0],
    sequenceState: sequenceState.rows
  };
}

async function run() {
  const target = readIsolatedTestDatabaseTarget();
  if (!target) {
    throw new Error("Backup/restore verification requires CORNHILL_DB_TARGET=isolated-test.");
  }

  const config = readLocalDatabaseConfig();
  const pgDump = process.env.CORNHILL_PG_DUMP_PATH ?? "pg_dump";
  const pgRestore = process.env.CORNHILL_PG_RESTORE_PATH ?? "pg_restore";
  const toolEnv = { ...process.env, PGPASSWORD: config.password };
  await verifyToolVersion(pgDump, toolEnv);
  await verifyToolVersion(pgRestore, toolEnv);

  const { Pool } = await import("pg");
  const sourcePool = new Pool(config);
  const restoreDatabase = `cornhill_isolated_test_${randomUUID().replaceAll("-", "")}`;
  const fixtureId = randomUUID();
  const fixtureUsername = `ci_backup_${randomBytes(12).toString("hex")}`;
  const dumpPath = join(tmpdir(), `cornhill-isolated-backup-${randomUUID()}.dump`);
  let ownsDumpFile = false;
  let ownsRestoreDatabase = false;
  let restorePool;

  try {
    const sourceIdentity = await readIdentity(sourcePool);
    assertIsolatedPostgresServerIdentity(sourceIdentity, target);

    const existingRestore = await sourcePool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [restoreDatabase]
    );
    assert.equal(existingRestore.rowCount, 0, "The generated restore database name must be unused.");
    await sourcePool.query(`CREATE DATABASE ${quoteIdentifier(restoreDatabase)}`);
    ownsRestoreDatabase = true;

    restorePool = new Pool({ ...config, database: restoreDatabase });
    const restoreIdentity = await readIdentity(restorePool);
    assertIsolatedDatabaseIdentity(restoreIdentity, { ...target, database: restoreDatabase });
    await provisionRestoreDatabasePrivileges(sourcePool, restoreDatabase);

    await sourcePool.query(`
      INSERT INTO cornhill_auth.staff_accounts
        (id, username, username_normalized, password_hash, account_status, must_change_password)
      VALUES ($1::uuid, $2, $2, '$argon2id$ci-backup-placeholder', 'active', true)
    `, [fixtureId, fixtureUsername]);
    const historyFixture = await createHistoryFixture(sourcePool, fixtureId);

    const { stdout: dumpVersion } = await runCommand(pgDump, ["--version"], toolEnv);
    const { stdout: restoreVersion } = await runCommand(pgRestore, ["--version"], toolEnv);
    const dumpArgs = [
      "--no-password", "--format=custom", "--host", config.host,
      "--port", String(config.port), "--username", config.user,
      "--dbname", config.database, "--file", dumpPath
    ];
    await writeFile(dumpPath, Buffer.alloc(0), { flag: "wx" });
    ownsDumpFile = true;
    await runCommand(pgDump, dumpArgs, toolEnv);

    const restoreArgs = [
      "--no-password", "--exit-on-error", "--host", config.host,
      "--port", String(config.port), "--username", config.user,
      "--dbname", restoreDatabase, dumpPath
    ];
    await runCommand(pgRestore, restoreArgs, toolEnv);

    const [sourceSnapshot, restoreSnapshot] = await Promise.all([
      readSnapshot(sourcePool, fixtureId, historyFixture),
      readSnapshot(restorePool, fixtureId, historyFixture)
    ]);
    assert.equal(sourceSnapshot.migrationCount, EXPECTED_MIGRATION_COUNT);
    assert.equal(restoreSnapshot.migrationCount, EXPECTED_MIGRATION_COUNT);
    assert.equal(sourceSnapshot.syntheticStaffAccountCount, 1);
    assert.equal(restoreSnapshot.syntheticStaffAccountCount, 1);
    assert.deepEqual(sourceSnapshot.syntheticStaffHistory, { profile_count: 1, role_count: 2 });
    assert.equal(sourceSnapshot.syntheticAcademicHistory.report_card_count, 1);
    assert.equal(sourceSnapshot.syntheticAcademicHistory.grading_scheme, "lower_primary_ae");
    assert.equal(sourceSnapshot.syntheticAcademicHistory.class_code, "P1");
    assert.equal(sourceSnapshot.syntheticAcademicHistory.academic_year, historyFixture.yearLabel);
    assert.equal(Number(sourceSnapshot.syntheticAcademicHistory.total_score), 480);
    assert.equal(Number(sourceSnapshot.syntheticAcademicHistory.total_possible), 600);
    assert.equal(sourceSnapshot.syntheticAcademicHistory.subject_count, 6);
    assert.equal(sourceSnapshot.syntheticProgressionHistory.progression_count, 1);
    assert.equal(sourceSnapshot.syntheticProgressionHistory.event_id, historyFixture.progressionEventId);
    assert.equal(sourceSnapshot.syntheticProgressionHistory.progression_type, "Promoted");
    assert.equal(sourceSnapshot.syntheticProgressionHistory.from_class, "P1");
    assert.equal(sourceSnapshot.syntheticProgressionHistory.to_class, "P2");
    assert.equal(sourceSnapshot.syntheticProgressionHistory.from_enrolment_period_id, historyFixture.initialEnrolmentId);
    assert.equal(sourceSnapshot.syntheticProgressionHistory.enrolment_period_count, 2);
    assert.equal(sourceSnapshot.syntheticProgressionHistory.closed_source_period_count, 1);
    assert.equal(sourceSnapshot.syntheticProgressionHistory.linked_destination_period_count, 1);
    assert.equal(sourceSnapshot.syntheticProgressionHistory.current_learner_state, "Active:P2");
    assert.equal(sourceSnapshot.syntheticFinanceHistory.fee_obligation_count, 1);
    assert.equal(sourceSnapshot.syntheticFinanceHistory.payment_count, 1);
    assert.equal(sourceSnapshot.syntheticFinanceHistory.allocation_count, 1);
    assert.equal(sourceSnapshot.syntheticFinanceHistory.receipt_count, 1);
    assert.equal(sourceSnapshot.syntheticFinanceHistory.receipt_pupil_code, historyFixture.pupilCode);
    assert.equal(sourceSnapshot.syntheticFinanceHistory.receipt_unallocated_amount_ugx, "25000");
    assert.match(sourceSnapshot.syntheticFinanceHistory.receipt_number, /^CR-[0-9]{4}-[0-9]{7}$/);
    assert.deepEqual(restoreSnapshot.databasePrivileges, sourceSnapshot.databasePrivileges,
      "Restored database-level privileges must match the source.");
    for (const [manifestName, sourceItems] of Object.entries(sourceSnapshot.schemaManifest)) {
      assert.deepEqual(restoreSnapshot.schemaManifest[manifestName], sourceItems,
        `Restored ${manifestName} must match the source.`);
    }
    assert.equal(restoreSnapshot.schemaFingerprint, sourceSnapshot.schemaFingerprint,
      "Source and restored schema/security fingerprints must match.");
    assert.equal(restoreSnapshot.migrationCount, sourceSnapshot.migrationCount);
    assert.equal(restoreSnapshot.migrationSignature, sourceSnapshot.migrationSignature);
    assert.equal(restoreSnapshot.syntheticStaffAccountCount, sourceSnapshot.syntheticStaffAccountCount);
    assert.deepEqual(restoreSnapshot.syntheticStaffHistory, sourceSnapshot.syntheticStaffHistory);
    assert.deepEqual(restoreSnapshot.syntheticAcademicHistory, sourceSnapshot.syntheticAcademicHistory);
    assert.deepEqual(restoreSnapshot.syntheticProgressionHistory, sourceSnapshot.syntheticProgressionHistory);
    assert.deepEqual(restoreSnapshot.syntheticFinanceHistory, sourceSnapshot.syntheticFinanceHistory);
    assert.deepEqual(restoreSnapshot.sequenceState, sourceSnapshot.sequenceState);

    console.log(`PostgreSQL backup and restore verified with ${dumpVersion} / ${restoreVersion}.`);
    console.log(`Restored schema, database privileges, sequence state, ${sourceSnapshot.migrationCount} migration ledger entries, and synthetic staff, academic, finance, receipt and progression history.`);
    console.log(`Schema fingerprint: ${sourceSnapshot.schemaFingerprint}. Source and restored security metadata, checksums and synthetic history match.`);
  } finally {
    if (restorePool) await restorePool.end();
    if (ownsRestoreDatabase) {
      const sourceIdentity = await readIdentity(sourcePool);
      assertIsolatedPostgresServerIdentity(sourceIdentity, target);
      await sourcePool.query(`DROP DATABASE ${quoteIdentifier(restoreDatabase)}`);
    }
    await sourcePool.end();
    if (ownsDumpFile) {
      try {
        await access(dumpPath);
        await unlink(dumpPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
}

run().catch(error => {
  console.error("Isolated PostgreSQL backup/restore verification failed:", error.message);
  process.exitCode = 1;
});
