# Rent Payment Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable, role-scoped payment records that support partial rent payments and accurate invoice balances.

**Architecture:** Add a Payment model in the existing billing app and link each transaction to one invoice. Treat verified, unreversed payment records as the source for collected amounts; derive invoice balance and status from those records and the due date. Preserve invoice generation and the current manual-payment model, while updating Tenant, Manager, Admin, and Owner screens to use payment history.

**Tech Stack:** Django REST Framework, Django ORM migrations, React, React Bootstrap, existing invoice API services.

**Spec:** `docs/superpowers/specs/2026-10-02-payment-ledger-design.md`

## Global Constraints

- “Only **Verified** payment records count toward the amount paid.”
- “Reject a payment amount greater than the remaining balance.”
- “Overpayments are rejected; the system does not create a credit balance.”
- “Direct Manager/Admin entries represent money already received and are verified at entry. Tenant submissions require separate review.”
- “Payment records are retained. A verified payment is corrected by reversal with a reason; it is not silently overwritten or deleted.”
- Once any payment exists, do not allow invoice Tenant/property/lease links to change; prevent hard deletion of invoices that have payment history.
- Do not archive invoices with payment history from the financial ledger; do not verify pending payments on legacy archived invoices. Invoice cancellation does not reverse verified payments.
- Keep any pre-existing archived invoices with payment records in read-only financial queries so legacy collections and pending-review counts remain visible; do not accept new payments for them.
- “Online payment processing, bank reconciliation, payment-provider integration, or storing card details” are out of scope.
- “Uploading receipt files” is out of scope; use the existing optional receipt link.
- Receipt links supplied through the API must use `http` or `https`.
- Freeze invoice rent, late-fee, and total-due fields after a verified or reversed payment record exists, preserving the payment history without introducing invoice adjustments.
- Do not change invoice-generation timing, rent due-day behavior, or late-fee policy.
- Preserve all existing uncommitted work and unrelated file changes in the current project folder.
- Do not add or run tests unless the user asks for testing or verification. Use source review, syntax parsing, and `git diff --check` for this implementation pass.

## Review Focus

Review these conditions carefully in the owning task because the implementation is not adding or running tests under the current instruction:

- Two pending Tenant submissions could together exceed an invoice balance; each verification must lock and recheck the current remaining balance.
- Two reviewers could verify payments concurrently; invoice-level locking must prevent a race that creates an overpayment.
- Cancelled invoices, fully paid invoices, and reversed payments must not accept or count new payment amounts incorrectly.
- Legacy invoices may lack a paid date, actor, reference, or receipt; migration must preserve unknown values as unknown and retain old remarks.
- Tenant, Owner, and Manager requests outside their allowed invoice/property scopes must not expose or mutate another user's financial records.
- Generic invoice updates must not bypass verification by setting payment status or evidence directly.

---

### Task 1: Add payment records and preserve legacy invoice history

**Files:**
- Modify: `backend/billing/models.py`
- Create: `backend/billing/migrations/0002_payment_ledger.py`

**Interfaces:**
- Produces `Payment` with `invoice`, `amount`, `payment_method`, nullable `payment_date`, `reference_number`, `receipt_url`, `remarks`, `status`, `legacy_import`, `created_by`, `created_at`, `verified_by`, `verified_at`, `rejected_by`, `rejected_at`, `rejection_reason`, `reversed_by`, `reversed_at`, and `reversal_reason`.
- `Payment.status` values are `Pending Verification`, `Verified`, `Rejected`, and `Reversed`.
- `created_by` identifies the Tenant, Manager, or Admin who submitted or recorded the transaction; null is allowed for imported history.

- [x] Add the Payment model with decimal amount, invoice relation, existing payment methods, optional reference/evidence fields, nullable legacy entry timestamps, actor/timestamp audit fields, and status choices.
- [x] Add a data migration: create one `Verified` full-`total_due` payment for each legacy `Paid` invoice; create one `Pending Verification` full-`total_due` payment for each legacy `Pending Verification` invoice; copy method, receipt link, remarks, and available paid date; mark each record as legacy; leave unknown actor/date blank.
- [x] Make the reverse data migration remove only payment rows marked as legacy imports; do not modify source invoices during migration.
- [x] Update invoice status choices to include `Partially Paid` while retaining legacy values for existing database rows.
- [x] Review the generated migration dependencies against the current `billing` and swappable user migrations.

### Task 2: Add scoped payment API and invoice balance summaries

**Files:**
- Modify: `backend/billing/serializers.py`
- Modify: `backend/billing/views.py`
- Modify: `backend/billing/urls.py`
- Create: `backend/billing/payment_urls.py`
- Modify: `backend/core/urls.py`
- Create: `backend/billing/` payment serializer/view code only if separating it keeps existing invoice code clear.

**Interfaces:**
- `GET /api/payments/` returns records scoped to Admin (all), Manager (assigned properties), Owner (owned properties), or Tenant (own invoices).
- `POST /api/payments/` creates a Tenant submission with `invoice`, `amount`, `paymentDate`, `paymentMethod`, `referenceNumber`, and optional `receiptUrl`/`remarks`; initial status is `Pending Verification`.
- `POST /api/payments/record/` creates a direct payment for money already received; only Admin/Manager may call it; it is `Verified` immediately and records the actor and time.
- `POST /api/payments/{id}/verify/`, `/reject/`, and `/reverse/` perform guarded transitions. Reject and reverse requests require a reason.
- Invoice output adds `amountPaid`, `balanceDue`, `pendingPaymentCount`, and effective `status`.

