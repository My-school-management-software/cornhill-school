# V71 — Compact CORNHILL school navigation and advanced-settings layout

Date: 28 November 2026. Request: simplify the extremely long Windows dashboard/navigation and settings screen, shorten left menu labels, add consistent icons, use compact cards and advanced collapsible fields, retain authentic graphs/tables and Android responsive usability.

## Existing Windows source reviewed
- The Director uploaded `CORNHILL-V69-UI-SOURCE-REVIEW-20261128-232504.zip`. Source includes `local-server/public/app.js` 192,584 bytes, SHA-256 `999efb13f6622167a293f7e697ad5173dd8475087228f6910360238817896f60`; and `app.css` 63,314 bytes, SHA-256 `e69e054c806defe3a7b9228bbd405d63bcc3534ed2bee147796d60b2391b69b9`.
- The existing complete app.html has 6 sidebar groups, many long labels, 12 settings categories, and numerous expanded-settings subgroups. The dashboard already has genuine analytics graphs and tabular data: do not add fake data or replace their underlying API calls.
- The screenshots are extremely narrow/tall and show circled overly long sections: this was a presentation/layout request, not a request for school-record mutations.

## V71 local-only patch prepared
User-downloadable ZIP: `CORNHILL-V71-COMPACT-DASHBOARD-AND-SETTINGS-UI.zip` (provided via the ChatGPT artifact link). V71 only changes *two files* (`app.js` and `app.css`) using append-only presentation code, with the exact reviewed earlier source byte-for-byte retained as prefix.
- Compact left menu: short visible labels with full accessible names/title tooltips; inline vector icons; collapsible navigation groups and 208px target sidebar width. No permission bypass.
- The Parent Access & Guardian PINs link is redirected to the V68 dedicated `/leadership?office=guardian` view if the old anchor link is still present.
- For narrow Android-size screens, compact permitted-destinations select instead of overcrowded scroll navigation.
- Settings: 12 compact icon category cards; subgroup “Show details”/“Hide details” progressive disclosure with aria-expanded; control forms and IDs remain exactly as installed.
- Reduced spacings, readable compact summary cards, existing charts and tables retained; overflow-safe tables/forms.
- Original app routing, existing authentication, role policies, live/finance APIs, V65 guardian/teacher materials, payment services and database tables are **not changed**.
- Installer: Windows PowerShell 5.1 BOM-safe script; SHA-256 validation of the package and the installed V69 source; backup/rollback; Node JS syntax and eight source contracts; aborts without overwrite on conflict. Existing machine installation not verified yet.
- Browser acceptance still required with Director login and authorized staff: desktop menu, all Settings, phone-width, parents-only authorization, browser navigation and no regressions. A source-only ZIP is not a local EXE/APK.

## Related outstanding requirements
- V70 guardian optional self PIN change exists in a **draft GitHub branch only**, Director sees date and actor metadata rather than a secret PIN. No live deployment.
- Complete learner register edit workflows, advanced scholastic requirements and Nursery teacher per-learner custody ledger are still pending.
- The Windows local installer and Android APK remain unpublished, and the five formal full-system release blockers remain **0/5 independently cleared**.
