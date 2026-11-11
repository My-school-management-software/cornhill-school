# CORNHILL sign-in and coordinated account model

**Date:** 11 November 2026  
**Status:** Sign-in UI update staged on the role-access feature branch. No live account, password, profile, or database changes were made.

## Sign-in window

The main sign-in screen now presents three compact account areas:
- Teaching staff — class teachers and subject-only teachers, with the existing class selection and individual teacher authentication.
- School staff — one private email/password entry for Headteacher, DOS, Bursar, Deputy Bursar and other approved Staff accounts.
- Director — the existing separate Admin email/password sign-in.

The class chooser uses smaller responsive tiles rather than large cards. The School Staff form is collapsed until requested. The Director form remains separately expandable. The layout includes a short security reminder, accessible status messages, and reduced-motion behavior.

The sign-in page intentionally does not publish a list of individual staff names, email addresses, account IDs, or account existence. Users select their account area and enter their own credentials. This avoids exposing a staff directory or helping someone target a particular account.

## Authentication behavior

- Staff accounts authenticate through Supabase Auth email/password and must resolve to a user_profiles row with role Staff.
- Staff accounts with a non-Active employment status are signed out and refused access.
- Admin remains restricted to role Admin.
- Teachers remain restricted to role Teacher and must pass the existing assignment check for the selected class.
- Staff login stores the Staff login mode rather than mislabelling the session as Admin.
- No staff-code login was added in this UI-only phase. Headteacher/DOS staff-code sign-in remains a separate secure backend task and must use a protected, rate-limited server-side lookup. Never expose an email or password hash during code lookup.

## Coordination and separation

All school accounts use the same school database, but each person has an individual identity. Coordination should happen through assigned work queues, notices, and approvals—not by sharing passwords or giving everyone access to the Director account.

Recommended responsibility flow:
1. Director creates, activates, suspends, resets and assigns accounts/permissions.
2. DOS coordinates academic work, reviews marks and prepares academic recommendations.
3. Headteacher sees school-wide operational/academic overviews and handles only approved administrative actions.
4. Bursar and Deputy Bursar handle permitted finance entry and receipts; sensitive approvals, reversals and evidence review remain Director-controlled.
5. Class and subject teachers see only their assigned class/subject duties.
6. Notifications and approval requests are routed to the responsible role, with timestamps and an audit trail. Escalations go to the Director when an item is overdue or outside delegated authority.

## Next security and quality gates

- Create Headteacher, DOS and finance staff accounts only after the Director confirms the real employee records and email addresses. The current live profile audit found 1 active Admin and 10 active Teachers, with no active Staff login profiles; this UI change does not create any.
- Add and test role-specific Staff permissions and approval queues against non-production identities.
- Implement staff-code login only after its lookup, rate limits, generic error responses, lockout/throttling, audit events and recovery behavior are reviewed.
- Add MFA enrollment and step-up verification for sensitive actions where supported and operationally practical.
- Verify browser behavior on desktop and mobile, and test offline behavior separately. Offline access must be device-bound, encrypted, limited to approved cached data, and never treat a cached role as permission to perform sensitive online actions.
- Review Supabase advisor warnings before release. The current live advisor summary includes warnings for extension placement, callable SECURITY DEFINER functions, leaked-password protection not enabled, and multiple permissive RLS policies. These are existing project findings, not proof that the new sign-in UI introduced them.

## Verification completed in this change

- Eight inline JavaScript blocks parsed with no syntax errors after the sign-in change.
- Verified the Staff form markup, event handler, Staff role check, active-employment check and Staff session marker are present in the committed file.
- No live Supabase migration, account creation, password change, or data update was performed.
- Authenticated role-by-role browser testing is still pending.
