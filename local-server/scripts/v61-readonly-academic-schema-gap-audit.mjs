// CORNHILL V61 — read-only local school schema and academic readiness audit.
// Robust against optional modules missing from the working database.
// Run from local-server with: node --env-file=.env <full path to this script>
// No migrations, updates, logins, school records, passwords, tokens, or identity exports.
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const root=resolve(process.cwd());
const packageFile=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
if(packageFile.name!=="cornhill-local-server") throw Error("Run this V61 audit from the CORNHILL local-server directory.");
const {readLocalDatabaseConfig}=await import(pathToFileURL(join(root,"src/db/config.mjs")).href);
const {Client}=createRequire(join(root,"package.json"))("pg");
const targetTables=[
  "academic_years","academic_terms","classes","learners","enrolment_periods",
  "assessments","learner_marks","academic_report_cards","learner_progression_events",
  "nursery_material_receipts","nursery_material_movements","payment_records","payment_receipts"
];
const report={
  audit:"CORNHILL_V61_READ_ONLY_SCHEMA_AND_ACADEMIC_ACCEPTANCE",
  generated_at_utc:new Date().toISOString(),
  target:"cornhill_local",
  database_identity:"NOT_CHECKED",
  transaction:"REPEATABLE_READ_READ_ONLY",
  migration_ledger_count:null,
  migration_record_names_090_onward:[],
  disk_migration_names_090_onward:[],
  table_availability:{},
  missing_required_functional_tables:[],
  nursery_related_table_names:[],
  academic_years:[],
  academic_terms:[],
  class_roster:[],
  active_learners:null,
  learners_missing_active_enrolment:null,
  learners_with_multiple_active_enrolments:null,
  learners_missing_class:null,
  academic_counts:{},
  finance_counts:{},
  next_academic_year_term1:null,
  next_year_pending_candidates_by_class:[],
  calendar_requires_director_review:false,
  school_year_ready_for_promotions:false,
  nursery_material_module_ready:false,
  ledger_match_verified_by_v61:false,
  finance_sync_safe:false,
  release_blockers_cleared:0,
  release_blockers_total:5,
  writes_to_database:0,
  learner_promotions:0,
  finance_postings:0,
  cloud_writes:0,
  credentials_or_learner_details_exported:false,
  errors:[],
  outcome:"INCOMPLETE"
};
try {
  const filenames=await readdir(join(root,"migrations"));
  report.disk_migration_names_090_onward=filenames.filter(x=>/^0(?:9\d)_|^1\d\d_/.test(x)&&x.endsWith(".sql")).sort();
}catch{report.errors.push("Cannot read migration file names.");}

