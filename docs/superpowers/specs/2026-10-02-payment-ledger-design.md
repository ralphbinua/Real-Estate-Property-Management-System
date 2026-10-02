# Rent Payment Ledger Design

## Status

Approved for implementation by the user on 2026-10-02.

Implementation status: Complete; source review and static syntax checks passed. Tests and database migrations were not run.

## Goal

Give Tenants, Property Managers, Owners, and Admins a reliable record of rent payments against monthly invoices. Support partial payments and preserve a clear history of submission, verification, rejection, and correction.

## Existing system

- Monthly invoices are generated from active leases.
- An invoice currently stores one payment method, one receipt reference, one paid date, and a single status.
- A Tenant can submit payment details for the full invoice; a Manager or Admin can mark the entire invoice paid.
- The current flow has no payment amount per transaction, multiple-payment history, partial balance, or separate verification record.
- The Tenant form accepts a transaction reference and optional receipt URL. It does not upload or store a receipt file.

## User roles and workflow

### Tenant

- See invoices and payment history for their own leases.
- Submit a payment against an unpaid invoice with amount, date, payment method, transaction reference, and optional receipt link.
- See whether each submission is awaiting verification, verified, rejected, or reversed, and see the remaining invoice balance.
- A Tenant cannot verify or edit a submitted payment after submission.

### Property Manager

- See invoices and payments only for properties assigned to them.
- Verify or reject Tenant-submitted payments for assigned properties.
- Record a payment received directly, such as cash. A direct Manager entry is marked verified by that Manager and records who entered it and when.
- Reverse an incorrect verified payment on an assigned property with a reason; preserve the original payment and record who reversed it and when.
- Provide a reason when rejecting or correcting a payment.

### Admin

- See and manage payment records system-wide.
- Verify or reject submitted payments and record direct payments.
- Reverse an incorrect verified payment with a reason. Admin actions remain attributable to the Admin.

### Property Owner

- View invoices, verified payments, pending submissions, balances, and property-level financial summaries for properties they own.
- Cannot submit, verify, reject, or reverse payment records.

## Payment record

Add a separate payment record linked to one invoice. Each record stores:

- Amount and payment method.
- Payment date, transaction/reference number, and optional receipt link.
- Status: **Pending Verification**, **Verified**, **Rejected**, or **Reversed**.
- Who submitted or recorded it and when.
- Who verified or rejected it and when, plus a rejection note when applicable.
- Who reversed it and when, plus the required correction reason.
- Payment date may be blank only for a migrated historical payment whose original date was not recorded.
- The ledger entry date may be blank for migrated history when the old invoice did not record when the payment was entered.

Payment records are retained. A verified payment is corrected by reversal with a reason; it is not silently overwritten or deleted.
Once any payment record exists, the invoice cannot be reassigned to a different Tenant, property, or lease. Hard deletion of an invoice is also blocked while payment records reference it, preserving who the transaction belongs to.
Invoices with payment history cannot be archived from the financial ledger. Previously archived invoices with payment history remain in read-only invoice and financial views so migrated collections and pending reviews stay visible. New payments cannot be added to archived invoices; a pending submission on an already archived invoice cannot be verified, but staff can reject it with a reason. Cancelling an invoice does not reverse any payment already verified, so those amounts remain counted as collected.

## Invoice balance and status

- Only **Verified** payment records count toward the amount paid.
- `amountPaid` is the sum of verified payments that have not been reversed.
- `balanceDue` is `totalDue - amountPaid` and cannot be less than zero.
- Reject a payment amount greater than the remaining balance. Recheck the balance in a database transaction when verifying to prevent two simultaneous submissions from overpaying the same invoice.
- Invoice status is **Cancelled** when explicitly cancelled; otherwise **Paid** when the balance is zero, **Partially Paid** when some verified amount is applied, **Overdue** when the due date has passed and a balance remains, and **Pending** when the due date has not passed and no verified payment has been applied. Cancelling an invoice does not erase or reverse verified payments; they still count as collected rent.
- Pending verification is shown separately from invoice status. For example, an overdue invoice can also show that a payment submission is awaiting review.
- Keep the existing due-date and late-fee fields. This feature does not introduce automatic late-fee rules or change how invoices are generated.
- Once an invoice has a verified or reversed payment record, its rent, late fee, and total due cannot be edited through the generic invoice form. Invoice adjustments are outside this phase so settled payment history cannot be rewritten.

