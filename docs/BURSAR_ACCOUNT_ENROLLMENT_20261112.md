# CORNHILL Bursar Account Enrollment — 12 November 2026

## Intended workflow

1. The Director selects the existing active, unlinked Main Bursar or Deputy Bursar employee record and enters the confirmed official email address.
2. The JWT-protected server function calls Supabase Auth `inviteUserByEmail` with the established callback `https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/bursar-account-web`. No `user_profiles` row is created and no employee directory link is assigned at this stage.
3. Supabase verifies the one-time invitation and redirects the browser to that callback. The callback returns a no-store HTTP 302 to the static GitHub Pages setup page. The 302 Location deliberately has no fragment; browsers inherit the original URL fragment so the page's Supabase client can receive and consume the signed-in session.
4. The setup page asks the JWT-protected server to verify the signed-in identity and confirmation timestamp. The enrollment moves to `email_verified`; the bursar sees an approval-pending message and no school data.
5. The Director reviews the pending list and explicitly approves or rejects the verified enrollment. The bursar can keep the setup page open or return to it in the same browser session and select Check approval status. This version does not send a separate second email after approval.
6. After approval, the bursar returns to the GitHub Pages setup page and creates/confirms a private password. The browser updates the password through Supabase Auth.
7. The server-only activation function verifies the confirmed email, approved state, employee record and job title, then atomically creates the Staff profile, links the existing employee record and marks the enrollment active.
8. The bursar signs in through the normal CORNHILL sign-in page using their own email and password.

## Safeguards

- Supabase Auth invitation links are single-use and expire according to the project's Auth email OTP expiration configuration. Do not put tokens or full URLs in the enrollment audit. The setup page keeps an authenticated session in that browser so the bursar can check approval status later.
- No password is sent to the Director, placed in invitation metadata, or stored in the enrollment table. Supabase Auth stores the password hash.
- Director approvals, email verification, delivery result, rejection and activation are recorded in a restricted audit table.
- Main and Deputy Bursar identities are separate and the employee's exact recorded role is checked before activation.
- Password recovery uses Supabase Auth's expiring, single-use recovery link and built-in rate limits. A bursar may request a recovery email from the setup page if the browser session is lost. Password recovery cannot activate an unapproved account.
- After a password is changed on an already active bursar account, the server records a `password_reset_completed` audit event. Supabase Auth can also send the standard **Password changed** security notification to the bursar. The project-level security notification must be enabled under Authentication email/security notification settings; it is not enabled by this code change.
- No password is visible to the Director.

The older generic `staff-invite` Edge Function is explicitly blocked from inviting job titles recognised as Bursar, so it cannot bypass this separate approval process.

## Required configuration

1. Keep the project's Site URL set to the normal CORNHILL production website.
2. Keep the existing callback URL `https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/bursar-account-web` on the Supabase Auth Redirect URLs allowlist. Both invitations and password recovery continue using this same callback; the GitHub Pages destination is reached only after the callback's HTTP redirect, so no new GitHub Pages URL is needed in the Auth allowlist.
3. In the public GitHub repository, set **Settings → Pages → Build and deployment → Source → GitHub Actions** once. GitHub Pages is available for this public repository on GitHub Free. The Actions workflow publishes only `bursar-account.html`; it does not publish the rest of the school application.
4. Configure a verified custom SMTP sender for the school's authentication emails. Review the Auth Invite User and Reset Password email templates and their expiration setting. A successful Edge Function response means Supabase Auth accepted the request for delivery; it is not proof that the recipient opened or received the message.
5. Enable the **Password changed** security notification for the project and verify its email template and sender.
6. The bursar admin function's explicit CORS allowlist must include `https://my-school-management-software.github.io`. It must continue requiring a valid JWT; Director-only operations must continue checking the active Director profile.

## Redirect behavior and security

The public `bursar-account-web` function accepts only GET and HEAD and returns a fixed 302 destination. It does not read account data, accept user-supplied destinations, or perform account mutations. The redirect copies the callback's query string to the fixed GitHub Pages URL so authentication codes and error details are not dropped; it does not accept a caller-supplied destination. It deliberately leaves the destination fragment unset so the browser inherits the original session fragment. It uses `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The static page contains only the Supabase publishable key, not a service-role or secret key. Account status, approval, activation and password-reset audit operations remain in `bursar-account-admin`, which requires a JWT and verifies the signed-in user.

## Release gates

Do not send or resend either bursar invitation until all of these are verified:

1. GitHub Pages workflow succeeds and the static URL displays the green CORNHILL setup page, not source code.
2. `bursar-account-web` is deployed as the fixed HTTP redirect described above.
3. `bursar-account-admin` includes the GitHub Pages origin in its CORS allowlist and remains JWT-protected.
4. A test invitation/recovery flow verifies the session survives the redirect and the page can call the protected function.

No existing invitation, staff profile, password, or employee link is changed by these source changes. Keep the existing invitations intact during acceptance testing.


Regression suite note: the bursar redirect contract test loads the redirect Edge Function source explicitly and checks its fixed destination, 302 status, no-store policy, and no-referrer policy.
