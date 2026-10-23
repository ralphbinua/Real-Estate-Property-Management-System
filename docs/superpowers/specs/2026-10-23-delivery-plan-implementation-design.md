# Delivery Plan Implementation Design

**Date:** 2026-10-23

## Goal

Complete all work that can be implemented and verified locally from the current Delivery Plan, add the recommended scoped expense CSV export, and update repository and Google documentation to distinguish local evidence from staging and production work that remains.

## Agreed scope

- Treat the Delivery Plan and its P1/P2 acceptance criteria as the source for the local release-verification work.
- Re-run the role/rental and lifecycle/financial checks available in the local repository. Add focused regression tests and code fixes only when a concrete failure is reproduced.
- Implement the recommended P3 expense CSV export. Other P3 candidates (application/prospect exports, linked expense drafts, uploads, messaging, online payment, e-signing, and formal notice tracking) remain out of scope.
- Use local synthetic data only. No staging or production URL/access has been provided, so deployment, backup/restore, PostgreSQL concurrency, deployed scheduler, and production checks must remain marked pending.
- Update the local README/roadmap/release plan/acceptance record as supported by evidence, plus the Google system guide and Delivery Plan. Do not claim deployment or operational acceptance from local checks.

## Expense CSV behavior

Add `GET /api/expenses/export/` to the existing expense viewset. It must reuse `ExpenseViewSet.get_queryset()` so the export inherits the existing Admin, assigned Manager, and owning Owner scope plus the existing `propertyId` and `status` filters. Use the shared `core.csv_exports.csv_response` helper, preserving its UTF-8 BOM, spreadsheet-formula neutralization, 10,000-row cap, truncation headers, and streaming behavior.

Export columns, in order: expense ID, property, incurred date, category, amount, payee, reference, description, status, decided-by user ID, decision timestamp, and decision note. The export must not add history/event content or expose records outside the caller's existing expense queryset.

Add a download control to `PropertyFinancePanel` for the currently selected property. It must request the export with the selected `propertyId`, download the returned CSV using a date-stamped filename, and report a useful error through the panel's existing error presentation. The control is available only to roles already authorized to read expense data (Admin, Property Manager, Owner).

## Verification

Backend tests must cover role/property scoping, selected-property and status filters, CSV formula neutralization for user-entered text, expected headers/values, and the 10,000-row limit/truncation indicator. Frontend verification must cover the request parameters, blob download, and error path using the project's existing test conventions. Run the full backend suite, migration drift check, frontend lint/build, and the locally available browser checks.

For existing P1/P2 work, run the acceptance checks already defined in `docs/release-readiness-plan-2026-10-17.md`, especially renewal boundaries/authority, maintenance approval and visibility, payment/expense reconciliation, and move-out/inspection/deposit/turnover gates. Any untested staging-only check remains pending, and any feature defect discovered requires a focused failing test before its fix.

## Documentation and delivery states

Update repository documentation and the Google system guide/Delivery Plan only after implementation and verification. Record the exact commands, outcomes, date, environment, and limitations. Mark the expense export locally verified only when its tests and frontend behavior pass. Keep GitHub CI pending unless a run is observed; keep staging/production checks pending without environment evidence.

## Constraints and exclusions

- Preserve existing authentication, expense roles, ownership/assignment scope, and statement behavior.
- Do not automatically create or approve expenses from maintenance records.
- Do not add database migrations or external providers unless a reproduced defect makes one necessary and its change receives a separate design approval.
- Do not change payment, signing, notification, retention, or formal notice policies.
