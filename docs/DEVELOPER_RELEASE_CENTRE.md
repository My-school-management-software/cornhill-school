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
