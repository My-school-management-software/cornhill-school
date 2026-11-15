import test from "node:test";
import assert from "node:assert/strict";
import { getDirectorBootstrapStatus } from "../scripts/director-bootstrap-status.mjs";
function pool(row){return {async query(){return {rows:[row]};}};}
test("Director bootstrap status is READY only when no accounts or role grants exist",async()=>{
 const result=await getDirectorBootstrapStatus(pool({director_assignments:0,active_directors:0,all_role_grants:0,director_grants:0,permission_count:50}));
 assert.equal(result.status,"READY");
});
test("Director bootstrap status is CONFIGURED only when the unique active Director has all catalogue permissions",async()=>{
 const result=await getDirectorBootstrapStatus(pool({director_assignments:1,active_directors:1,all_role_grants:50,director_grants:50,permission_count:50}));
 assert.equal(result.status,"CONFIGURED");
});
test("partial or inconsistent grants require manual review and are never auto-repaired",async()=>{
 for(const row of [
  {director_assignments:0,active_directors:0,all_role_grants:2,director_grants:0,permission_count:50},
  {director_assignments:2,active_directors:2,all_role_grants:50,director_grants:50,permission_count:50},
  {director_assignments:1,active_directors:1,all_role_grants:10,director_grants:10,permission_count:50}
 ])assert.equal((await getDirectorBootstrapStatus(pool(row))).status,"REVIEW_REQUIRED");
});
