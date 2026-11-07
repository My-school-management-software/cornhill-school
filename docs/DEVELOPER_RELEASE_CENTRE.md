# CORNHILL Developer & Release Centre

This document is the controlled project handover and update guide for CORNHILL NURSERY AND PRIMARY SCHOOL Management System.

## Permanent application address

- Production application: https://cornhill-school-cypher-projects1.vercel.app/
- Parent portal: https://cornhill-school-cypher-projects1.vercel.app/parents.html

The permanent address is an alias/domain. Do not replace it with a preview URL during ordinary updates. Production releases must be made to the existing Vercel project and the existing production domain must remain attached.

## Project control links

- GitHub repository: https://github.com/My-school-management-software/cornhill-school
- Active development branch: https://github.com/My-school-management-software/cornhill-school/tree/feature/cornhill-v3-foundation
- GitHub commits: https://github.com/My-school-management-software/cornhill-school/commits/feature/cornhill-v3-foundation/
- Vercel project dashboard: https://vercel.com/cypher-projects1/cornhill-school
- Supabase project dashboard: https://supabase.com/dashboard/project/yemhortbudwbcrzsoozk
- ChatGPT: https://chatgpt.com/

Conversation links: add the exact ChatGPT share/conversation URL for each important development thread when available. A general ChatGPT link does not identify a particular conversation. Do not fabricate conversation URLs or copy private conversations into a public repository.

## Current development reference (7 November 2026)

- Repository: `My-school-management-software/cornhill-school`
- Branch: `feature/cornhill-v3-foundation`
- Latest reviewed feature commit: `c58e5e620d733cc72371d8fe7148a47ed8fe61e0`
- Commit message: `Fix guardian PIN failure handling and validation`
- Latest preview deployment: https://cornhill-school-ebbsu8e3t-cypher-projects1.vercel.app/
- Preview deployment ID: `dpl_EqSDUyhttQfraL37FeUStfH4bu6m`
- Preview state at last check: READY; target was preview, not production.
- Production deployment at last check used the `main` branch and an earlier commit. The latest feature commit had not been promoted to production.

## Developer access and secrets

The Developer & Release Centre must be restricted to a separately authorised developer identity, not merely every user with the ordinary school administrator role.

- Do not put a developer password, Supabase service-role key, Vercel token, GitHub token, Google refresh token, backup encryption key, OTP secret, or recovery code in HTML, JavaScript, Git, browser storage, or this document.
- Do not create a shared hard-coded master password.
- Use the school account's secure authentication, a separate server-side developer allowlist/role, and multi-factor authentication for release access.
- The developer identity must be provisioned through a trusted administrative process. The application must not allow a user to grant themselves developer privileges.
- Show project identifiers and safe dashboard links; never display secret values.
- Keep a private credential manager under the account owner's control for credentials. Never send passwords or secret keys in ChatGPT conversations.

## Project knowledgebook and conversation records

Maintain a curated, dated project knowledgebook containing:
- agreed requirements and decisions;
- module completion status and acceptance criteria;
- important implementation notes and migration history;
- release notes, test results, known limitations and rollback notes;
- links to the exact relevant ChatGPT conversations, when the user supplies or saves those links.

Do not claim this file contains every line of every ChatGPT conversation. The application/repository cannot automatically retrieve the user's full ChatGPT chat history. Preserve full conversations in the user's ChatGPT account/export; put only approved summaries and explicit conversation links in the project knowledgebook. Never publish private conversation transcripts or learner/staff personal information in the public repository.

## Safe update and release procedure

1. Work on a feature branch; do not develop directly on the production branch.
2. Review the change and its database impact. Keep application code separate from school records.
3. Add backward-compatible database migrations. Never drop, truncate, overwrite, or reseed real learner, guardian, staff, academic or finance records as part of a routine software update.
4. Verify a recent encrypted backup and its table manifest. A successful backup validation is not proof of a successful restore. Test recovery in an isolated project before relying on it.
5. Include Auth accounts and Storage files in a separate, documented recovery plan; the current application-level database snapshot does not cover them.
6. Deploy a preview. Run automated checks and role-based acceptance tests with synthetic/test records; do not use real learner information for test transactions.
7. Stage a production deployment using production configuration, verify it, and only then promote the tested production build.
8. Confirm the existing permanent domain remains assigned. Do not send users a preview URL as the permanent address.
9. Check runtime errors, sign-in, parent portal access, key workflows and data integrity after release.
10. If a release fails, roll back the application deployment and apply a reviewed database recovery plan if needed. Never assume a code rollback reverses a database migration.
11. Record the version, commit, deployment ID, date, test outcome, migration and rollback details in the release log.

