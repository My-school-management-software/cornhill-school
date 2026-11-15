import test from "node:test";
import assert from "node:assert/strict";
import { parseAttendanceCsv, AttendanceCsvError } from "../src/security/attendance-csv.mjs";

const columns={staffIdentifier:"User ID",occurredAt:"Punch Time",eventType:"State",externalEventId:"Record ID"};

test("parses Uganda local timestamps as UTC+03:00 and normalises clock events",()=>{
  const [row]=parseAttendanceCsv("User ID,Punch Time,State,Record ID\nT-01,2026-11-15 08:30:00,check-in,EV-1",columns);
  assert.equal(row.staffIdentifier,"T-01");
  assert.equal(row.occurredAt,"2026-11-15T05:30:00.000Z");
  assert.equal(row.eventType,"Clock In");
  assert.equal(row.externalEventId,"EV-1");
  assert.match(row.sourceRowSha256,/^[a-f0-9]{64}$/);
});

test("accepts explicit UTC and offset timestamps",()=>{
  const rows=parseAttendanceCsv("User ID,Punch Time\nA,2026-11-15T08:30:00Z\nB,2026-11-15T11:30:00+03:00",{staffIdentifier:"User ID",occurredAt:"Punch Time"});
  assert.equal(rows[0].occurredAt,"2026-11-15T08:30:00.000Z");
  assert.equal(rows[1].occurredAt,"2026-11-15T08:30:00.000Z");
});

test("rejects impossible calendar dates, invalid clock times and invalid UTC offsets",()=>{
  const rows=parseAttendanceCsv("User ID,Punch Time\nA,2026-02-30 08:00\nB,2026-11-15T24:00:00Z\nC,2026-11-15T08:00:00+15:00\nD,2026-11-15T08:00:00+03:99",{staffIdentifier:"User ID",occurredAt:"Punch Time"});
  assert.equal(rows.length,4);
  assert.ok(rows.every(row=>row.error?.reasonCode==="invalid_timestamp"));
});

test("rejects duplicate and empty CSV headers",()=>{
  assert.throws(()=>parseAttendanceCsv("User ID,User ID\nA,1",{staffIdentifier:"User ID",occurredAt:"User ID"}),AttendanceCsvError);
  assert.throws(()=>parseAttendanceCsv("User ID,\nA,1",{staffIdentifier:"User ID",occurredAt:""}),AttendanceCsvError);
});

test("rejects missing required columns and invalid column maps",()=>{
  assert.throws(()=>parseAttendanceCsv("User ID,Punch Time\nA,2026-11-15 08:00",{staffIdentifier:"Missing",occurredAt:"Punch Time"}),/column is not present/);
  assert.throws(()=>parseAttendanceCsv("User ID,Punch Time\nA,2026-11-15 08:00",null),AttendanceCsvError);
  assert.throws(()=>parseAttendanceCsv("User ID,Punch Time\nA,2026-11-15 08:00",{staffIdentifier:"",occurredAt:"Punch Time"}),/Select the CSV column/);
});

test("supports quoted commas, escaped quotes, CRLF and UTF-8 BOM",()=>{
  const rows=parseAttendanceCsv("\uFEFFUser ID,Punch Time,Note\r\nA,2026-11-15 08:00,\"Gate, east\"\r\nB,2026-11-15 09:00,\"said \"\"hello\"\"\"",{staffIdentifier:"User ID",occurredAt:"Punch Time"});
  assert.equal(rows.length,2);
  assert.equal(rows[0].staffIdentifier,"A");
  assert.equal(rows[1].staffIdentifier,"B");
});

test("rejects malformed quotes and forbidden NUL bytes",()=>{
  assert.throws(()=>parseAttendanceCsv("User ID,Punch Time\nA,\"2026-11-15 08:00",{staffIdentifier:"User ID",occurredAt:"Punch Time"}),AttendanceCsvError);
  assert.throws(()=>parseAttendanceCsv("User ID,Punch Time\nA,2026-11-15 08:00\u0000",{staffIdentifier:"User ID",occurredAt:"Punch Time"}),AttendanceCsvError);
});

test("rejects oversized CSV fields, too many columns and oversized files",()=>{
  assert.throws(()=>parseAttendanceCsv("User ID,Punch Time,Note\nA,2026-11-15 08:00,"+"x".repeat(501),{staffIdentifier:"User ID",occurredAt:"Punch Time"}),/500 characters/);
  const header=Array.from({length:41},(_,i)=>"H"+i).join(",");
  assert.throws(()=>parseAttendanceCsv(header+"\n"+Array(41).fill("x").join(","),{staffIdentifier:"H0",occurredAt:"H1"}),/40 columns/);
  assert.throws(()=>parseAttendanceCsv("x".repeat(2*1024*1024+1),columns),/2 MB/);
});

test("rejects imports with more than 5,000 data rows",()=>{
  const rows=["User ID,Punch Time",...Array.from({length:5001},(_,i)=>"A,2026-11-15 08:00")].join("\n");
  assert.throws(()=>parseAttendanceCsv(rows,{staffIdentifier:"User ID",occurredAt:"Punch Time"}),/5,000/);
});

test("records row-level failures without aborting valid rows",()=>{
  const rows=parseAttendanceCsv("User ID,Punch Time,State\nA,2026-11-15 08:00,in\n,2026-11-15 08:01,in\nB,not-a-date,out\nC,2026-11-15 08:02,out,EXTRA",{staffIdentifier:"User ID",occurredAt:"Punch Time",eventType:"State"});
  assert.equal(rows.length,4);
  assert.equal(rows.filter(row=>!row.error).length,1);
  assert.deepEqual(rows.filter(row=>row.error).map(row=>row.error.reasonCode),["invalid_staff_identifier","invalid_timestamp","invalid_column_count"]);
});

test("normalises supported event aliases and safely defaults unknown values",()=>{
  const rows=parseAttendanceCsv("User ID,Punch Time,State\nA,2026-11-15 08:00,punch_in\nB,2026-11-15 08:01,exit\nC,2026-11-15 08:02,break-start\nD,2026-11-15 08:03,mystery",{staffIdentifier:"User ID",occurredAt:"Punch Time",eventType:"State"});
  assert.deepEqual(rows.map(row=>row.eventType),["Clock In","Clock Out","Break Start","Unknown"]);
});

test("returns stable source-row hashes and rejects a header without data",()=>{
  const csv="User ID,Punch Time\nA,2026-11-15 08:00";
  assert.equal(parseAttendanceCsv(csv,{staffIdentifier:"User ID",occurredAt:"Punch Time"})[0].sourceRowSha256,parseAttendanceCsv(csv,{staffIdentifier:"User ID",occurredAt:"Punch Time"})[0].sourceRowSha256);
  assert.throws(()=>parseAttendanceCsv("User ID,Punch Time\n",{staffIdentifier:"User ID",occurredAt:"Punch Time"}),AttendanceCsvError);
});

test("rejects empty content and rows with an overlong terminal event identifier",()=>{
  assert.throws(()=>parseAttendanceCsv("",columns),AttendanceCsvError);
  const [row]=parseAttendanceCsv("User ID,Punch Time,Record ID\nA,2026-11-15 08:00,"+"X".repeat(201),{staffIdentifier:"User ID",occurredAt:"Punch Time",externalEventId:"Record ID"});
  assert.equal(row.error.reasonCode,"invalid_event_identifier");
});
