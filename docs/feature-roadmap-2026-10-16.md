# Real Estate Management Feature Roadmap

**Updated:** 2026-10-19. This revision replaces the original future-work baseline with the current code baseline, local acceptance evidence, and release priorities.

**Sources:** [System guide](https://docs.google.com/document/d/1yDqmKlsxEOQnLDDy0pO3GjFLjLmH08sUNASpuYDchoU/edit), [feature matrix and Delivery Plan](https://docs.google.com/spreadsheets/d/1-EG-5CiSopA7r_Z-xSXFlAcomM8ag0sievccWr1SH5U/edit), and the repository review on 2026-10-17.

**Goal:** Verify the existing property management workflows for a controlled release, preserve role and property boundaries, and then select one useful product improvement.

**Detailed task plan:** [Release readiness implementation plan](release-readiness-plan-2026-10-17.md).

## Status definitions

- **Implemented in code:** Models, APIs, or UI exist; this does not imply staging acceptance or production deployment.
- **Locally verified:** A named check passed in a local environment, with a recorded date.
- **Staging accepted:** Representative allowed and forbidden workflows passed against a non-production deployment.
- **Production verified:** Migrations, configuration, and actual deployed behavior have supporting evidence.
- **Proposed:** Future work requiring a bounded scope and acceptance criteria.

## Current baseline

The Django API and React/Vite frontend support Admin, Owner, Property Manager, Agent, and Tenant roles. The following capabilities are implemented in code; staging and production acceptance remain unverified by this review.

| Area | Existing capability | Remaining release work |
| --- | --- | --- |
| Property and access management | Properties/units; Owner onboarding; Admin-recorded staff assignments; role/property scope; separate Manager authorities | Five-role staging acceptance and documentation reconciliation |
| Prospects and applications | Inquiries, viewings, activity history, follow-up queues; application decision-rule snapshots; rent-change proposals | Verify migration state, scoped queues, decision authority, and application-to-lease journey |
| Monthly billing | Invoice generation, BillingRun persistence, staff run history, failure records and Admin in-app alerts; manual command and scheduled endpoint | Verify deployed cron, migrations, recovery, PostgreSQL concurrency, and detection of missing scheduled invocations |
| Payments | Submitted/direct payment records, verification/rejection/reversal, split payments, balances, verified-payment acknowledgment PDFs | Reconcile financial scenarios and test access/download scope |
| Lease renewals and reminders | Owner/Manager renewal proposals, Owner decisions, successor preparation after the original term ends; deduplicated 60/30/7-day in-app reminders | Accept the full lifecycle, boundary dates, activation rules, and deployed reminder execution |
| Maintenance | Tenant requests; staff assignment; urgency; vendor details; estimates/actual costs; per-job Owner approval and history | Validate approval gates, rejected-estimate revision, private fields, and manual expense handoff |
| Expenses and Owner statements | Staff expense entry; Owner approval/rejection/reversal; calendar-month verified receipts minus approved expenses | Reconcile amounts, dates, reversals, scope, and duplicate-entry risks |
| Inspections and turnover | Versioned move-in/move-out inspections, evidence references, Tenant acknowledgement, Owner deposit decisions, turnover completion | Verify deposit limits and availability gates through the full move-out flow |
| Exports and notifications | Scoped invoice/payment/lease/maintenance CSV exports capped at 10,000 rows; role-targeted in-app notifications | Validate filters, safe CSV values, recipient scope, and mobile navigation |

`vercel.json` configures monthly billing and daily lease reminders. Repository configuration alone does not establish that either job runs in production. Database migration state was not inspected.

## Known documentation and operational gaps

- Reconciled on 2026-10-17: ordinary application-based lease preparation is limited to Admins and assigned Managers. Owner renewal-successor preparation is a separate action. The Sheet also now reflects Tenant access to all four scoped exports and lease-controlled occupancy assignment.
- Application settings use UTC; confirm the intended business timezone and scheduler timing. The Google Sheet's Singapore timezone does not configure the application.
- Billing failures create records and in-app alerts, but an independent detector for a scheduler that never invokes the app was not found in the reviewed code. Reminder operational run history is also less complete than billing history.
- A new quality workflow runs backend checks/tests, frontend lint/build, and existing browser checks alongside the dependency audit. Its actual GitHub execution remains unverified until pushed and run.
- Browser smoke checks include role layouts and a Tenant/Admin maintenance scenario. They do not prove the full application, lease, renewal, settlement, and statement journey.
- README database SSL guidance now matches DB_SSLMODE configuration. Installed Django metadata permits Python 3.12; the Node 22 minimum is 22.13 because of ESLint. The local baseline uses Python 3.12 and Node 22.14.

## Delivery order

| Phase | Deliverable | Priority | Depends on |
| --- | --- | --- | --- |
| 0 | Reconcile documentation and delivery states — locally complete | P1 | Current role/API review |
| 1 | Reproducible local checks and quality CI — partially verified | P1 | Compatible Python/Node runtimes and installed dependencies |
| 2 | Role permissions and rental journey — local API and browser journey verified; staging pending | P1 | Passing baseline and isolated test accounts/data |
| 3 | Verified migrations, deployment, and scheduled operations | P1 | Staging access, configuration, backup/recovery procedure |
| 4 | Lifecycle and financial reconciliation acceptance | P2 | Staged leases, invoices, and verified authority rules |
| 5 | One selected product improvement | P3 | Release gates and pilot feedback |

Phases 2 and 3 can progress independently after the baseline is established. All release gates must pass before claiming production readiness.

## Phase 0 — Reconcile documentation

Update the guide, matrix, README, and delivery tracker to distinguish existing code from verified deployment. Correct ordinary lease-preparation wording and operational setup instructions. Keep Owner decisions distinct from Admin access, and preserve separate pricing, activation, and termination authorities.

**Acceptance:** Role descriptions agree with API actions; each delivery status includes its evidence, environment, and date. Policy ambiguities are recorded rather than resolved by silently broadening permissions.

## Phase 1 — Establish the automated baseline

Create an isolated backend environment compatible with the pinned requirements. Run Django system checks, migration drift checks, and the full backend suite. Run frontend lint/build and existing browser checks. Add quality CI alongside dependency audits. Fix reproducible failures in focused changes with regression coverage.

**Acceptance:** A clean checkout can reproduce the documented checks, and CI enforces them. PostgreSQL locking/concurrency checks supplement the SQLite test baseline.

## Phase 2 — Verify five roles and the rental journey

Use Admin plus two distinct sets of Owners, Managers, Agents, and Tenants, with assigned/unrelated properties, unitless properties, and both application decision rules. Exercise registration → assignment → inquiry/viewing → application → authorized decision → Admin-created matching Tenant account → lease preparation → authorized activation.

Test forbidden actions directly through the API, including unrelated record IDs. Verify lists, details, mutations, exports, and notifications. Test rule snapshots, applicant email mismatch, and revoked Manager authority. Add representative desktop/mobile browser coverage.

**Acceptance:** Allowed actions succeed; forbidden actions fail without leaking unrelated records; required Owner instructions and references are retained.

**Progress (2026-10-19, local only):** Six focused Django API tests passed across the two rental lifecycle paths and role/data isolation between two separate property portfolios. A synthetic browser journey also passed from Agent viewing/application through Manager review, Owner decision, Admin-created matching Tenant, pending lease preparation, Owner activation, and the Tenant's active lease view at 320px. Agents had no decision controls, and Managers could not make an Owner-reserved decision. See [local acceptance record](acceptance/2026-10-17-local-baseline.md). Staging acceptance and the saved-rule/revoked-authority edge cases remain open.

## Phase 3 — Verify deployment and scheduled operations

Inventory all migrations with showmigrations and migrate --plan; do not assume only the migration named in the Sheet is pending. Back up staging, apply migrations, verify data preservation, and rehearse restore/recovery. Verify production configuration without exposing secret values, including database SSL, Redis, hosts/origins, secure sessions/CSRF, and CRON_SECRET.

Confirm business timezone and actual deployed cron logs. Test authenticated endpoints, repeated/concurrent billing, failed-run recording, explicit-month recovery, reminder deduplication, and correct recipients. Add independent monitoring for missing scheduled executions with an operator and recovery action. Run Django deployment checks with target configuration.

**Acceptance:** Migration and deployment evidence exists; eligible leases receive one invoice per month; retries are safe; failures and absent invocations are detectable; deployed reminder execution is evidenced.

## Phase 4 — Validate lifecycle and money reconciliation

Verify renewal proposals and Owner decisions, preparation after expiry, signed-copy references, and successor activation under current authority rules. Test declined renewal behavior and record whether a replacement-proposal flow is needed before designing one.

Exercise maintenance estimate approval/rejection and revision, actual costs, private-field visibility, and separate expense entry. Reconcile split payments, rejected/reversed payments, expense reversals, late fees, and calendar-month statement totals. Verify payment acknowledgment access.

Complete move-out, versioned inspection, Tenant acknowledgement, Owner deposit decision, unresolved-maintenance blocking, and turnover. Check both units and unitless properties.

**Acceptance:** Historical records remain intact; deposit deductions stay within the deposit; statements reconcile to source rows; the home stays unavailable until required turnover gates pass. Representative browser journeys pass on staging.

## Phase 5 — Choose the next improvement

Select one item after pilot feedback; write its own implementation spec and acceptance criteria before coding.

| Candidate | Purpose | Decisions needed |
| --- | --- | --- |
| Additional scoped CSV exports | Extend reporting to expenses, applications, or prospects | Resources, columns, roles, filters, caps |
| Maintenance-to-expense assistance | Reduce duplicate entry while preserving Owner approval | Linked draft creation and duplicate prevention |
| Private document uploads | Store lease, receipt, and inspection evidence | Provider, access, retention, file limits |
| Email reminders | Reach users outside the in-app inbox | Provider, preferences, delivery/retry policy |
| Formal notice tracking | Extend lease lifecycle records | Approved notice policy, dates, responsible roles |
| Online payments or electronic signing | Reduce external manual steps | Provider, callbacks, reconciliation, authority and recovery |

**Recommendation:** Start with expense CSV exports if reporting is the main pilot need, or linked expense drafts if repeated maintenance entry is the main problem. A configurable report builder, bulk changes, chat, uploads, online payments, and electronic signing remain future scope.

## Release gate and current evidence

For each affected workflow, require automated checks, direct API permission checks, desktop/mobile staging acceptance, migration verification, and recovery documentation. Record production evidence separately. Update the delivery tracker only after the corresponding checks pass.

Review evidence through 2026-10-19:

- Frontend lint passed.
- Frontend production build passed.
- Django system checks and migration drift checks passed locally; two test-isolation regressions passed. The full backend suite passed: 108 tests ran, 104 passed and 4 were skipped. The focused role and rental lifecycle suite passed 6 tests.
- Frontend lint/build passed. Browser security/UI checks passed, including role layouts and Tenant/Admin maintenance. The synthetic browser rental journey passed across all five roles at mobile width; renewal/move-out browser acceptance remains open.
- Staging acceptance, database migration application, deployment inspection, and production cron execution were not performed.

The next actionable slices are to verify saved application-rule snapshots and revoked authority, then repeat the rental journey on staging when access is available. Do not claim staging or production readiness from the local results.