## Device updates and offline behaviour

CORNHILL is a web application/PWA. When a new production release is published to the same permanent address, devices using that address can receive the new application files after refresh/service-worker update. A device may retain cached files until its service worker checks for an update or the user reconnects. Do not promise that every offline device updates immediately.

The current offline support is limited to the application shell. Live database operations, authentication and synchronisation require connectivity; offline data-entry and conflict-safe synchronisation must be implemented and tested before claiming full offline operation.


## Parent portal photographs and school communication (requirements added 7 November 2026)

### Learner photographs
- Admission already supports an optional JPEG, PNG or WebP learner photograph (maximum 4 MB) in the private `learner-photos` bucket. The `students.photo_path` field is present, and the administrator admission/edit workflow uploads and replaces photographs.
- Staff learner profile and mark-sheet views already generate short-lived signed photo URLs under authenticated storage policies.
- The parent portal currently does not display a learner photograph. Add it only after the guardian has successfully verified the pupil code, registered phone and 8-digit PIN.
- Parent photo delivery must use a server-side, short-lived signed URL or equivalent narrowly scoped mechanism. Do not make the `learner-photos` bucket public and do not grant anonymous Storage access.
- The parent must see only the photograph for the learner linked to that verified guardian contact.
- Keep photo upload optional at admission. Administrators may add, replace or update the photo later as the learner grows. Preserve the previous photo until the new upload and database path update both succeed; remove obsolete objects only after the replacement is confirmed.
- Keep upload validation (JPEG/PNG/WebP, 4 MB) and private bucket policies. Consider an audit entry for photo replacement (actor and timestamp), without exposing storage paths to parents.

### Parent-to-school communication
- Add a private “Contact the School” area inside the verified parent portal.
- Parents may send typed text messages or recorded voice notes only. Do not add voice calls or video calls.
- Provide recipient choices for the current active staff directory, grouped sensibly by role/office (e.g. Headteacher, Deputy Headteacher, DOS, Bursar, class teacher, administrator). Include a clear “Send to school administration” option.
- Allow a parent to choose “Report an issue” and optionally select a relevant staff member. Messages must be routed to the chosen authorised recipient(s), with a school administration oversight queue for reports.
- Display delivery/receipt status and a parent-visible conversation history for that guardian and learner. Staff must only see conversations addressed to them or explicitly routed to administration.
- Voice notes need strict MIME/size/duration limits, private storage, signed playback URLs and retention controls. No public audio URLs.
- No third-party SMS/WhatsApp/OTP provider is required for in-portal messaging. Do not activate paid providers or add calling features.

### Required security architecture before enabling parent messaging
- The existing parent PIN RPC returns learner information but does not establish an authenticated Supabase user session. Do not simply expose staff directories, message tables, or storage upload policies to the anonymous role.
- Implement a short-lived, revocable parent portal session/token bound to the exact guardian contact, learner, and verified PIN event. Store only a hash of the token server-side; apply expiry, rate limits and revocation.
- Route parent message creation, conversation listing, staff directory lookup and voice-note upload through server-side functions that validate that session token and enforce learner/guardian/recipient scope. Keep service-role credentials server-side only.
- Add database tables, indexes, RLS and audit events for parent conversations/messages and attachments. Explicitly test that one guardian cannot read another learner's messages, and a parent cannot message arbitrary internal accounts outside the active staff directory.
- Add abuse controls: message length limits, voice-note duration/size limits, rate limiting, reporting/blocking workflow and moderation/retention policy.
- Test with synthetic guardian accounts and staff accounts before enabling in production. Do not use real family messages as test data.

### Acceptance checks
1. Photo absent at admission is accepted; all other admission validation still applies.
2. Admin can add a photo later and replace it; the new image appears on staff learner profile and the verified parent portal.
3. Failed upload leaves the existing photo path and file intact.
4. A guardian sees only their linked learner's photo and approved published information.
5. Parent can send text and a voice note to an active staff member or administration.
6. Parent cannot view other learners, staff-only messages, internal directories beyond the intended contact list, or another guardian's conversation.
7. Staff can reply only within permitted conversations; administration can triage issue reports.
8. No video-call or audio-call controls are present in the parent portal.

## Release log

Add one entry for every production release with:
- version and release date;
- Git commit SHA;
- Vercel production deployment ID;
- database migration identifiers;
- test batch and results;
- backup verification reference;
- known limitations and rollback deployment.

