import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Supabase Auth keeps using this established callback. The callback now
// forwards the browser to the static GitHub Pages UI instead of returning
// HTML from an Edge Function (which was displayed as source on some clients).
// A 3xx Location without its own fragment inherits the original fragment in
// the browser, allowing Supabase JS on the destination page to consume the
// session fragment. The destination is a fixed constant, never user input.
const DESTINATION = "https://my-school-management-software.github.io/cornhill-school/bursar-account.html";

const redirectHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

Deno.serve((req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: {
        "Allow": "GET, HEAD",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Keep any Supabase auth parameters in the query string (for example, an
  // authorization code or error details). The fixed origin/path above cannot
  // be overridden by query values. Do not set a fragment here: the browser
  // inherits the original URL fragment as required for 3xx redirects.
  const incomingUrl = new URL(req.url);
  const destinationUrl = new URL(DESTINATION);
  destinationUrl.search = incomingUrl.search;

  return new Response(null, {
    status: 302,
    headers: {
      ...redirectHeaders,
      "Location": destinationUrl.toString(),
    },
  });
});
