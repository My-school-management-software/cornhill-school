# CORNHILL Bursar Account Enrollment — 12 November 2026

## Intended workflow

1. The Director selects the existing active, unlinked Main Bursar or Deputy Bursar employee record and enters the confirmed official email address.
2. The server calls Supabase Auth `inviteUserByEmail` with the dedicated `bursar-account.html` redirect. Supabase Auth creates an unconfirmed identity and accepts the invitation for email delivery. No `user_profiles` row is created and no employee directory link is assigned at this stage.
3. The bursar opens the invitation email. Supabase Auth verifies the email and returns a session to the dedicated setup page.
4. The setup page asks the server to verify the signed-in identity and confirmation timestamp. The enrollment moves to `email_verified`; the bursar sees an approval-pending message and no school data.
5. The Director reviews the pending list and explicitly approves or rejects the verified enrollment. The bursar can keep the setup page open or return to it in the same browser session and select Check approval status. This version does not send a separate second email after approval.
6. After approval, the bursar returns to the same setup page and creates/confirms a private password. The browser updates the password through Supabase Auth.
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

## Required Supabase project configuration before live use

1. Add `https://cornhill-school-swart.vercel.app/bursar-account.html` to Authentication > URL Configuration > Redirect URLs. Supabase silently falls back to Site URL when a redirect target is not allow-listed.
2. Configure a verified custom SMTP sender for the school's authentication emails. Supabase's default SMTP server is for development/testing, sends only to pre-authorised organisation addresses, and currently has a two-email-per-hour limit. A successful Edge Function response means Supabase Auth accepted the request for delivery; it is not proof that the recipient opened or received the message.
3. Review the Auth Invite User and Reset Password email templates and expiration setting. If the school changes the expiration, the page and written instructions must be updated to match.
4. Enable the **Password changed** security notification for the project, customise its template if desired, and verify that it uses the school's configured SMTP sender. Supabase only sends these security emails when the corresponding project-level notification is enabled.
5. Do not deploy the migration/function or send a real invitation until the redirect, sender, templates and password-change notification have been verified. No real bursar accounts are created by this change.

## Preview CORS configuration

The bursar administration Edge Function uses an explicit origin allowlist. The permanent CORNHILL hosts remain allowed, and the exact current review preview host is added for authenticated Director testing:

`https://cornhill-school-git-feat-login-contract-0df38b-cypher-projects1.vercel.app`

Unknown origins continue to receive `Access-Control-Allow-Origin: null`; the function does not use wildcard CORS. When the review preview address changes, only the exact replacement host should be added after confirming it belongs to the CORNHILL Vercel project. This preview-origin entry does not change Supabase Auth's email redirect allowlist or SMTP configuration.

## Current implementation boundaries

The database migration, bursar account Edge Function and Director interface are already deployed. This origin-only update enables the current review preview to call the bursar function; it does not configure SMTP or Supabase Auth redirect URLs, create real bursar accounts, or send invitations.