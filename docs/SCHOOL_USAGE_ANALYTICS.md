# CORNHILL School Usage Analytics

## Purpose
The Director can review how the public website, Parent Portal and staff workspaces are being used, identify difficult-to-use apps and prioritise improvements.

## Consent and coverage
- Usage statistics are optional. A browser/account is counted only after the user chooses **Allow basic statistics**.
- Choosing **Not now** disables collection on that browser. Users can change the choice using **Usage statistics settings**.
- Because participation is optional, the totals are not a census and may be lower than actual visits.
- The collector is first-party and is hosted with CORNHILL's Supabase project. It does not use third-party advertising trackers.

## Data recorded
The collector records an allowlisted workspace, a limited event category, broad device class, timestamp and pseudonymised visitor/session/account identifiers.

Examples of reported measures:
- Public website and admissions page visitors.
- Admission form starts, submission attempts, successful submission acknowledgements and errors.
- Verified guardian portal sign-ins.
- Active staff account use and visits to named staff workspaces.
- Mobile, tablet and desktop event totals.
- Daily trends and most-used workspaces.

## Data not collected for analytics
The analytics events do not contain learner names or pupil codes, LINs, learner records, marks, report-card information, payment details, guardian phone numbers, email addresses, message contents, staff names, raw IP addresses, raw browser identifiers or full page URLs/query strings.

A browser-generated random ID and the relevant guardian/staff account reference are HMAC-hashed on the server before storage. The raw account identifier is not inserted into the analytics table. Reports return aggregates rather than identities.

## Access and retention
- The raw event table has Row Level Security enabled and no direct SELECT/INSERT grant for anonymous or ordinary authenticated browser clients.
- The Edge Function verifies staff sessions and the Parent Portal guardian session. The usage report is restricted to the active Director account.
- The database cleanup job deletes events older than 90 days.
- The report date range is limited to 90 calendar days and uses Africa/Kampala dates.

## Interpretation limits
- Optional consent means visitor counts are incomplete.
- Browser storage reset, private browsing or changing devices can create a new pseudonymous visitor.
- Admission submission/received events are app telemetry, not the official admissions register or an admission decision.
- A page visit records access to a workspace; it does not prove that the user completed a task successfully.
- Analytics collection needs an internet connection. It is not queued or synchronised while the tablet is offline.
- The analytics dashboard must be tested with a Director account and test guardian/staff accounts before school-wide use.

## Maintenance
If a workspace receives many visits but also frequent form errors or support requests, review that app. The dashboard is an improvement aid, not a staff performance scorecard.