## Legacy payment history

Preserve invoice-level payment records during migration:

- A legacy **Paid** invoice becomes one Verified payment equal to its `total_due`, using the old payment method, receipt link, and paid date where available. The record identifies itself as migrated; the original actor is unknown and must remain blank. If no old paid date exists, leave the payment date blank instead of inventing one.
- A legacy **Pending Verification** invoice becomes one Pending Verification payment equal to its `total_due`, using the existing method and receipt link. The legacy Tenant flow only recorded a full-invoice submission, so no partial amount can be inferred.
- Invoices with no prior payment submission do not receive a fabricated payment record.
- Keep legacy invoice data available for audit until the migrated records have been reviewed. Do not discard the original paid date, method, receipt link, or remarks as part of this feature.

## API and screen behavior

- Add role-scoped payment list and create/review actions. Enforce invoice and property scope in the backend; front-end visibility is not the security boundary.
- Keep invoice endpoints responsible for invoice summaries and balances. A generic invoice update must not mark an invoice paid or edit transaction evidence; payment status changes happen through payment actions.
- Tenant screens show invoice balance and a payment-history list, with a submission form for the amount and evidence.
- Manager/Admin screens show payment-review queues, payment amounts, invoice balances, and verify/reject/reverse actions appropriate to their role.
- Owner screens show read-only payment history and summary totals within owned-property scope.
- Report totals use verified, non-reversed payments. Pending submissions are not counted as collected rent.

## Out of scope

- Online payment processing, bank reconciliation, payment-provider integration, or storing card details.
- Uploading receipt files; the existing optional receipt link remains the evidence field for this phase.
- Invoice adjustments after a verified payment record exists.
- Refunds, account credits, deposits, non-rent charges, owner distributions, tax statements, and expense tracking.
- Automated reminders or email/text delivery.
- New late-fee policies, invoice adjustments, or write-offs.

## Acceptance criteria

1. An invoice can have multiple payment records, including partial payments.
2. Only verified, non-reversed payment records reduce the invoice balance or count as collected rent.
3. A Tenant can submit payments only against their own eligible invoices and cannot verify them.
4. A Manager can record or review payments only for properties assigned to them; an Admin can do so system-wide.
5. An Owner can view financial records only for owned properties and cannot change payment records.
6. Verification checks the current balance transactionally and rejects an amount that exceeds it.
7. Invoice status, amount paid, and balance reflect verified payment records and due date; pending verification remains a separate indicator.
8. Rejection and reversal require a reason and preserve actor and timestamp history.
9. Legacy Paid and Pending Verification invoices retain their historical evidence through explicit migrated payment records; other invoices receive no fabricated payment.
10. Generic invoice updates cannot bypass payment verification by directly setting Paid or changing payment evidence.
11. No payment gateway or receipt upload is implied by the screens or documentation.

## Implementation areas

- Billing payment model and migration, including a reversible legacy-data backfill.
- Role-scoped billing API and validation for submit, direct record, verify, reject, and reverse actions.
- Invoice serializer/query logic for paid amount, balance, invoice status, and pending-verification indicators.
- Tenant payment submission/history UI; Manager/Admin review and direct-entry UI; Owner read-only view.
- Update financial summaries and README to distinguish invoiced rent from verified collected rent.

## Design choices to confirm during review

- The legacy migration assumes an old **Paid** invoice represented full payment of `total_due`, matching the existing full-invoice workflow. The old **Pending Verification** flow also represented the full invoice because it captured no amount.
- Overpayments are rejected; the system does not create a credit balance.
- Direct Manager/Admin entries represent money already received and are verified at entry. Tenant submissions require separate review.