- [x] Add serializers that require positive payment amounts, a valid payment method, and a nonblank transaction reference for Tenant submissions; preserve optional receipt URLs.
- [x] Add payment list and create/review endpoints with role and property scope enforced in backend querysets and object checks.
- [x] Validate Tenant submissions and direct Manager/Admin entries against the invoice's current remaining balance; reject nonpositive amounts, cancelled/fully paid invoices, missing payment dates, and amounts above the balance.
- [x] Implement payment verification inside a database transaction that locks the invoice, recalculates the verified non-reversed balance, rejects an amount above the remaining balance, and records verifier/time. Keep the balance check even after submission validation because multiple pending submissions can overlap.
- [x] Implement rejection and reversal with required reasons, actor/time audit, and no hard deletion. Restrict Manager reversal to assigned properties; allow Admin system-wide.
- [x] Implement direct payment entry as a verified transaction and record `created_by`, `verified_by`, and timestamps.
- [x] Derive invoice `amountPaid`, `balanceDue`, pending count, and effective status from payments and due date; keep pending-verification count separate from invoice status.
- [x] Make invoice payment evidence and paid status read-only through generic invoice create/update routes. Preserve invoice cancellation handling without letting it erase payments.
- [x] Prevent invoice reassignment after a payment record exists and protect payment-linked invoices from hard deletion.
- [x] Prevent archiving invoices with payment history; block verification on archived invoices and allow staff to reject pending submissions with a reason.
- [x] Include legacy archived invoices with payment history in read-only Tenant, Owner, Manager, Admin, and financial report views; prevent new submissions/recording for them.
- [x] Make the Admin monthly report's collected-rent totals use verified, non-reversed payment totals rather than invoice status alone.

### Task 3: Update Tenant payment submission and history

**Files:**
- Modify: `frontend/src/services/invoiceService.js`
- Modify: `frontend/src/components/TenantInvoiceViewer.jsx`

**Interfaces:**
- Add service calls for creating a payment submission and fetching scoped payment history.
- Render invoice summary values from `amountPaid`, `balanceDue`, `pendingPaymentCount`, and effective status.

- [x] Add a payment amount and payment date to the Tenant submission form; retain method, reference number, and optional receipt URL.
- [x] Submit to the payment endpoint and show validation/API errors beside the form.
- [x] Show each payment record, status, date, and reference with a pending-verification indicator.
- [x] Disable submission for cancelled or fully paid invoices and cap the form's maximum amount at the currently displayed balance.

### Task 4: Update Manager and Admin payment recording and review

**Files:**
- Modify: `frontend/src/services/invoiceService.js`
- Modify: `frontend/src/components/ManagerInvoiceTracker.jsx`
- Modify: `frontend/src/pages/AdminDashboard.jsx` only where financial summary/report data is rendered.

**Interfaces:**
- Manager/Admin tracker consumes scoped invoices with summaries and payment-review records.
- Direct-entry action sends invoice, amount, payment date, method, reference, optional receipt URL, and remarks.
- Review actions send payment ID plus a rejection or reversal reason where required.

- [x] Replace the current one-click “Confirm & Mark Paid” action with direct payment entry that captures amount, date, method, and reference.
- [x] Add a review queue for Tenant-submitted payments with amount, invoice, Tenant, property, reference, and optional receipt link.
- [x] Add verify, reject, and reverse controls according to the signed-in role and property scope; require reasons for reject/reverse.
- [x] Show invoice paid amount and remaining balance; allow multiple partial payments until the balance reaches zero.
- [x] Refresh invoice and payment data after every successful action and show clear server validation messages.

### Task 5: Update Owner financial views and documentation

**Files:**
- Modify: `frontend/src/pages/OwnerDashboard.jsx`
- Modify: `frontend/src/components/ManagerReports.jsx`
- Modify: `README.md`

- [x] Show Owner-scoped payment history, pending submissions, amount paid, balance due, and collected-rent totals as read-only information.
- [x] Update property/month reports to distinguish invoiced rent from verified collected rent and outstanding balances; exclude pending and reversed payments from collected totals.
- [x] Document partial payments, verification roles, reversals, invoice status calculation, and legacy history migration; retain the statement that no payment provider is configured.

### Task 6: Final review and static verification

**Files:**
- Review all files changed by Tasks 1–5; do not remove unrelated existing edits or deletions.

- [x] Compare the implementation against every acceptance criterion in `docs/superpowers/specs/2026-10-02-payment-ledger-design.md`.
- [x] Check API role scopes, invoice cancellation behavior, partial and concurrent verification logic, and legacy migration reversibility.
- [x] Run Python AST parsing, Babel parsing for changed JSX, and `git diff --check`; do not run or add tests unless requested.
- [x] Record the migration command `python manage.py migrate` for the configured backend environment; do not apply a migration to an unknown production database.

## Completion criteria

- Payments are stored as auditable transactions and can be partial.
- Invoice balances and statuses reflect verified, unreversed payments and due dates.
- Role-specific payment scopes and actions are enforced by the backend and reflected in all four role views.
- Existing full-payment and pending-verification invoice history is preserved and identified as legacy.
- README accurately describes manual payment recording and does not imply online processing or file upload.
- No unrelated pre-existing changes or deletions are reverted.
