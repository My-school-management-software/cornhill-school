import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const server = new URL("../src/https-server.mjs", import.meta.url);
const page = new URL("../public/pupil-balances.html", import.meta.url);
const browser = new URL("../public/pupil-balances.js", import.meta.url);
const style = new URL("../public/pupil-balances.css", import.meta.url);

test("Pupil balances page and its stylesheet/script are registered for local HTTPS", async()=>{
  const [routes,html,js,css] = await Promise.all([server,page,browser,style].map(url=>readFile(url,"utf8")));
  for(const path of ["/pupil-balances","/pupil-balances.html","/pupil-balances.js","/pupil-balances.css"]){
    assert.ok(routes.includes('["'+path+'"'),"Missing static route: "+path);
  }
  assert.match(html,/Pupil Account Balances Sheet/);
  assert.match(html,/pupil-balances.js/);
  assert.match(html,/pupil-balances.css/);
  assert.match(js,/\/api\/v1\/finance\/reports\/pupil-balances/);
  assert.match(css,/@media print/);
});
test("read-only balance page never contains payment-recording controls",async()=>{
  const html=await readFile(page,"utf8"), js=await readFile(browser,"utf8");
  assert.doesNotMatch(html,/post-payment-button|Record payment and issue receipt/i);
  assert.doesNotMatch(js,/method\s*:\s*["']POST["']/);
});
