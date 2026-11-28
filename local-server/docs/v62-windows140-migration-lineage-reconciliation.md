# V62 — Windows 140-migration lineage diverges from GitHub V50 candidate

**Verified 28 November 2026 from the local V61 read-only audit.** No working-school data, cloud data, payments or migrations were changed by this investigation.

## Important finding

The local Windows database has **140 applied migrations** and the matching **140 source files**. V59 independently verified 140/140 file checksums after restoring the exact two original historical files. The local migration names, however, diverge from this GitHub V50 candidate at version **096**, and the candidate currently has only **100 migrations**.

| Version | Already applied to local `cornhill_local` | Different candidate migration (not approved on working DB) |
| --- | --- | --- |
| 096 | `096_local_data_transfer_provenance` | `096_local_individual_nursery_material_receipts` |
| 097 | `097_local_enrolment_academic_period_links` | `097_local_nursery_material_movement_accountability` |
| 098 | `098_local_transfer_academic_staff_models` | `098_local_annual_school_fees_income_b_prices` |
| 099 | `099_local_finance_transfer_history` | `099_local_income_group_receipt_breakdown` |
| 100 | `100_local_transfer_history_vault` | `100_local_finance_account_income_classification` |
| 101–140 | Installed on the Windows school database | Not present in this older feature-branch lineage |

Do **not** use the V50 candidate's 096–100 SQL files to update the school's 140-migration database. This is not merely a missing migration; **the migration version numbers are reused for unrelated functions**. The right development path is to reconcile the installed source and introduce any missing feature as a newly numbered migration after the *existing* 140, with independent backup, isolated PostgreSQL 17 rehearsal, security review and explicit Director approval.

## Existing local school data (read-only)

- 484 active learners, 0 missing active enrolments, 0 with multiple active enrolments, 0 without class.
- 169 assessments, 1,991 mark rows; 0 local published report-card snapshots and 0 local progression events. These zeros describe the inspected local tables, **not necessarily hosted history**.
- Only 2026 academic year and Term 3 are configured, both marked `Planned`; 2026 year ends 04/12/2026. No following academic year's Term 1 exists in local DB.
- School material tables **already** include `material_definitions`, `material_editions`, `material_class_assignments`, `material_deliveries`, `material_clearances`, `material_handover_offers`, `material_handover_acceptances`. The candidate's separate `nursery_material_receipts` and `nursery_material_movements` tables are absent in the installed database; blindly adding duplicate workflows would risk contradictory inventory.
- 9 local posted payments and 9 receipts; historical comparison found 8 cloud posted payments with **no verified receipt identity matches**. Finance sync must remain disabled until independently reconciled.

## Changes made in GitHub source branch

1. Added `assertMigrationManifestCompatible` to the shared migration module and an additional read-only compatibility check in `scripts/migrate.mjs` **before any schema DDL**. It refuses source downgrades, a same-number different-name migration, duplicate ledger rows and differing applied source checksums.
2. Added synthetic regression tests for the actual collision at version 096 and the old-100-versus-new-140 lineage. No code enables a live DB migration.
3. Prepared `scripts/v62-local-materials-source-review.ps1`: a source-only review ZIP of the installed materials/inventory code, school screen and relevant inventory SQL, without database, PIN, student, receipt, backup or credential exports. User reviews ZIP contents before sharing.
4. Do not merge/auto-publish or install the candidate on the working machine until the branch is reconciled with the actual 140-migration source lineage.

## Next engineering development

Review the installed materials module and inventory migration 116 from the V62 safe source pack. **Reuse/extend existing material ledger and learner delivery records**, adding the Director's required per-Nursery-learner collection and custody actions, instead of an incompatible parallel receipt system. Add complete 2027 year setup and approved individual advancement on the actual local branch, backed by snapshot/receipt regression. Only then perform controlled clone acceptance and manual school approval.

**Formal full-system release gates independently cleared: 0/5.** 100% local checksum verification is a limited integrity check, not overall system completion.
