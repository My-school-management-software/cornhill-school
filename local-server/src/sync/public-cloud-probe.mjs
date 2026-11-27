// Read-only public website availability probe, not authentication or sync acceptance.
// Never sends school credentials, cookies, learner details, local file contents or API keys.
export const VERIFIED_PRODUCTION_ORIGIN = "https://cornhill-school-swart.vercel.app/";

/**
 * This probe deliberately targets only CORNHILL's known production frontend.
 * A reachable page does not establish healthy Supabase auth or record synchronization.
 */
export async function probePublicCloud(request = globalThis.fetch) {
  if (typeof request !== "function") throw new TypeError("request must be a function");
  const base = {
    target: "cornhill-production-public-frontend",
    cloudAuthVerified: false,
    localDataSyncVerified: false,
    schoolRecordWritesAllowed: false
  };
  let response;
  try {
    response = await request(VERIFIED_PRODUCTION_ORIGIN, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { Accept: "text/html", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return Object.freeze({ ...base, status: "unreachable", statusCode: null });
  }
  const statusCode = Number.isInteger(response?.status) ? response.status : null;
  const contentType = response?.headers?.get?.("content-type") ?? "";
  // Redirects are NOT followed. The probe must never accidentally send a request
  // to a different domain, sign-in service, or a page with an unknown policy.
  const success = statusCode === 200 && /^text\/html(?:\s*;|$)/i.test(contentType);
  // Do not read the page body, cookies, or any private record content.
  try { await response?.body?.cancel?.(); } catch { /* streams may be locked */ }
  return Object.freeze({ ...base, status: success ? "public_html_reachable" : "not_verified", statusCode });
}
