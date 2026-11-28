# V68 — Fix V67 Windows package integrity and separate Guardian Access

Date: 28 November 2026. This is a preservation/acceptance note, not a deployed GitHub release.

## School Director's correction
Parent & Guardian Access, guardian PIN issuance, approval and related consent/payment-notification review **must not appear on the Leadership & Staff page**. The Director expects them under a dedicated **Parent Access & Guardian PINs** entry. Other unrelated sections must similarly remain in their own workspaces.

## V67 installation failure observed
The Director installed V66 successfully, then ran V67. V67 stopped at **`V67 package integrity check failed. No files changed.`**, before writing. V67's PowerShell installer stored a marker containing a UTF-8 em dash without a BOM; Windows PowerShell 5.1 decodes such scripts as a legacy code page and its script literal can differ from the UTF-8 snippet read using .NET `ReadAllText`. This explains the otherwise valid ZIP payload checksum/markers. **Do not bypass the verification check.** Distribute a corrected Unicode/BOM-safe installer with integrity tests.

## V68 staged local ZIP delivered in ChatGPT
Local artifact **`CORNHILL-V68-ACADEMICS-AND-PARENT-GUARDIAN-OFFICE-REPAIR.zip`**:
1. Supplies the existing V67 class-materials JS/CSS snippets, replacing only uniquely marked V66 blocks and never overwriting other Academics changes.
2. Uses a UTF-8 BOM and a marker constructed with `[char]0x2014` in the Windows PowerShell installer.
3. Appends a separate **visual navigation** router to the existing Leadership JS and CSS. This preserves local-only code including Guardian SMS consent handlers and original backend guardian authorization. In standard `/leadership` mode, Parent/Guardian panels are hidden. At `/leadership?office=guardian`, unrelated staff panels are hidden and the window is labeled Parent Access & Guardian PINs.
4. Adds a separate Parent Access & Guardian PINs module card in the existing `/app` hub with a truthful staff-authorization note.
5. Runs the preserved 11 V67 tests plus 3 V68 routing tests and checks updated JS syntax. Creates a five-file rollback backup before changes. Does not apply migrations, post finance or alter school data. This is a **dedicated view on the existing authenticated route**, not yet a standalone backend service or new permission boundary.

## Acceptance still required
- Director tests `https://localhost:4174/leadership` and confirms Guardian Access/PINs and SMS consent no longer appear there.
- Director visits `https://localhost:4174/leadership?office=guardian` (also linked from `/app`) and confirms Parent Access & Guardian PINs appear, without staff directory, incident review or payroll sections.
- Existing staff role authorisation must remain mandatory for PIN issuance, and guardian data must not appear in unauthorised accounts.
- Academics teacher class materials read-only view must load and respect assigned classes on real teacher logins.
- School desktop sidebar/nav remains independently maintained; future global navigation registration may be needed if its menu does not use the `/app` hub.
- 0/5 formal release blockers cleared, no production/native package publication.
