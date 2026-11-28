# CORNHILL V59 — Applied migration checksum forensic findings (28 Nov 2026)

**Status:** Exact historical source versions recovered; local source restoration package prepared separately for the Windows machine. **NOT installed** in the working computer by GitHub. Do not merge, run migrations or change the migration ledger based on this note alone.

The V58 read-only local PostgreSQL report confirmed:

- `cornhill_local`: 140 recorded applied migrations, 140 SQL files present, no missing or pending migrations.
- 138 migration file SHA256 values matched the ledger; exactly two differed.
- Both mismatching current files were clean in the local Git worktree.
- 484 local learners with 484 distinct learner codes, 9 local Posted payments and 9 receipt records. Cloud comparison remains 8 Posted payments with no verified matching identities; finance sync is unsafe.

## Reconstructed exact historical hashes

Subsequent research examined the reachable GitHub commit history and SHA256 hashes of Windows **CRLF** representations, which V58 did not attempt for historical Git blobs. Both original checksums matched archived commits **exactly**, while current disk hashes matched the newer historical source in CRLF form.

| SQL migration | Original applied ledger SHA256 | Historical Git commit | Current local disk SHA256 |
| --- | --- | --- | --- |
| `004_local_auth_runtime_role.sql` | `f42c39ea84e57ab726a462b158b2ec879e62e331f52e25c911c3d190789a02e1` | `7be2733da0fe` + Windows CRLF | `11e644deae1e5b7c74329f3072155b6180eac9b17de7f9a483734a4a1ce924d5` |
| `010_local_finance_payment_posting.sql` | `cf43a4d218ea910480527c93efa8b87f4cec0c2bd3c4ac24281edd18af6976fa` | `f25b5a518835` + Windows CRLF | `dc283fcacaa7d0d65674b7245b2a47ca58275f0cdebb21d0e5b26cdf0795422f` |

The newer CRLF current disk files match source commit `e3127dea5ecf`. This is a **historical migration-file edit after application**, not evidence that 140 migrations failed or that learner/finance records are corrupted.

## Intended repair scope

The V59 Windows package `CORNHILL-V59-SAFE-SOURCE-HISTORY-RESTORE.zip` is a source-only repair with independent read-only ledger verification. It extracts these two **original historical SQL file versions** from local Git history (no use of remote credentials or download during installation), converts to CRLF, verifies both exact ledger SHA256 hashes before writing, backs up the two current local SQL files, restores the historical versions on the **working PC only**, then checks that all 140 migration disk hashes equal the database ledger in a PostgreSQL `REPEATABLE READ READ ONLY` transaction. If the verification fails, the installer reverts its source changes. It does not change the database, ledger, receipts, parents, financial postings, Guardian V52 or Academics V56.

**Important:** Source-only restoration on this machine does *not* automatically make fresh installation from the new GitHub V50 SQL files compatible with the historic 140-row ledger. Any substantive change intended by the newer edits should be carried forward by a **new additive, independently clone-tested migration**, not by rewriting existing applied migration checksums. Do not reset Git, run blind `npm run db:migrate`, overwrite checked-in history, or update the migration ledger to conceal the mismatch.

**Release readiness remains blocked (0/5 independently cleared).** Validate the Windows V59 result and continue full acceptance, backup restoration and finance identity reconciliation before any live database change.
