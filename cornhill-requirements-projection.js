/* CORNHILL physical requirements projection. Pure calculations only.
 * Inputs MUST come from authenticated, server-verified, class-scoped records.
 * Not an authorization, persistence, stock posting, or finance API.
 * Do not use caller-supplied status as evidence of verification.
 */
(function(root){
"use strict";
function projectRequirement(input) {
  if (!input || typeof input !== "object") throw new TypeError("Requirement input required");
  const { requirement, deliveries } = input;
  if (requirement == null) return { status: "unassessed", required: null, received: null, outstanding: null };
  const { id, learnerId, termId, classId, quantity } = requirement;
  if (![id, learnerId, termId, classId].every(v => typeof v === "string" && v.trim() !== "") || !Number.isSafeInteger(quantity) || quantity <= 0 || !Array.isArray(deliveries)) throw new TypeError("Invalid assessed requirement");
  const seen = new Set();
  let received = 0;
  for (const d of deliveries) {
    if (!d || ![d.id,d.requirementId,d.learnerId,d.termId,d.classId].every(v => typeof v === "string" && v.trim() !== "") || !Number.isSafeInteger(d.quantity) || d.quantity <= 0 || !["pending","verified","rejected","reversed"].includes(d.status)) throw new TypeError("Invalid delivery");
    if (d.requirementId !== id || d.learnerId !== learnerId || d.termId !== termId || d.classId !== classId) throw new Error("Delivery scope mismatch");
    if (seen.has(d.id)) throw new Error("Duplicate delivery record");
    seen.add(d.id);
    if (d.status === "verified") {
      received += d.quantity;
      if (!Number.isSafeInteger(received)) throw new RangeError("Invalid total");
    }
  }
  return { status: received >= quantity ? "settled" : received > 0 ? "partial" : "outstanding", required: quantity, received, outstanding: Math.max(0,quantity-received) };
}
function projectHandover(input) {
  if (!input || typeof input !== "object") throw new TypeError("Handover required");
  const { fromStaffId, toStaffId, quantity, acknowledgements } = input;
  if (![fromStaffId,toStaffId].every(v=>typeof v==="string" && v.trim()!== "") || fromStaffId===toStaffId || !Number.isSafeInteger(quantity) || quantity<=0 || !Array.isArray(acknowledgements)) throw new TypeError("Invalid handover");
  const seen = new Set();
  let disputed = false;
  for (const a of acknowledgements) {
    if (!a || ![fromStaffId,toStaffId].includes(a.staffId) || typeof a.accepted !== "boolean" || seen.has(a.staffId)) throw new Error("Invalid or duplicate acknowledgement");
    seen.add(a.staffId);
    if (!a.accepted) disputed = true;
  }
  return disputed ? "disputed" : seen.size===2 ? "acknowledged" : "pending";
}
const api=Object.freeze({projectRequirement,projectHandover});
if(typeof module==="object" && module.exports) module.exports=api;
else root.CornhillRequirementsProjection=api;
})(typeof globalThis==="object"?globalThis:this);
