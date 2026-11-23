import test from "node:test";
import assert from "node:assert/strict";
import {createPupilBalancesReportRepository} from "../src/db/pupil-balances-report-repository.mjs";
const ID="11111111-1111-4111-8111-111111111111";
const filters={year:2026,term:3,className:"P.4",status:"all",query:"CH",page:1,pageSize:25};
test("repository is read-only, parameterised and passes actor identity",async()=>{
  const calls=[];
  const repo=createPupilBalancesReportRepository({
    async query(sql,values){
      calls.push({sql,values});
      return {rows:[{report:{rows:[],totals:{rowCount:0,totalOutstandingUgx:0}}}]};
    }
  });
  await repo.getPupilBalances({actorStaffId:ID,filters});
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/^SELECT cornhill_school\.v124c_preview_pupil_balances\(/);
  assert.doesNotMatch(calls[0].sql,/INSERT|UPDATE|DELETE|TRUNCATE/);
  assert.deepEqual(calls[0].values,[ID,2026,3,"P.4","all","CH",1,25]);
});
test("untrusted search is always passed as a query parameter",async()=>{
  const calls=[];
  const injected="'; DROP TABLE cornhill_school.learners; --";
  const repo=createPupilBalancesReportRepository({
    async query(sql,values){
      calls.push({sql,values});
      return {rows:[{report:{rows:[],totals:{}}}]};
    }
  });
  await repo.getPupilBalances({actorStaffId:ID,filters:{...filters,query:injected}});
  assert.ok(calls[0].values.includes(injected));
  assert.ok(!calls[0].sql.includes(injected));
});
test("repository rejects missing actor or invalid pagination before querying",async()=>{
  let hit=0;
  const repo=createPupilBalancesReportRepository({async query(){hit++;return {rows:[]};}});
  await assert.rejects(()=>repo.getPupilBalances({actorStaffId:"director",filters}),/verified finance actor/);
  await assert.rejects(()=>repo.getPupilBalances({actorStaffId:ID,filters:{...filters,pageSize:1000}}),/Validated reporting filters/);
  assert.equal(hit,0);
});
test("database response must include the report object",async()=>{
  const repo=createPupilBalancesReportRepository({async query(){return {rows:[]};}});
  await assert.rejects(()=>repo.getPupilBalances({actorStaffId:ID,filters}),/Incomplete finance report/);
});