let conn,transaction=false;
try{
  const cfg=readLocalDatabaseConfig();
  if(cfg.database!=="cornhill_local"||!["127.0.0.1","::1","localhost"].includes(cfg.host)){
    throw Error("Wrong database configuration target.");
  }
  conn=new Client({...cfg,application_name:"cornhill-v61-read-only-acceptance"});
  await conn.connect();
  await conn.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  transaction=true;
  await conn.query("SET LOCAL statement_timeout = '8000ms'");
  const identity=await conn.query("SELECT current_database() AS database");
  if(identity.rows[0]?.database!=="cornhill_local")throw Error("Wrong current_database().");
  report.database_identity="VERIFIED_CORNHILL_LOCAL";
  const tableRows=await conn.query(
    "SELECT table_name FROM information_schema.tables "+
    "WHERE table_schema='cornhill_school' AND table_type='BASE TABLE'"
  );
  const existing=new Set(tableRows.rows.map(r=>r.table_name));
  for(const name of targetTables) {
    report.table_availability[name]=existing.has(name);
  }
  report.missing_required_functional_tables=targetTables.filter(n=>!existing.has(n));
  report.nursery_related_table_names=[...existing].filter(n=>/nursery|material/i.test(n)).sort();
  const has=n=>existing.has(n);
  // Do not confuse a 140-row ledger with proof that the associated school modules exist.
  const m=await conn.query(
    "SELECT to_regclass('cornhill_meta.schema_migrations') IS NOT NULL AS exists"
  );
  if(m.rows[0]?.exists){
    try{
      const applied=await conn.query(
        "SELECT migration_name FROM cornhill_meta.schema_migrations ORDER BY migration_name"
      );
      report.migration_ledger_count=applied.rowCount;
      report.migration_record_names_090_onward=applied.rows
        .map(r=>r.migration_name).filter(n=>/^0(?:9\d)_|^1\d\d_/.test(n));
    }catch{
      report.errors.push("Migration-name audit was not permitted.");
    }
  }
  if(has("academic_years")){
    const years=await conn.query(
      "SELECT year_label AS label,status,starts_on::text AS starts_on,"+
      "ends_on::text AS ends_on FROM cornhill_school.academic_years "+
      "ORDER BY starts_on DESC LIMIT 25"
    );
    report.academic_years=years.rows;
  }
  if(has("academic_terms")&&has("academic_years")){
    const terms=await conn.query(
      "SELECT y.year_label AS year_label,t.term_number,t.status,"+
      "t.starts_on::text AS starts_on,t.ends_on::text AS ends_on "+
      "FROM cornhill_school.academic_terms t "+
      "JOIN cornhill_school.academic_years y ON y.id=t.academic_year_id "+
      "ORDER BY t.starts_on DESC LIMIT 60"
    );
    report.academic_terms=terms.rows;
    // This query only reads 2027+ term information; it NEVER sets an active status.
    const firstNext=await conn.query(
      "SELECT y.year_label AS label,y.status AS year_status,"+
      "y.starts_on::text AS year_starts_on,"+
      "t.status AS term_status,t.starts_on::text AS term_starts_on "+
      "FROM cornhill_school.academic_years y "+
      "LEFT JOIN cornhill_school.academic_terms t "+
      "ON t.academic_year_id=y.id AND t.term_number=1 "+
      "WHERE y.starts_on>DATE '2026-12-04' "+
      "ORDER BY y.starts_on,t.starts_on LIMIT 1"
    );
    report.next_academic_year_term1=firstNext.rows[0]??null;
    report.school_year_ready_for_promotions=
      report.next_academic_year_term1?.year_status==="Active" &&
      report.next_academic_year_term1?.term_status==="Active";
    report.calendar_requires_director_review=
      report.academic_years.some(y=>y.status==="Planned"&&y.ends_on<"2026-11-28") ||
      !report.next_academic_year_term1?.term_starts_on;
  }
  if(has("learners")&&has("enrolment_periods")&&has("classes")){
    const roster=await conn.query(
      "SELECT c.class_code AS class, "+
      "count(DISTINCT l.id) FILTER (WHERE l.status='Active')::int AS active_learners,"+
      "count(DISTINCT e.learner_id) FILTER (WHERE e.status='Active')::int AS active_enrolments "+
      "FROM cornhill_school.classes c "+
      "LEFT JOIN cornhill_school.learners l ON l.class_id=c.id "+
      "LEFT JOIN cornhill_school.enrolment_periods e ON e.learner_id=l.id "+
      "AND e.class_id=c.id AND e.status='Active' "+
      "WHERE c.is_active=true "+
      "GROUP BY c.id,c.class_code,c.level_order ORDER BY c.level_order,c.class_code"
    );
    report.class_roster=roster.rows;
    const aggregate=await conn.query(
      "SELECT count(*) FILTER (WHERE l.status='Active')::int AS active_learners,"+
      "count(*) FILTER (WHERE l.status='Active' AND l.class_id IS NULL)::int AS missing_class,"+
      "count(*) FILTER (WHERE l.status='Active' AND NOT EXISTS "+
      " (SELECT 1 FROM cornhill_school.enrolment_periods e "+
      " WHERE e.learner_id=l.id AND e.status='Active'))::int AS missing_enrolment "+
      "FROM cornhill_school.learners l"
    );
    report.active_learners=aggregate.rows[0]?.active_learners??null;
    report.learners_missing_class=aggregate.rows[0]?.missing_class??null;
    report.learners_missing_active_enrolment=aggregate.rows[0]?.missing_enrolment??null;
    const duplicates=await conn.query(
      "SELECT count(*)::int AS duplicate_learners FROM ("+
      "SELECT learner_id FROM cornhill_school.enrolment_periods "+
      "WHERE status='Active' GROUP BY learner_id HAVING count(*)>1) d"
    );
    report.learners_with_multiple_active_enrolments=duplicates.rows[0]?.duplicate_learners??null;
    if(report.next_academic_year_term1?.year_starts_on){
      const byClass=await conn.query(
        "SELECT c.class_code AS class,count(DISTINCT ep.learner_id)::int AS pending "+
        "FROM cornhill_school.classes c "+
        "LEFT JOIN cornhill_school.enrolment_periods ep "+
        "ON ep.class_id=c.id AND ep.status='Active' "+
        "AND ep.admission_date<$1::date "+
        "AND EXISTS(SELECT 1 FROM cornhill_school.learners l "+
        "WHERE l.id=ep.learner_id AND l.class_id=c.id AND l.status='Active') "+
        "WHERE c.is_active=true "+
        "GROUP BY c.id,c.class_code,c.level_order ORDER BY c.level_order,c.class_code",
        [report.next_academic_year_term1.year_starts_on]
      );
      report.next_year_pending_candidates_by_class=byClass.rows;
    }
  }
  // Every optional table is checked independently. Missing Nursery stock tables
  // must be clearly reported, never break the whole academic audit.
  for(const [table,key] of [
    ["academic_report_cards","report_cards"],
    ["learner_progression_events","progression_events"],
    ["assessments","assessments"],
    ["learner_marks","mark_rows"],
    ["nursery_material_receipts","nursery_material_receipts"],
    ["nursery_material_movements","nursery_material_movements"]]){
    if(!has(table)){report.academic_counts[key]=null;continue;}
    try{
      const count=await conn.query("SELECT count(*)::int AS n FROM cornhill_school."+table);
      report.academic_counts[key]=count.rows[0]?.n??null;
    }catch{report.academic_counts[key]=null;report.errors.push("Aggregate check unavailable: "+table);}
  }
  for(const [table,key] of [["payment_records","payments"],["payment_receipts","receipts"]]){
    if(!has(table)){report.finance_counts[key]=null;continue;}
    try{
      const counts=await conn.query("SELECT count(*)::int AS n FROM cornhill_school."+table);
      report.finance_counts[key]=counts.rows[0]?.n??null;
    }catch{report.finance_counts[key]=null;report.errors.push("Aggregate check unavailable: "+table);}
  }
  if(has("payment_records")){
    try{
      const posted=await conn.query(
        "SELECT count(*)::int AS n FROM cornhill_school.payment_records WHERE status='Posted'"
      );
      report.finance_counts.posted=posted.rows[0]?.n??null;
    }catch{report.errors.push("Posted payment count unavailable.");}
  }
  report.nursery_material_module_ready=has("nursery_material_receipts")&&has("nursery_material_movements");
  report.outcome="READ_ONLY_ACCEPTANCE_AUDIT_COMPLETED";
  await conn.query("ROLLBACK");transaction=false;
}catch(error){
  report.errors.push("Read-only local audit stopped: "+String(error?.message||"unknown").slice(0,200));
  report.outcome="INCOMPLETE_NO_CHANGES";
}finally{
  if(conn){if(transaction){try{await conn.query("ROLLBACK");}catch{}}try{await conn.end();}catch{}}
}
const download=join(homedir(),"Downloads");
await mkdir(download,{recursive:true});
const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\..*/,"").replace("T","-");
const file=join(download,"CORNHILL-V61-ACADEMIC-SCHEMA-GAP-"+stamp+".json");
await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
console.log("CORNHILL_V61="+report.outcome);
console.log("DB_IDENTITY="+report.database_identity);
console.log("MIGRATIONS_APPLIED="+(report.migration_ledger_count??"NOT_VERIFIED"));
console.log("ACTIVE_LEARNERS="+(report.active_learners??"NOT_VERIFIED"));
console.log("LEARNERS_WITHOUT_ACTIVE_ENROLMENT="+(report.learners_missing_active_enrolment??"NOT_VERIFIED"));
console.log("DUPLICATE_ACTIVE_ENROLMENTS="+(report.learners_with_multiple_active_enrolments??"NOT_VERIFIED"));
console.log("NEXT_YEAR_TERM1_DEFINED="+Boolean(report.next_academic_year_term1?.term_starts_on));
console.log("NURSERY_RECEIPTS_TABLE="+report.table_availability.nursery_material_receipts);
console.log("NURSERY_MOVEMENTS_TABLE="+report.table_availability.nursery_material_movements);
console.log("FINANCE_SYNC_SAFE=false");
console.log("DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0");
console.log("RELEASE_BLOCKERS_CLEARED=0/5");
console.log("UPLOAD_SAFE_JSON="+file);