No production release is recorded by this document itself. Update this log only after the corresponding production deployment and checks have actually succeeded.


## Parent academic history and fee-gated report cards (requirements added 7 November 2026)

### Full academic history
- The verified parent account must show a chronological academic history for the learner from admission through the current year, covering every year and term for which CORNHILL has records.
- Show the learner's full name and permanent pupil code as the heading for the history.
- Organise results by academic year, term, assessment period and subject. Include Beginning-of-Term, Mid-Term and End-of-Term assessments where recorded; show marks, maximum marks, grades/aggregates/division/position where those values are actually stored or generated for that class level, plus approved teacher comments.
- Include class progression over time, using the learner's class/enrolment history. Make missing terms or years explicit as "No recorded results" rather than inventing marks or implying the learner was absent.
- Show teacher attribution for each subject/assessment wherever the records support it. Prefer the teacher who actually entered/approved that assessment (assessment score attribution such as `entered_by` / assessment creator) and retain historical class-subject teacher assignments with effective dates. Do not display only today's subject teacher as though they taught the learner in earlier years.
- Include a teacher-history timeline grouped by academic year, term, class and subject, showing the teacher's name and role only where historical assignment/assessment records prove the relationship. If historic teacher assignment data was never captured, label it unavailable; do not guess.
- Preserve all historical records when the learner changes class, leaves and is readmitted, or changes teachers. Use stable learner IDs, not names alone.
- The parent view must only include that learner's approved/published academic records. Draft, unapproved or staff-only marks/comments must remain hidden.

### Report-card and End-of-Term results fee rule
- Beginning-of-Term and Mid-Term results may be shown to a verified guardian according to the school's publication settings.
- End-of-Term results and the generated End-of-Term report card must remain unavailable until the learner has fully cleared the required school-fee charges for the relevant term.
- A partially paid or unpaid school-fee balance means the End-of-Term result/report remains locked. Do not reveal the End-of-Term marks, grades, position, comments, report-card PDF or a direct download URL while locked.
- When the finance ledger confirms the relevant term's required school-fee balance is zero (after valid posted payment allocations, bursary adjustments and approved credits), End-of-Term results and the approved report card become available automatically on the next parent request/refresh. No manual staff toggle should be required.
- Fee clearance must be calculated from authoritative term-level learner charges and posted payment allocations, not a stale summary, a browser-calculated balance, or a parent-supplied value. Include the correct bursary amount/adjustment. For boarding learners, use the single inclusive boarding package charge (tuition/fees plus meals) and do not add a duplicate tuition charge.
- Keep other optional/non-school-fee purchases separate unless the school's approved fee policy explicitly includes them in the clearance calculation. Any carried school-fee arrears that are part of the learner's required school-fee account must be included consistently.
- Recheck fee clearance on every server-side request for protected End-of-Term data and report downloads. If a payment is reversed, voided or reallocated and the balance becomes outstanding again, access must lock again.
- Record an audit event for unlock/lock decisions with learner, term, timestamp and decision reason, without exposing private finance data to other guardians.

### Implementation and verification status
- Database structures already include assessment scores, assessments, report-card publication approvals, student class history, fee charges, payment allocations, enrolment-period balances, and score-entry attribution. These are useful source records, but the parent PIN response currently returns published assessments and reports without the requested complete academic-history/teacher timeline and without a term-level fee gate for End-of-Term records.
- Current class-subject teacher assignments represent assignments currently stored in `class_subjects`; they are not by themselves proof of who taught a learner in prior years. Historical assignment records must be retained/added before promising a complete teacher timeline.
- The current parent PIN verification RPC returns learner data but does not establish a revocable authenticated parent session. Secure parent messaging, signed photo delivery and all protected academic-history/report-card reads must be routed through a scoped, expiring server-side parent session before exposing new parent-only data.
- No existing historical marks, report cards or teacher records may be fabricated or overwritten to fill gaps. Backfill only from verifiable existing records and clearly label gaps.
- Required tests include: full-fee payment unlocks End-of-Term results/report; partial payment keeps them locked; no payment keeps them locked; a posted payment allocation unlocks without a manual toggle; a reversed payment re-locks; bursary-adjusted charge clearance is correct; boarding package is not double-counted; parents cannot bypass the gate using direct RPC, API, cached links or report download URLs; Beginning/Mid-Term publication remains independent; guardian A cannot read learner B's history; teacher history is historically accurate or explicitly marked unavailable.

