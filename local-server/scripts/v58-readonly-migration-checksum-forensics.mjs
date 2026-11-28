// CORNHILL V58: READ-ONLY migration-file checksum investigation.
// Run from C:\Users\hp\cornhill-school\local-server with node --env-file=.env.
// Never edits migrations, migration ledger, school data, cloud or finance.
// Report includes only filename/hash/historical Git commit evidence, no SQL.
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { homedir } from "node:os";

const appRoot = resolve(process.cwd());
const repoRoot = dirname(appRoot);
const pkg = JSON.parse(await readFile(join(appRoot,"package.json"),"utf8"));
if (pkg.name !== "cornhill-local-server") throw new Error("Run from CORNHILL local-server.");
const { readLocalDatabaseConfig } = await import(pathToFileURL(join(appRoot,"src/db/config.mjs")).href);
const { Client } = createRequire(join(appRoot,"package.json"))("pg");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (args, bufferBytes = 1024 * 1024) => {
  const p = spawnSync("git", args, {
    cwd: repoRoot, encoding: null, shell: false, windowsHide: true,
    timeout: 25000, maxBuffer: bufferBytes
  });
  return p.status === 0 && !p.error ? p.stdout : null;
};
const out = {
  audit: "CORNHILL_V58_READ_ONLY_CHECKSUM_FORENSICS",
  generated_at_utc: new Date().toISOString(),
  target: "cornhill_local",
  transaction: "REPEATABLE_READ_READ_ONLY",
  db_connected: false,
  disk_migration_count: null,
  applied_migration_count: null,
  clean_migration_count: null,
  missing_source_count: null,
  pending_in_db_count: null,
  checksum_mismatch_count: null,
  mismatches: [],
  guardian_installed_state: "NOT_EVALUATED",
  finance_sync_safe: false,
  formal_release_gates_verified_clear: 0,
  migration_or_record_writes: 0,
  source_writes: 0,
  cloud_writes: 0,
  credentials_or_sql_in_report: false,
  result: "BLOCKED_PENDING_REVIEW",
  errors: []
};
const names = (await readdir(join(appRoot,"migrations")))
  .filter(name => /^\d{3,}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.test(name)).sort();
