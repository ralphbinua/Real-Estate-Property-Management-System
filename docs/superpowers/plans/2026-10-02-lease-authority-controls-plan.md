# Lease Authority Controls Implementation Plan

> **For Codex:** Implement this plan in the current project folder after the user approves it. Preserve existing uncommitted changes. Do not run or add tests unless the user asks for testing or verification.

**Goal:** Enforce the approved real-world authority rules for rental applications, lease activation, and lease termination, with an auditable record of owner decisions and exceptions.

**Design reference:** `docs/superpowers/specs/2026-10-02-lease-authority-controls-design.md`

**Approach:** Extend the existing Django REST API and React role dashboards. Enforce authorization in backend endpoints and serializers; UI visibility is supplementary. Add migrations for new persisted policy, lease references, and decision history. Preserve current property approval rules and existing local changes.

## Step 1: Map existing lease and application fields to the approved design

Review the current models, serializers, viewsets, frontend forms, and migrations before editing. Reuse existing approval-mode, signing-authorization, and activation-audit fields where their meaning matches the design. Record any required schema gaps in the implementation as concrete fields rather than duplicating existing data.

Primary files:

- `backend/properties/models.py`
- `backend/properties/serializers.py`
- `backend/properties/views.py`
- `backend/contracts/models.py`
- `backend/contracts/serializers.py`
- `backend/contracts/views.py`
- `backend/properties/migrations/`
- `backend/contracts/migrations/`

Preserve every pre-existing local modification. Do not reset or replace migrations or unrelated files.

## Step 2: Persist property approval policy and its change history

- Allow an Owner to set or change the application-approval rule only on a property they own.
- Keep Manager access read-only for this rule.
- Keep Admin exceptions possible only with an Owner-instruction note and traceable reference.
- Require an explicit choice when registering a new property; use Owner approval as the initial selection.
- Leave existing property values untouched.
- Preserve who changed the rule, when it changed, the old and new values, and any Owner instruction reference.

Likely files: property model, serializer, viewset, migration, and property forms in the Owner/Admin dashboards.

## Step 3: Enforce application review and application-to-lease flow

- Enforce Owner-only application decisions when the property uses Owner approval.
- Permit only the assigned Manager to decide when the Owner delegated approval to Managers.
- Keep Owner application history visible for owned properties, with actions only on pending Owner decisions.
- Require every application-based lease to reference an approved source application before activation.
- Prevent changing approval policy from retroactively changing the result of a past application.
- Return clear API errors when the application is pending, declined, missing, or outside the actor’s property scope.

Likely files: application queryset/decision logic in `backend/properties/views.py`, relevant serializers/models, and Owner/Manager dashboards.

## Step 4: Separate manual/offline leases from application-based leases

- Keep manual leases for existing or offline tenancies.
- Mark them as manual/offline and require a reason or supporting-record reference.
- Allow a Manager to prepare a manual lease draft for an assigned property.
- Restrict manual lease activation to the Owner or an Admin who records the Owner’s written instruction and reference.
- Do not treat application-review or Manager signing authority as permission to activate a manual lease.
- Keep lease signing delegation separate from application approval; a Manager may activate an application-based lease only with explicit Owner-granted signing authority.
- Keep Admin lease exceptions tied to an Owner instruction note and reference.

Likely files: `backend/contracts/models.py`, `serializers.py`, `views.py`, a contract migration, contract API service, and Manager/Owner/Admin lease forms.

## Step 5: Record signing evidence and protect lease termination

- Require signature confirmation and a signed-copy reference before any lease activation.
- Store the signed-copy reference, activating actor, activation time, and any required Owner instruction reference.
- Add a dedicated lease-ending action or equivalent guarded transition requiring reason and effective date.
- Permit Owner termination for owned properties.
- Permit Manager termination only with a separate property-level Owner authorization.
- Permit Admin termination only with a recorded Owner instruction and reference.
- Apply the same protections to every API action that can delete, archive, or deactivate a contract; preserve lease history instead of deleting the tenancy record.

Likely files: contract model/serializer/viewset/migration, relevant property authorization data, contract service, and all dashboard actions that activate or end leases.

## Step 6: Clarify tenant-account prerequisites and role feedback

- Keep tenant-account creation restricted to Admins.
- When a Manager prepares an application-based lease without a matching tenant account, show a clear explanation that an Admin must create it first.
- Do not create accounts or imply that an invitation was sent automatically.
- Hide or disable actions the current role cannot take, and explain pending Owner approval or missing authorization when relevant.
- Keep Owner and Manager records scoped to their properties and assignments.

Likely files: `backend/users/views.py` only if existing API responses need clarification; otherwise Manager/Owner dashboards and their API services.

## Step 7: Align documentation with the implemented boundaries

Update `README.md` to describe:

- Owner approval versus delegated Manager approval;
- manual/offline leases and the Owner instruction required for Admin exceptions;
- separate Manager signing and termination authorizations;
- signed-copy reference capture;
- Admin-only tenant account provisioning;
- existing billing limits: manual payment recording and externally configured invoice scheduling.

Do not claim e-signature verification, payment processing, automated invitations, or an automatically configured scheduler.

## Step 8: Review the final changes

- Review the source diff against the approved design and acceptance criteria.
- Confirm existing approval-mode values are not bulk changed and unrelated uncommitted changes are preserved.
- Check migration files and the changed-file list for accidental removals or unrelated edits.
- Do not run tests or test commands unless the user asks for testing or verification.

## Completion criteria

- Backend authorization prevents bypassing application approval, signing authority, and termination authority.
- Owner, Manager, Admin, Agent, and Tenant views reflect the documented scopes.
- Manual/offline leases remain possible under the Owner/Admin authority rules.
- Decision, signature-reference, and lease-ending records retain the actor, time, authority, and required supporting reference.
- README accurately describes the implemented flows and existing billing limitations.
- Existing local work remains intact, with no unrelated files removed.
