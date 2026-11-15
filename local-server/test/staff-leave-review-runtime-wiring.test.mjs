import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const runtime=await readFile(new URL("../src/security/auth-runtime.mjs",import.meta.url),"utf8");
test("leave review repository and guarded HTTP handler are connected to local auth runtime",()=>{
 assert.match(runtime,/createPostgresStaffLeaveReviewRepository/);
 assert.match(runtime,/createStaffLeaveReviewHttpHandler/);
 assert.match(runtime,/staffLeaveReviewRouteHandler\(request, response\)/);
});
