// From the local-server directory: node scripts/check-cloud-access.mjs
// This is a safe public frontend probe only. It does not establish user sign-in,
// Supabase availability, local-to-cloud sync or production release readiness.
import { probePublicCloud } from "../src/sync/public-cloud-probe.mjs";

const result = await probePublicCloud();
console.log("CORNHILL CLOUD READ-ONLY CONNECTIVITY CHECK");
console.log("CLOUD_PUBLIC_HTML=" + result.status);
console.log("CLOUD_HTTP_STATUS=" + (result.statusCode ?? "NO_RESPONSE"));
console.log("CLOUD_AUTH_VERIFIED=false");
console.log("CLOUD_LOCAL_SYNC_VERIFIED=false");
console.log("DATABASE_WRITES=0");
if (result.status !== "public_html_reachable") process.exitCode = 1;
