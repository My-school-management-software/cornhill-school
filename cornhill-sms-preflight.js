/* Pure SMS eligibility preview; never sends a message. All input must be
 * server-verified. A future worker MUST atomically reserve budget and the
 * idempotency key, recheck current consent, and validate provider response.
 * The price in tests is synthetic and not a verified FastSMS price.
 */
(function(root){"use strict";
function previewSmsEligibility(input) {
  if(!input || typeof input!=="object") throw new TypeError("SMS preflight input required");
  const {policy,recipient,message}=input;
  const deny=reason=>({eligible:false,reason,estimatedCostUgx:null});
  if(!policy || policy.enabled!==true) return deny("provider_disabled");
  if(policy.providerVerified!==true || policy.senderApproved!==true || policy.templateApproved!==true) return deny("provider_or_template_unverified");
  if(!recipient || recipient.consent!==true || recipient.linkVerified!==true || recipient.phoneVerified!==true) return deny("recipient_unverified_or_opted_out");
  if(!message || message.approved!==true || typeof message.idempotencyKey!=="string" || !message.idempotencyKey.trim()) return deny("message_not_approved");
  if(message.alreadyQueuedOrSent!==false) return deny("duplicate_or_unknown");
  const {verifiedUnitPriceUgx,dailyBudgetUgx,monthlyBudgetUgx,dailyCommittedUgx,monthlyCommittedUgx}=policy;
  const units=message.verifiedBillableUnits;
  if(![verifiedUnitPriceUgx,dailyBudgetUgx,monthlyBudgetUgx,dailyCommittedUgx,monthlyCommittedUgx,units].every(x=>Number.isSafeInteger(x)&&x>=0)||units===0||verifiedUnitPriceUgx===0) return deny("cost_unverified");
  const cost=units*verifiedUnitPriceUgx;
  if(!Number.isSafeInteger(cost)) return deny("cost_unverified");
  if(cost>dailyBudgetUgx-dailyCommittedUgx||cost>monthlyBudgetUgx-monthlyCommittedUgx) return deny("budget_exceeded");
  return {eligible:true,reason:"preview_only",estimatedCostUgx:cost};
}
const api=Object.freeze({previewSmsEligibility});
if(typeof module==="object"&&module.exports) module.exports=api;else root.CornhillSmsPreflight=api;
})(typeof globalThis==="object"?globalThis:this);