const disk = new Map();
for(const name of names) {
  const relative = "local-server/migrations/" + name;
  const bytes = await readFile(join(appRoot,"migrations",name));
  const normalized = Buffer.from(bytes.toString("utf8")
    .replace(/^\uFEFF/,"").replace(/\r\n/g,"\n"),"utf8");
  disk.set(name.slice(0,-4), { name, relative, bytes, digest: hash(bytes), normalizedHash: hash(normalized) });
}
out.disk_migration_count = disk.size;
let db;
let inTx = false;
try {
  const cfg = readLocalDatabaseConfig();
  if(cfg.database !== "cornhill_local" || !["127.0.0.1","localhost","::1"].includes(cfg.host)) {
    throw new Error("Unexpected local database target.");
  }
  db = new Client({...cfg, application_name:"cornhill-v58-checksum-forensics"});
  await db.connect();
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  inTx=true;
  await db.query("SET LOCAL statement_timeout='5000ms'");
  const identity = await db.query("SELECT current_database() AS name");
  if(identity.rows[0]?.name !== "cornhill_local") throw new Error("Wrong database identity.");
  out.db_connected=true;
  const ledger = await db.query("SELECT migration_name, checksum FROM cornhill_meta.schema_migrations ORDER BY migration_name");
  out.applied_migration_count=ledger.rowCount;
  const applied = new Map(ledger.rows.map(r=>[r.migration_name,r.checksum]));
  out.missing_source_count=[...applied.keys()].filter(k=>!disk.has(k)).length;
  out.pending_in_db_count=[...disk.keys()].filter(k=>!applied.has(k)).length;
  out.clean_migration_count=[...disk].filter(([name,item])=>applied.get(name)===item.digest).length;
  for(const [name,item] of disk) {
    const recorded = applied.get(name);
    if(!recorded || recorded===item.digest) continue;
    const mismatch = {
      filename:item.name,
      migration_name:name,
      expected_applied_sha256:recorded,
      current_disk_sha256:item.digest,
      disk_lf_normalized_matches_applied: item.normalizedHash===recorded,
      local_git_worktree_state: "UNKNOWN",
      matching_historical_commit: null,
      matching_current_head: false,
      historical_commit_count_checked: 0,
      diagnosis: "NO_MATCHING_HISTORY_YET",
      database_edits_required_to_diagnose: false
    };
    const worktree=git(["status","--porcelain=v1","--",item.relative]);
    if(worktree!==null) mismatch.local_git_worktree_state=worktree.toString("utf8").trim()||"CLEAN";
    const headFile=git(["show","HEAD:"+item.relative], 8*1024*1024);
    if(headFile!==null) mismatch.matching_current_head=hash(headFile)===recorded;
    const commits=git(["log","--all","--format=%H","--",item.relative]);
    if(commits!==null) {
      for(const sha of commits.toString("utf8").split(/\r?\n/).filter(s=>/^[0-9a-f]{40}$/.test(s)).slice(0,120)) {
        mismatch.historical_commit_count_checked++;
        const historical=git(["show",sha+":"+item.relative],8*1024*1024);
        if(historical!==null && hash(historical)===recorded) {
          mismatch.matching_historical_commit=sha;
          mismatch.diagnosis="RECORDED_HASH_MATCHES_A_GIT_HISTORICAL_SOURCE";
          break;
        }
      }
    }
    if(mismatch.disk_lf_normalized_matches_applied) {
      mismatch.diagnosis="ONLY_UTF8_BOM_OR_CRLF_LINE_ENDINGS_CHANGED";
    } else if(mismatch.matching_current_head) {
      mismatch.diagnosis="WORKTREE_SQL_DIFFERS_FROM_APPLIED_GIT_HEAD";
    }
    out.mismatches.push(mismatch);
  }
  out.checksum_mismatch_count=out.mismatches.length;
  await db.query("ROLLBACK");
  inTx=false;
  if(out.mismatches.length===0 && out.pending_in_db_count===0 && out.missing_source_count===0) {
    out.result="ALL_CHECKSUMS_MATCH_BUT_RELEASE_GATES_STILL_OPEN";
  } else if(out.mismatches.every(x=>x.matching_historical_commit || x.disk_lf_normalized_matches_applied)) {
    out.result="ALL_DIVERGENCES_HAVE_IDENTIFIED_SOURCE_CANDIDATES_REVIEW_BEFORE_REPAIR";
  } else {
    out.result="SOME_DIVERGENCES_REQUIRE_FURTHER_SOURCE_RECONCILIATION";
  }
} catch(error) {
  out.errors.push("Read-only migration comparison did not finish: "+String(error?.message||"unknown").slice(0,180));
  out.result="INCOMPLETE_NO_CHANGES";
} finally {
  if(db) {
    if(inTx) { try {await db.query("ROLLBACK");} catch {} }
    try {await db.end();} catch {}
  }
}
const folder=join(homedir(),"Downloads");
await mkdir(folder,{recursive:true});
const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\..*/,"").replace("T","-");
const path=join(folder,"CORNHILL-V58-SAFE-CHECKSUM-EVIDENCE-"+stamp+".json");
await writeFile(path,JSON.stringify(out,null,2)+"\n",{flag:"wx",mode:0o600});
console.log("CORNHILL_V58_CHECKSUM_FORENSICS="+out.result);
console.log("MIGRATIONS_DISK="+out.disk_migration_count);
console.log("MIGRATIONS_APPLIED="+(out.applied_migration_count??"NOT_READ"));
console.log("MIGRATIONS_MATCHED="+(out.clean_migration_count??"NOT_READ"));
console.log("CHECKSUM_MISMATCHES="+(out.checksum_mismatch_count??"NOT_READ"));
for(const item of out.mismatches) {
  console.log("MISMATCH_FILE="+item.migration_name);
  console.log("ROOT_CAUSE_CLASS="+item.diagnosis);
  console.log("HISTORICAL_MATCH="+(item.matching_historical_commit??"NOT_FOUND"));
}
console.log("SOURCE_WRITES=0; DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0");
console.log("FINANCE_SYNC_SAFE=FALSE");
console.log("UPLOAD_ONLY_SAFE_REPORT="+path);
