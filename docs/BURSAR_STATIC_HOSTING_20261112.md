# CORNHILL bursar setup static hosting — 12 November 2026

## Hosting design

The bursar setup interface is a static HTML file. It is published separately from the main school website using GitHub Pages (the repository is public, so GitHub Pages is available on GitHub Free). The workflow copies only `bursar-account.html` into the Pages artifact; it does not publish the source repository or school application.

Public URL after GitHub Pages is enabled and the deployment succeeds:

`https://my-school-management-software.github.io/cornhill-school/bursar-account.html`

## One-time repository setting

A repository administrator must select:

**GitHub repository → Settings → Pages → Build and deployment → Source → GitHub Actions**

The repository is public. No paid upgrade is needed. The GitHub Actions workflow has the required `pages: write` and `id-token: write` permissions. The `configure-pages` action checks that Pages has been enabled; it does not use a stored personal access token or create one.

If the first workflow run fails because Pages is not enabled, make the setting above and rerun that workflow. The workflow publishes only the bursar HTML page.

## Authentication redirect compatibility

The page deliberately continues to pass the existing, already-used callback URL to Supabase Auth:

`https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/bursar-account-web`

The Auth invite and password-reset URL configuration therefore does not need a new GitHub Pages redirect entry. The public `bursar-account-web` function will become a minimal HTTP redirect to the GitHub Pages URL. For 3xx responses, HTTP requires browsers to inherit the original URL fragment when the Location value has no fragment; this carries the Supabase browser session fragment to the page that consumes it. The redirect must use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The final page uses the Supabase publishable key only and calls the separate `bursar-account-admin` function, which continues to require a valid JWT and role checks.

The `bursar-account-admin` CORS allowlist must include the exact static page origin:

`https://my-school-management-software.github.io`

The Supabase callback and function deployment are separate from the GitHub Pages publishing workflow.

## Release gates

Do not send or resend either bursar invitation until all of these are verified:

1. GitHub Pages workflow is successful and the static URL displays the green CORNHILL page (not source code).
2. `bursar-account-web` is deployed as an HTTP redirect to the static page.
3. `bursar-account-admin` includes the GitHub Pages origin in its CORS allowlist and remains JWT-protected.
4. A test invitation/recovery flow verifies the session survives the redirect and the page can call the protected function.

No existing invitation, staff profile, password, or employee link is changed by publishing this static page. Keep the existing invitations intact during acceptance testing.
