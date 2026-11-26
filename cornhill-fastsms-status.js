/* Port from local-server/src/integrations/cornhill-fastsms-status.mjs in
 * reviewed Windows candidate 0.1.14. Legacy status codes only. No transport.
 * Hardened own-property lookup to reject inherited names. No real SMS.
 */
(function(root){"use strict";
const FASTSMS_RESPONSE_CODES=Object.freeze(Object.fromEntries(Object.entries({"0000":{"kind":"provider_offline","accepted":false,"retry":"manual_review"},"0001":{"kind":"no_message_written","accepted":false,"retry":"manual_review"},"0002":{"kind":"insufficient_balance","accepted":false,"retry":"no"},"0003":{"kind":"provider_accepted_not_delivery_confirmed","accepted":true,"retry":"no"},"0004":{"kind":"undefined_provider_error","accepted":false,"retry":"manual_review"},"0005":{"kind":"account_inactive","accepted":false,"retry":"no"},"0006":{"kind":"invalid_provider_credentials","accepted":false,"retry":"no"},"0007":{"kind":"credentials_too_short","accepted":false,"retry":"no"}}).map(([key,value])=>[key,Object.freeze(value)])));
function interpretFastSmsResponse(raw){
 if(typeof raw==="string"&&Object.hasOwn(FASTSMS_RESPONSE_CODES,raw.trim()))return FASTSMS_RESPONSE_CODES[raw.trim()];
 return Object.freeze({kind:"unknown_response",accepted:false,retry:"manual_review"});
}
const api=Object.freeze({FASTSMS_RESPONSE_CODES,interpretFastSmsResponse});
if(typeof module==="object"&&module.exports)module.exports=api;else root.CornhillFastSmsStatus=api;
})(globalThis);
