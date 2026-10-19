# Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the existing five-role property management workflows are ready for a controlled release, then choose the next feature from demonstrated operational needs.

**Architecture:** Retain the React/Vite frontend, Django REST API, session authentication, and PostgreSQL database. Validate existing workflows before extending them. Treat code implementation, automated verification, staging acceptance, and production verification as separate delivery states.

**Tech Stack:** React 19, Vite, React Bootstrap, Django REST Framework, PostgreSQL, Playwright, Vercel configuration, Redis-backed production login throttling.

**Spec:** [System guide](https://docs.google.com/document/d/1yDqmKlsxEOQnLDDy0pO3GjFLjLmH08sUNASpuYDchoU/edit) and [feature matrix and Delivery Plan](https://docs.google.com/spreadsheets/d/1-EG-5CiSopA7r_Z-xSXFlAcomM8ag0sievccWr1SH5U/edit), read 2026-10-17. This is a delivery plan; optional new features require their own approved scope and implementation plan.

## Global constraints

- Preserve role, ownership, assignment, and tenancy boundaries at the API as well as in the UI.
- Owner decision authority is distinct from Admin software access. Preserve required Owner instructions and references.
- Manager application decisions use the rule saved at application submission. Pricing, lease activation, and termination authorities remain separate.
- Only verified payments count as collected rent. Maintenance costs require separate expense entry; only approved expenses count in Owner statements.
- Signatures, receipt evidence, and inspection evidence remain external references. Payment collection, file uploads, email/SMS, and chat are outside current scope.
- Invoice due days remain 1–28; CSV exports remain scoped and capped at 10,000 rows.
- Do not mark cloud features deployed based only on repository configuration.

## Review focus

1. Cross-property requests, exports, and notifications must not expose unrelated records; covered in Task 3.
2. Repeated or concurrent billing must not double-charge a lease; covered in Task 4 on PostgreSQL.
3. Renewal at an end-date boundary must preserve reservation and activation authority; covered in Task 5.
4. Pending/rejected maintenance approval or incomplete turnover must not allow work/availability to advance; covered in Task 5.
5. Partial, rejected, and reversed payments or expenses must reconcile correctly; covered in Task 5.

## Scan findings and evidence limits

The application already contains property/unit management, prospects and follow-ups, application decisions, rent proposals, lease authority, billing history, payment verification/reversal, payment acknowledgment PDFs, maintenance approvals, renewals/reminders, inspections, deposit settlements, turnover, expenses/statements, CSV exports, and in-app notifications. Presence in code is not proof every scenario works.

- The original `docs/feature-roadmap-2026-10-16.md` baseline described many implemented workflows as absent. It has now been reconciled in place; retain its filename for existing links. This section records the original scan findings; consult the roadmap and dated acceptance record for subsequent verification.
- The Google Sheet's ordinary lease row says Owner or Manager may prepare application-based leases. `backend/contracts/views.py:get_permissions` restricts ordinary create/update to Admin and Manager. The guide and README align more closely with this API. Owner renewal-successor preparation is a separate supported action. Resolve the wording before changing permissions.
- `vercel.json` configures monthly billing and daily lease reminders. `backend/core/settings.py` uses UTC. Confirm the intended business timezone and schedule before release; the Sheet's Singapore timezone is not application configuration.
- Billing failure records and Admin in-app alerts exist in `backend/billing/services.py`. No independent detector for a scheduler that never invokes the app was found in the reviewed code. Reminder deduplication exists, but no billing-style reminder run history was found.
- `.github/workflows/security.yml` audits dependencies. It does not run the backend regression suite, frontend lint/build, or browser acceptance checks.
- `frontend/scripts/browser-smoke.cjs` includes role layout checks and a Tenant/Admin maintenance scenario. It does not establish complete end-to-end acceptance for applications, lease activation, renewal, settlement, and statements.
- README setup text says hosted Supabase SSL follows the hostname; settings instead use `DB_SSLMODE`, defaulting to require outside debug. Reconcile this operational instruction.

Verification during this scan: `npm run lint` passed; `npm run build` passed. Backend tests were attempted but could not start: the default Python alias was inaccessible, and the bundled Python had no Django installed. No database migrations were applied, live browser acceptance run, or production deployment inspected. Google documents were read without edits; no application code was changed.

## Task 1: Reconcile the delivery baseline — P1

**Files:** `docs/feature-roadmap-2026-10-16.md`, `README.md`; Google feature matrix and Delivery Plan after review.

**Interfaces:** Consumes the current API permissions and workflow implementations; produces one agreed role matrix and delivery tracker.

- [ ] Replace stale future-work claims with code-present, locally verified, staging accepted, or production verified states.
- [ ] Correct ordinary lease-preparation wording to Admin/assigned Manager unless a deliberate policy change is approved; describe Owner successor preparation separately.
- [ ] Correct runtime, database SSL, migration, scheduler, and timezone setup instructions against actual configuration.
- [ ] Add evidence/date fields to the delivery tracker so an Implemented label does not imply deployment verification.
- [ ] Check every matrix permission against its API action, including list/detail/export and special workflow actions. Record policy ambiguities as decisions rather than silently broadening access.

**Done when:** Documentation and API rules agree, and every release claim has an explicit verification state.

## Task 2: Establish a reproducible automated baseline — P1

**Progress (2026-10-19, local):** Python 3.12 environment and pinned backend dependencies are in place; Django checks and migration drift checks passed. The full backend suite passed (108 tests: 104 passed, 4 skipped); frontend lint/build, browser security/UI smoke, the synthetic five-role rental journey, and two test-isolation regressions passed. Quality CI is configured but has not run on GitHub. Keep this task open until CI execution is recorded.

**Files:** `backend/requirements.txt`, `backend/core/test_settings.py`, `frontend/package.json`, `frontend/scripts/browser-smoke.cjs`, new `.github/workflows/quality.yml`, `README.md`.

**Interfaces:** Consumes pinned dependencies and existing tests; produces repeatable checks for subsequent fixes. Verify the Python version supported by the pinned Django release rather than copying the audit workflow's Python 3.12 automatically.

- [x] Create an isolated backend environment and install the pinned requirements. Record the supported Python and Node versions in README and CI.
- [x] Run `python manage.py check --settings=core.test_settings`, `python manage.py makemigrations --check --dry-run --settings=core.test_settings`, and `python manage.py test --settings=core.test_settings --noinput` from `backend`.
- [x] Run `npm ci`, `npm run lint`, `npm run build`, `npm run test:browser`, and `npm run test:ui` from `frontend` with the configured Python executable and browser; the new focused `npm run test:rental` journey also passes.
- [x] Fix reproducible failures as separate changes, each with a failing regression check before the fix.
- [x] Add CI jobs for backend checks/tests and frontend lint/build. Run browser smoke with an explicitly installed browser. Keep the existing dependency audit workflow.

**Done when:** A clean checkout can pass the documented checks and CI enforces them. SQLite tests remain a fast baseline; they do not prove PostgreSQL locking behavior.

## Task 3: Prove five-role access and the rental journey — P1

**Progress (2026-10-19, local API and browser):** Six focused API tests passed across existing-account/new-applicant journeys and two-world role isolation. The new synthetic browser journey passed Agent viewing and application, Manager review, Owner decision, Admin Tenant creation, Manager lease preparation, Owner activation, and Tenant active-lease access at 320px. Agent decision controls and Manager approval of an Owner-reserved application were denied in the UI. Saved-rule/revoked-authority edge cases and staging acceptance remain open. See [local acceptance record](acceptance/2026-10-17-local-baseline.md).

**Files:** `backend/properties/tests.py`, `backend/contracts/tests.py`, `backend/users/test_security.py`, `backend/core/test_csv_exports.py`, `frontend/scripts/browser-smoke.cjs`; new staging acceptance record under `docs/acceptance/`.

**Interfaces:** Consumes the agreed role matrix; produces reproducible fixtures and results for permitted/forbidden actions.

- [ ] Seed non-production data with Admin plus two distinct Owners, Managers, Agents, and Tenants. Include assigned and unrelated properties, properties with and without units, and both application decision rules. Use generated test credentials.
- [ ] Exercise property registration → Admin staff assignment → inquiry/viewing → application → correct decision-maker → Admin-created matching Tenant account → pending lease → authorized activation.
- [ ] Verify Agents cannot decide applications or read lease/payment financial records; Managers cannot create properties or Tenant users; unrelated Owners/Managers/Tenants cannot access another property's records by direct IDs.
- [ ] Verify changing a property's application rule does not change an existing application's saved rule. Test applicant/Tenant email mismatch and revoked Manager authority before activation.
- [ ] Assert role boundaries on list, detail, mutations, notifications, and CSV downloads, including direct API calls when the UI hides an action.
- [x] Add and run browser acceptance for the core journey at mobile size; retain the existing layout checks. Desktop rental acceptance and staging rerun remain open.

**Done when:** Allowed actions succeed, forbidden actions fail without data leakage, and the main rental journey passes on staging.

## Task 4: Verify deployment, migrations, and scheduled operations — P1

**Files:** `vercel.json`, `backend/core/settings.py`, `backend/billing/services.py`, `backend/billing/test_billing_runs.py`, `backend/contracts/reminders.py`, `backend/contracts/test_renewals.py`, `README.md`; new `docs/operations/release-checklist.md`.

**Interfaces:** Consumes a passing baseline and staging environment; produces deployment evidence and a recovery runbook.

- [ ] Inventory all unapplied migrations with `showmigrations` and `migrate --plan` against staging. Review all apps, including properties 0011, contracts 0007, billing 0005/0006, maintenance 0003, and users 0005; do not assume only the migration named in the Sheet is pending.
- [ ] Back up the staging database, apply migrations, verify data preservation, and rehearse a restore. Establish the production backup/recovery procedure before release.
- [ ] Verify production secret/configuration presence without printing values: Django secret, hosts/origins, database SSL, Redis, and CRON_SECRET. Confirm same-origin session login and CSRF changes over HTTPS.
- [ ] Confirm business timezone and expected schedule. Invoke both authenticated scheduler endpoints on staging; missing/invalid credentials must fail.
- [ ] On PostgreSQL, run repeated and concurrent billing for an eligible lease/month. Assert one invoice, correct due date/rent, excluded pending/ended leases, and scoped visibility.
- [ ] Force a controlled billing failure on staging; assert persisted failure and Admin notification. Verify recovery for an explicit missed month with `generate_monthly_invoices --month YYYY-MM`.
- [ ] Test reminder milestones and repeat runs; recipients must be the relevant Owner, Manager, and Tenant. Verify actual deployed scheduler logs for both jobs.
- [ ] Add an independent expected-run check for missing billing/reminder executions, with a named operator and recovery action. Specify a failing simulated missed-run check before implementing the selected monitoring mechanism. Reminder operational history may be added if provider logs are insufficient.
- [ ] Run `python manage.py check --deploy` with deployment configuration and resolve applicable findings. Record migration, scheduler, health, and rollback evidence before production sign-off.

**Done when:** Deployment and scheduled jobs are evidenced in the target environment, retries are safe, and an absent invocation can be detected independently of the failed job.

## Task 5: Validate lifecycle and financial reconciliation — P2

**Files:** `backend/contracts/test_renewals.py`, `backend/contracts/test_move_out.py`, `backend/maintenance/test_work_orders.py`, `backend/billing/test_payment_workflow.py`, `backend/billing/test_expenses.py`; related React workflow components if defects are found.

**Interfaces:** Consumes staged leases/invoices and verified authority rules; produces acceptance evidence for the existing advanced workflows.

- [ ] Test Manager renewal → Owner approval/rejection → successor preparation after the old term ends → external signed reference → authorized activation. Confirm a manually recorded successor follows the current manual-lease activation restrictions.
- [ ] Test rejected renewal and expiry boundaries. Investigate whether a declined proposal needs a new proposal path; the current service permits only one renewal record per original lease. Treat changes as a separate policy decision.
- [ ] Test maintenance approval pending/rejected/approved, estimate revision, actual cost, private-field visibility, and tenant-visible status history. Assert work cannot advance while required approval is pending.
- [ ] Record the maintenance cost separately as an expense; approve it as Owner. Assert it enters the correct calendar-month statement once, with no automatic duplicate expense.
- [ ] Reconcile split payments, verification, rejection, reversal, late fees, and expense reversal against balances and monthly statements. Assert acknowledgment download is restricted to verified payments and the correct role scope.
- [ ] Test move-out → versioned inspection → Tenant acknowledgement → deposit deduction within deposit → Owner decision → unresolved maintenance block → turnover completion. Assert the unit/property remains unavailable until all gates pass.
- [ ] Repeat the representative lifecycle in the browser and capture results, actor/date/history, notification recipients, and mobile usability.

**Done when:** Lease availability, deposit decisions, and financial totals reconcile throughout the full journey. Any defect gets a focused test and fix before release.

## Task 6: Select the next product increment — P3, after release gates

Do not start all options at once. Rank them using pilot feedback and write one bounded spec before implementation.

| Candidate | Benefit | Decision needed | Acceptance direction |
| --- | --- | --- | --- |
| Expense/application/prospect CSV exports | Extend existing reporting with relatively little workflow change | Resources, columns, roles, filters, caps | Export matches scoped list results; privacy and CSV injection checks pass |
| Maintenance-to-expense assistance | Reduce repeated entry | Draft creation/linking and duplicate policy | One linked draft per work order; Owner approval still required; no automatic statement double count |
| Private document uploads | Keep lease, receipt, and inspection evidence accessible | Storage provider, size/type limits, retention and access policy | Authorized uploads/downloads, revoked access, evidence linkage and audit history |
| Email reminders | Reach users outside the in-app inbox | Provider, preferences, recipients and delivery policy | Retry/deduplication, delivery history and correct scoped recipients |
| Formal notice tracking | Complete an identified lease lifecycle limit | Approved notice policy, dates and responsible roles | Dated notice/reference history and scoped reminders; separate from e-signing |
| Online rent payment or e-signing | Reduce external manual steps | Provider, reconciliation/signing model and error recovery | Provider callbacks are authenticated/idempotent; existing authority and ledger rules remain valid |

**Recommendation:** If pilot users need more reporting, start with scoped expense CSV export. If repeated maintenance entry is the dominant problem, specify a linked expense-draft workflow first. Defer provider integrations until the existing release has acceptance evidence.

## Suggested execution order

1. Reconcile the role matrix and establish the automated baseline (Tasks 1–2).
2. Prove the rental journey and staging operations (Tasks 3–4).
3. Prove renewals, turnover, and money reconciliation (Task 5).
4. Pilot with representative users, then select one product increment (Task 6).

This scan does not provide a reliable calendar estimate: backend execution and deployment access are unverified. Estimate after Task 2 exposes the actual failure list. Commit each independently verified change; do not combine unrelated fixes or optional features into the release-verification work.
