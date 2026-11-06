# CORNHILL class progression and offline review — 2026-11-07

Branch: `feature/cornhill-v3-foundation`

## Test result

- **107/107 static source assertions passed** against the current `index.html`.
  - 32 class-promotion and academic-calendar UI checks.
  - 75 offline attendance, teacher assessment draft sync, local form autosave and academic-calendar checks.
- **14/14 live Supabase metadata/function assertions passed** for class-promotion security and transaction structure.
- Read-only database counts were checked. No learner, enrolment, class-history, academic-year, term, finance or attendance rows were inserted, updated or deleted.

These are source and database-metadata checks, not browser runtime or real-device tests.

## Class promotion review

The current UI:
- Shows a destination class and required effective date.
- Limits the promotion form and class-history display to administrators.
- Uses local form autosave and draft restoration.
- Calls the dedicated `promote_learner` RPC with learner, destination, effective date and optional notes.
- Refreshes the learner register and profile after success.
- Displays previous class, new class, date and notes from `student_class_history`.
- Separates the read-only progression review list from actual saved class changes.

The live function:
- Is SECURITY INVOKER, not SECURITY DEFINER.
- Denies anonymous execution; authenticated execution is guarded by `is_school_admin()`.
- Requires an effective date and an existing destination class.
- Locks the learner row, rejects a same-class move, inserts class history and updates the learner's current class in the same function transaction.
- Returns the inserted history ID.

Live metadata checks also confirmed RLS on `student_class_history`, administrator-only history reading, and administrator-only history insertion with `changed_by = auth.uid()`.

## Offline boundaries reviewed

- Staff attendance offline storage is deliberately limited to correction requests; it does not capture offline clock-in/out events.
- Correction requests are owner-scoped, use unique IDs, sync only when online, check the authenticated staff owner, and remain queued after failures.
- Teacher mark drafts are teacher-only for synchronisation, require an online authenticated identity, compare the original saved score/comment before updating, retain conflicts, and are removed only after a successful write.
- Form autosave is owner-scoped, excludes password and file fields, restores only when the form has not already been filled, and does not auto-submit.
- Finance/payment posting is explicitly excluded from offline queues.
- Academic year and term creation are administrator-only and blocked while offline; date order, year containment and overlapping open terms are checked in the UI.

## Live data snapshot

| Object | Rows |
|---|---:|
| School classes | 10 |
| Learners | 2 |
| Learner enrolment periods | 2 |
| Class history | 0 |
| Academic years | 0 |
| Academic terms | 0 |

Both active enrolment periods currently match their learner's current class; no active period is missing a class. There are no class-history rows yet, so a real promotion transaction has not been exercised. There are also no academic-year or term rows, so academic-year rollover and term workflows remain untested with configured school dates.

## Still pending

- Real administrator account test of a promotion using an approved test learner and test class, followed by verification of the history and unchanged permanent learner code.
- Configure CORNHILL's actual academic-year and term dates before testing year/term activation, closure and rollover.
- Browser runtime tests for IndexedDB persistence, offline/reconnect, draft conflict behaviour and cross-account isolation.
- Android and Windows 10/11 tests.
- Real attendance correction approval, clock-in/out and fingerprint-device tests.
- Backup validation and restore drill, payment allocation and receipt printing, parent OTP, communications provider delivery, and fresh Vercel deployment checks.

## Safety and cost decision

Supabase Pro-only leaked-password protection remains intentionally out of scope. No paid upgrade was enabled. The free CORNHILL password checks remain an app-level supplement, not a claim of global server-side breach enforcement.
