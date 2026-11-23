(() => {
"use strict";
const get = id => document.getElementById(id);
const money = value => Number.isSafeInteger(value) && value >= 0 ? "UGX " + value.toLocaleString("en-UG") : "—";
function status(message) { get("status").textContent = message; }
function cell(tr, value) { const td = document.createElement("td"); td.textContent = String(value ?? ""); tr.append(td); }
function render(report) {
  if (!report || !Array.isArray(report.rows) || !report.totals || !Number.isFinite(Date.parse(report.asOf))) throw new Error("Incomplete reporting response.");
  const totals = report.totals;
  for (const key of ["previousTermOutstandingUgx","currentTermOutstandingUgx","totalOutstandingUgx"]) {
    if (!Number.isSafeInteger(totals[key]) || totals[key] < 0) throw new Error("Invalid server financial totals.");
  }
  if (totals.totalOutstandingUgx !== totals.previousTermOutstandingUgx + totals.currentTermOutstandingUgx) throw new Error("Server totals do not reconcile.");
  const rows = document.createDocumentFragment();
  for (const row of report.rows) {
    for (const key of ["previousTermOutstandingUgx","currentTermOutstandingUgx","totalOutstandingUgx"]) {
      if (!Number.isSafeInteger(row[key]) || row[key] < 0) throw new Error("Invalid pupil balance.");
    }
    if (row.totalOutstandingUgx !== row.previousTermOutstandingUgx + row.currentTermOutstandingUgx) throw new Error("Pupil balance does not reconcile.");
    const tr = document.createElement("tr");
    for (const value of [row.pupilCode,row.learnerName,row.className,row.academicYear,row.term,
      money(row.previousTermOutstandingUgx),money(row.currentTermOutstandingUgx),money(row.totalOutstandingUgx),row.paymentStatus]) cell(tr,value);
    rows.append(tr);
  }
  if (!report.rows.length) { const tr=document.createElement("tr"); const td=document.createElement("td"); td.colSpan=9; td.textContent="No learners matched these report filters."; tr.append(td); rows.append(tr); }
  get("rows").replaceChildren(rows);
  get("previous").textContent=money(totals.previousTermOutstandingUgx);
  get("current").textContent=money(totals.currentTermOutstandingUgx);
  get("combined").textContent=money(totals.totalOutstandingUgx);
  get("snapshot").textContent="Report as at "+new Date(report.asOf).toLocaleString("en-UG",{timeZone:"Africa/Kampala"})+" (Uganda time)";
  get("scope").textContent="Server-reported matching learners: "+String(totals.rowCount ?? "not specified")+". This page displays "+report.rows.length+" rows; do not interpret page totals as whole-school collections.";
  get("print").disabled=false;
}
get("filters").addEventListener("submit", async event => {
  event.preventDefault();
  const params = new URLSearchParams({status:get("payment-status").value,page:"1",pageSize:"100"});
  for (const [field,id] of [["year","year"],["term","term"],["class","class"],["query","query"]]) {
    const value=get(id).value.trim(); if(value) params.set(field,value);
  }
  get("print").disabled=true; status("Retrieving authorised read-only balances…");
  try {
    const response = await fetch("/api/v1/finance/reports/pupil-balances?"+params, {credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}});
    if (!response.ok) throw new Error(response.status===403?"This staff account is not authorised to view finance reports.":response.status===401?"Please sign in to your authorised staff account.":"The finance reporting service is not yet available ("+response.status+").");
    const data=await response.json(); render(data.report); status("Read-only balances loaded.");
  } catch (error) {
    get("rows").replaceChildren();get("previous").textContent="—";get("current").textContent="—";get("combined").textContent="—";
    get("snapshot").textContent="No verified balance report available.";
    status(error.message || "Unable to load balances.");
  }
});
get("print").addEventListener("click", () => window.print());
})();