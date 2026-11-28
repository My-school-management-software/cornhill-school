// CORNHILL V60 — read-only academic year and advancement acceptance audit.
// Windows: run from local-server with node --env-file=.env <this-script-path>.
// Never writes academic/learner/finance records or attempts promotion.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const base = resolve(process.cwd());
const pkg = JSON.parse(await readFile(join(base,"package.json"),"utf8"));
if(pkg.name !== "cornhill-local-server") throw new Error("Run from CORNHILL local-server.");
const { readLocalDatabaseConfig } = await import(pathToFileURL(join(base,"src/db/config.mjs")).href);
const { Client } = createRequire(join(base,"package.json"))("pg");
const report = {
  audit: "CORNHILL_V60_READ_ONLY_ACADEMIC_YEAR_ACCEPTANCE",
  generated_at_utc: new Date().toISOString(),
  target: "cornhill_local",
  db_identity: "NOT_VERIFIED",
  transaction: "REPEATABLE_READ_READ_ONLY",
  school_years: [],
  academic_terms: [],
  target_new_year_term1: null,
  target_term1_decision_mode: "DISABLED_BY_V60",
  term_1_approval_eligible: false,
  class_roster_aggregate: [],
  candidate_aggregate_by_class: [],
  active_learners: null,
  learners_missing_active_enrolment: null,
  duplicate_active_enrolments: null,
  issued_report_cards: null,
  learner_progression_events: null,
  assessments_total: null,
  learner_marks_total: null,
  nursery_material_receipts_total: null,
  nursery_material_movements_total: null,
  preparation_checks: {},
  readiness: "NOT_EVALUATED",
  blocker_codes: [],
  database_writes: 0,
  promotion_writes: 0,
  finance_writes: 0,
  cloud_writes: 0,
  learner_personal_data_in_report: false,
  errors: []
};
let conn, tx=false;
const numeric = row => Number(row?.count ?? 0);
try {
  const cfg = readLocalDatabaseConfig();
  if(cfg.database!=="cornhill_local" || !["127.0.0.1","localhost","::1"].includes(cfg.host)) {
    throw Error("Unexpected database connection target.");
  }
  conn = new Client({...cfg,application_name:"cornhill-v60-academic-readonly"});
  await conn.connect();
  await conn.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  tx=true;
  await conn.query("SET LOCAL statement_timeout='5000ms'");
  const identity = await conn.query("SELECT current_database() AS name");
  if(identity.rows[0]?.name!=="cornhill_local") throw Error("Unexpected local database identity.");
  report.db_identity="VERIFIED_CORNHILL_LOCAL";

  const years = await conn.query(
    "SELECT year_label AS label, status, starts_on::text AS starts_on, ends_on::text AS ends_on "+
    "FROM cornhill_school.academic_years ORDER BY starts_on DESC LIMIT 20"
  );
  report.school_years=years.rows;
  const terms = await conn.query(
    "SELECT y.year_label AS year_label, t.term_number, t.status, "+
    "t.starts_on::text AS starts_on, t.ends_on::text AS ends_on "+
    "FROM cornhill_school.academic_terms t JOIN cornhill_school.academic_years y ON y.id=t.academic_year_id "+
    "ORDER BY t.starts_on DESC LIMIT 40"
  );
  report.academic_terms=terms.rows;

  const roster=await conn.query(
    "SELECT c.class_code AS class, "+
    "COUNT(DISTINCT l.id) FILTER (WHERE l.status='Active')::int AS active_learners, "+
    "COUNT(DISTINCT ep.learner_id) FILTER (WHERE ep.status='Active')::int AS active_enrolments "+
    "FROM cornhill_school.classes c "+
    "LEFT JOIN cornhill_school.learners l ON l.class_id=c.id AND l.status='Active' "+
    "LEFT JOIN cornhill_school.enrolment_periods ep ON ep.learner_id=l.id AND ep.class_id=c.id AND ep.status='Active' "+
    "WHERE c.is_active=true GROUP BY c.id,c.class_code,c.level_order ORDER BY c.level_order,c.class_code"
  );
  report.class_roster_aggregate=roster.rows;

  const aggregates=await conn.query(
    "SELECT (SELECT count(*)::int FROM cornhill_school.learners WHERE status='Active') AS active_learners, "+
    "(SELECT count(*)::int FROM cornhill_school.learners l WHERE l.status='Active' AND NOT EXISTS "+
    "  (SELECT 1 FROM cornhill_school.enrolment_periods e WHERE e.learner_id=l.id AND e.status='Active')) "+
    "AS learners_missing_active_enrolment, "+
    "(SELECT count(*)::int FROM (SELECT learner_id FROM cornhill_school.enrolment_periods "+
    " WHERE status='Active' GROUP BY learner_id HAVING count(*)>1) duplicates) AS duplicate_active_enrolments, "+
    "(SELECT count(*)::int FROM cornhill_school.academic_report_cards) AS issued_report_cards, "+
    "(SELECT count(*)::int FROM cornhill_school.learner_progression_events) AS learner_progression_events, "+
    "(SELECT count(*)::int FROM cornhill_school.assessments) AS assessments_total, "+
    "(SELECT count(*)::int FROM cornhill_school.learner_marks) AS learner_marks_total, "+
    "(SELECT count(*)::int FROM cornhill_school.nursery_material_receipts) AS nursery_material_receipts_total, "+
    "(SELECT count(*)::int FROM cornhill_school.nursery_material_movements) AS nursery_material_movements_total"
  );
  const x=aggregates.rows[0] ?? {};
  for(const name of ["active_learners","learners_missing_active_enrolment","duplicate_active_enrolments",
    "issued_report_cards","learner_progression_events","assessments_total","learner_marks_total",
    "nursery_material_receipts_total","nursery_material_movements_total"]) {
    report[name] = Number(x[name] ?? 0);
  }

  // New-year term identification is for REVIEW only; no year, term or learner is created.
  // Prefer the next year after 2026-11-28, so an older active Term 1 cannot be mistaken for a new-year target.
  const newYear=await conn.query(
    "SELECT y.id AS year_id, y.year_label AS label, y.status AS year_status, "+
    "y.starts_on::text AS starts_on, t.id AS term_id, t.term_number, "+
    "t.status AS term_status, t.starts_on::text AS term_starts_on "+
    "FROM cornhill_school.academic_years y "+
    "LEFT JOIN cornhill_school.academic_terms t ON t.academic_year_id=y.id AND t.term_number=1 "+
    "WHERE y.starts_on >= DATE '2026-12-01' "+
    "ORDER BY y.starts_on,t.starts_on LIMIT 1"
  );
  if(newYear.rowCount>0) {
    const y=newYear.rows[0];
    report.target_new_year_term1 = {
      label:y.label,starts_on:y.starts_on,
      year_status:y.year_status,term1_present:!!y.term_id,
      term_status:y.term_status ?? null,
      term_starts_on:y.term_starts_on ?? null
    };
    report.term_1_approval_eligible=y.year_status==="Active" && y.term_status==="Active" && !!y.term_id;
    if(y.term_id) {
      const candidates=await conn.query(
        "SELECT c.class_code AS class, "+
        "COUNT(DISTINCT ep.learner_id)::int AS pending_older_year, "+
        "COUNT(DISTINCT e_new.learner_id)::int AS in_target_year "+
        "FROM cornhill_school.classes c "+
        "LEFT JOIN cornhill_school.enrolment_periods ep ON ep.class_id=c.id "+
        " AND ep.status='Active' AND ep.admission_date<$1::date "+
        " AND EXISTS (SELECT 1 FROM cornhill_school.learners l WHERE l.id=ep.learner_id AND l.class_id=c.id AND l.status='Active') "+
        "LEFT JOIN cornhill_school.enrolment_periods e_new ON e_new.class_id=c.id "+
        " AND e_new.status='Active' AND e_new.admission_date>=$1::date "+
        "WHERE c.is_active=true GROUP BY c.id,c.class_code,c.level_order ORDER BY c.level_order,c.class_code",
        [y.starts_on]
      );
      report.candidate_aggregate_by_class=candidates.rows;
    }
  }
  report.preparation_checks = {
    year_and_term_defined: report.school_years.length>0 && report.academic_terms.length>0,
    new_year_defined: !!report.target_new_year_term1,
    new_year_term1_defined: !!report.target_new_year_term1?.term1_present,
    next_year_term1_active: report.term_1_approval_eligible,
    all_active_learners_have_active_enrolment: report.learners_missing_active_enrolment===0,
    no_duplicate_active_enrolments: report.duplicate_active_enrolments===0,
    nursery_individual_receipt_schema_reachable: report.nursery_material_receipts_total!==null,
    finance_identity_reconciled: false
  };
  if(!report.preparation_checks.year_and_term_defined)report.blocker_codes.push("academic_calendar_missing");
  if(!report.preparation_checks.new_year_term1_defined)report.blocker_codes.push("next_year_term_1_missing");
  if(!report.preparation_checks.all_active_learners_have_active_enrolment)report.blocker_codes.push("enrolment_links_require_review");
  if(!report.preparation_checks.no_duplicate_active_enrolments)report.blocker_codes.push("duplicate_enrolment_periods");
  report.readiness="READ_ONLY_REVIEW_COMPLETED_NO_APPROVAL_TO_PROMOTE";
  await conn.query("ROLLBACK"); tx=false;
} catch(error) {
  report.errors.push("Read-only academic audit stopped: "+String(error?.message??"unknown").slice(0,180));
  report.readiness="INCOMPLETE_NO_CHANGES";
} finally {
  if(conn){if(tx){try{await conn.query("ROLLBACK");}catch{}}try{await conn.end();}catch{}}
}
const downloads=join(homedir(),"Downloads");
await mkdir(downloads,{recursive:true});
const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\..*/,"").replace("T","-");
const path=join(downloads,"CORNHILL-V60-SAFE-ACADEMIC-ACCEPTANCE-"+stamp+".json");
await writeFile(path,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
console.log("CORNHILL_V60="+report.readiness);
console.log("LOCAL_DATABASE="+report.db_identity);
console.log("ACADEMIC_YEARS="+report.school_years.length);
console.log("ACADEMIC_TERMS="+report.academic_terms.length);
console.log("ACTIVE_LEARNERS="+(report.active_learners??"NOT_VERIFIED"));
console.log("LEARNERS_MISSING_ENROLMENT="+(report.learners_missing_active_enrolment??"NOT_VERIFIED"));
console.log("PENDING_NEXT_YEAR_TERM1="+Boolean(report.target_new_year_term1?.term1_present));
console.log("DIRECTOR_PROMOTION_WRITES=DISABLED");
console.log("FINANCE_SYNC=DISABLED; FORMAL_RELEASE_GATES_CLEARED=0/5");
console.log("DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0");
console.log("UPLOAD_SAFE_ACADEMIC_REPORT="+path);
