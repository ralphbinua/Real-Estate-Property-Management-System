# Real Estate Management Feature Roadmap

**Sources:** [System guide](https://docs.google.com/document/d/1yDqmKlsxEOQnLDDy0pO3GjFLjLmH08sUNASpuYDchoU/edit) and [feature matrix / Delivery Plan](https://docs.google.com/spreadsheets/d/1-EG-5CiSopA7r_Z-xSXFlAcomM8ag0sievccWr1SH5U/edit), reviewed 2026-10-16.

**Goal:** Complete the operational workflows identified in the project documents while preserving role and property boundaries. Ship each phase independently. This is a delivery roadmap; each phase gets its own implementation spec and task plan before coding.

## Current baseline

- Django API and React/Vite frontend support five roles: Admin, Owner, Manager, Agent, and Tenant.
- Monthly invoice generation already exists in `backend/billing/services.py` and `backend/billing/management/commands/generate_monthly_invoices.py`. It is callable manually, but no deployment scheduler or run health view exists.
- Maintenance requests already support Tenant submission, Admin or assigned Manager assignment, status updates, and in-app notifications. Vendor, cost, estimate, approval, and per-change history are absent.
- Leases support pending, active, terminated, and expired records, with authority checks for activation and termination. Renewals, expiry reminders, notices, move-out, settlement, and turnover are absent.
- The documents list operating expenses, Owner statements, inspections, and CSV export as future work. The feature matrix predates maintenance assignment; update it after reconciling the live workflow.

## Delivery order

| Phase | Deliverable | Priority | Depends on |
| --- | --- | --- | --- |
| 0 | Role and authority verification baseline | P1 | Test accounts and non-production environment |
| 1 | Scheduled monthly billing with run health | P1 | Hosting scheduler choice |
| 2 | Lease expiry reminders and renewal decision | P2 | Renewal policy, notice timing, authorization rules |
| 3 | Maintenance work orders and approvals | P2 | Vendor data and approval thresholds |
| 4 | Scoped CSV exports | P3 | Export fields and privacy rules |
| 5 | Property expenses and Owner statements | P3 | Categories and statement format |
| 6 | Inspections, move-out, deposit settlement, turnover | P3 | Condition checklist and settlement policy; coordinate with Phase 2 |

Phases 0 and 1 can run together. Phases 2 and 3 can be planned separately. Phase 5 should precede any statement that claims net income. Phase 6 uses the lease-end events established in Phase 2.

## Phase 0 — Verify roles and authority

1. Create non-production fixtures with two properties, distinct Owners, Managers, Agents, and Tenants, plus an Admin. Include one delegated and one Owner-decided application.
2. Exercise property scoping, application decisions, rent-change proposals, lease activation and termination, billing, maintenance assignment, and record views across every role.
3. Verify unauthorized API requests fail even if the UI hides the action. Verify written Owner instruction and reference are recorded where an Admin acts for an Owner.
4. Record any discovered defects as separate fixes before extending the affected workflow.

**Acceptance:** Each allowed action succeeds; cross-property and forbidden-role actions fail; no unauthorized record appears in lists, detail views, exports, or notifications. Keep these as automated backend tests plus a focused browser pass on desktop and mobile.

## Phase 1 — Automatic monthly billing

**Backend:** Add a `BillingRun` record with month, start/end time, status, created count, error summary, and trigger (`scheduled` or `manual`). Make the existing command create/update this record around `generate_monthly_invoices`; retain the current per-lease duplicate protection. Add a narrowly scoped Admin/Manager run-history API. Ensure a concurrent or retried invocation is represented clearly without creating duplicate invoices.

**Operations:** Configure one hosting scheduler to call `python manage.py generate_monthly_invoices --month YYYY-MM` shortly after the first day begins in the billing timezone. Capture exit status and stderr in deployment logs. Alert an operator on failure or a missing monthly success; avoid assuming that a zero-invoice run is automatically a failure. Document recovery with the explicit `--month` command.

**Frontend:** Show last run, month, outcome, created count, and a retry action in the existing billing management view. Keep the manual run action. Show errors only to permitted staff.

**Tests:** Repeat run for the same month; concurrent runs; active versus pending/ended leases; due day and lease boundaries; skipped deleted properties; failure mid-run; Tenant/Owner invoice scope; scheduler retry. Confirm only one invoice per eligible lease and month.

**Acceptance:** A successful scheduled run is visible, a failed or missing run alerts an operator, and reruns do not duplicate invoices. Owners and Tenants see only their scoped invoices.

## Phase 2 — Lease lifecycle

**First release:** Add configurable reminder milestones (proposed defaults: 60, 30, and 7 days before end), idempotent in-app notifications, a renewal decision record, and a dated timeline. Keep signatures external and record the signed-copy reference. A renewal creates a new pending lease term instead of silently extending the active agreement. Activation uses the existing Owner/Manager/Admin authority rules; no automatic renewal.

**Second release:** Record notice, move-out date, and reason; close the lease with a dated event. Unit availability must follow the existing reservation and active-lease rules. Deposit settlement and final turnover belong in Phase 6.

**Views:** Owner and Manager see leases needing action; Tenant sees their own end date, reminder, and decision status; Admin sees authorized system-wide records. Agent has no lease financial access.

**Tests:** Reminder deduplication, timezone/date boundaries, renewal refusal, overlapping terms, role authority, signed-copy reference, and correct unit status after termination/expiry.

**Acceptance:** Each approaching lease appears once per reminder milestone, the right people receive notices, and every renewal or ending has actor/date/authority history.

**Decisions before implementation:** Notice periods, who may initiate a renewal, whether rent changes use the existing proposal flow, and whether the Tenant may accept or only acknowledge an externally signed renewal.

## Phase 3 — Maintenance work orders

**Data:** Extend a request with urgency, a separate assignment to a vendor/contact, estimate, approved amount, actual cost, and immutable activity entries. Keep staff assignment distinct from vendor assignment. Record who changed status, costs, or approval and when.

**Workflow:** Tenant submits and tracks the issue. Admin or assigned Manager triages, assigns staff/vendor, enters estimate, requests approval if required, records work and actual cost, then resolves. Owner sees owned-property work and any approval decision assigned to them. Urgent requests remain prominent and follow the property's emergency procedure outside the app.

**Views:** A detail page or panel for staff with status timeline, vendor, estimate, approval, and cost; a simplified Tenant view showing progress without private vendor/financial fields; Owner approval queue. Notify the Tenant of meaningful status changes and the assigned decision-maker of pending approval.

**Tests:** Cross-property access, Tenant visibility limits, status history order, rejected/approved estimates, cost changes after approval, and notification recipients.

**Acceptance:** Permitted roles can see assignment, approval, costs, and a dated history without losing the existing Tenant-to-staff status flow.

**Decisions before implementation:** Vendor record fields, approval threshold and approver, emergency override procedure, whether estimates/costs feed the expense ledger, and any receipt attachment policy.

## Phase 4 — Scoped CSV exports

Start with separate exports for invoices, payments, leases, and maintenance. Apply the same queryset and role filters as the corresponding list APIs before serializing. Use explicit columns, stable date and decimal formats, UTF-8, and a clear filename including dataset and date. Exclude credentials and private notes. Add one download action on each applicable list page.

**Tests/acceptance:** Export row IDs exactly match what the role may list for the same filters; cross-property data never leaks; empty exports include headers; large exports stream or use bounded pagination. Defer bulk changes until exports have shipped and their permissions are verified.

**Decisions:** Required columns, whether archived records appear, maximum period/row limits, and whether Tenant exports are in scope.

## Phase 5 — Expenses and Owner statements

Add property-level expense entries with category, amount, incurred date, payee/reference, approval state, and audit history. Only verified rent receipts count as collected income. Generate a period statement for one property that shows opening balance (if tracked), verified receipts, approved expenses, and closing/net figure, with links to source records. Owner can view only owned-property statements; Manager only assigned properties; Admin system-wide within authority.

**Tests/acceptance:** Statement totals reconcile to ledger rows for the same property and period; unverified/reversed payments and unapproved expenses do not inflate totals; cross-property access fails; corrections retain history. Do not call the statement a cash payout record unless payouts are actually tracked.

**Decisions:** Expense categories, tax treatment, approval rights, statement period, opening balance policy, and whether maintenance costs create expense entries automatically.

## Phase 6 — Inspections and turnover

Introduce move-in/move-out inspection records with a versioned condition checklist, dated findings, photos or external references, and participant acknowledgment. Link move-out inspection to lease ending. Record deposit deductions and return amount with reasons and supporting references; keep the settlement separate from rent payments. Complete turnover only after the inspection and required work are recorded, then update unit availability through the existing unit-state rules.

**Tests/acceptance:** Owner/Manager/Tenant see only permitted records; old inspection versions stay intact; deductions cannot exceed deposit without a separately recorded claim; no unit is advertised available while an active lease or unresolved reservation still holds it.

**Decisions:** Checklist items, photo storage versus links, acknowledgment meaning, deposit timeline and allowed deductions, and whether a Tenant can contest findings.

## Cross-phase release gate

For each phase: implement API permission checks first; add focused model/service tests and role tests; run Django checks and targeted tests, then the full backend suite; run frontend lint/build and a mobile/desktop browser pass for changed screens; apply migrations on a non-production copy; verify data backfill and rollback; update the README, Google feature matrix, and delivery state after release. Do not mark a phase complete from a passing UI alone.

## Suggested first implementation slice

Build Phase 1 in three reviewable changes: (1) billing-run persistence and command logging, (2) scheduler and failure alert integration for the actual hosting environment, (3) staff run-history UI and recovery documentation. Phase 0 role tests should land before or with the first change.
