"use strict";
document.addEventListener("DOMContentLoaded",()=>{
 const select=document.getElementById("cornhillFastSmsCode"),out=document.getElementById("cornhillFastSmsResult");
 if(!select||!out)return;
 const labels=Object.freeze({provider_offline:"Provider offline; review manually.",no_message_written:"No message written; review manually.",insufficient_balance:"Insufficient balance.",provider_accepted_not_delivery_confirmed:"Provider accepted the message; delivery is NOT confirmed.",undefined_provider_error:"Provider error; review manually.",account_inactive:"Account inactive.",invalid_provider_credentials:"Invalid provider credentials.",credentials_too_short:"Provider credentials too short.",unknown_response:"Unknown response; review manually."});
 select.addEventListener("change",()=>{
  const value=globalThis.CornhillFastSmsStatus?.interpretFastSmsResponse(select.value);
  out.textContent=select.value?(labels[value?.kind]||labels.unknown_response)+" Reference only; no message sent.":"No provider call made.";
 });
});