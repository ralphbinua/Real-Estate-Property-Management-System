# Lease Authority Controls Design

## Status

Draft for user review. This design follows the approved decision to keep manual leases for existing or offline tenancies.

## Goal

Make lease and application actions follow the real-life division of authority between the property owner, property manager, and system administrator. The system should show who approved a decision and the instruction that allowed an exception.

## Roles and authority

- **Property Owner:** Sets the approval rule for each owned property, approves applications when the property requires owner approval, may activate or end leases for that property, and can review the full application decision history.
- **Property Manager:** Runs leasing for assigned properties. A manager may review an application when the owner has delegated that decision for the property. A manager may prepare a lease from an approved application. A manager may activate an application-based lease only when the Owner has separately authorized the manager to handle lease signing for that property. Ending a lease requires separate owner-granted termination authorization.
- **Admin:** Manages system access and can resolve exceptional records. An Admin action that makes or changes an owner business decision must include a record of the owner's instruction. Admin status alone does not make the Admin the property decision-maker.
- **Tenant:** Has no lease approval or termination authority in this workflow.
- **Agent:** May help a prospect schedule a viewing and prepare an application, but cannot approve the application, activate a lease, or terminate a lease.

## Property application-approval rule

Each property has one of two approval rules:

1. **Owner approval:** The application waits for the Owner's decision. A Manager may prepare the lease only after the Owner approves the application.
2. **Manager approval delegated by Owner:** The assigned Manager may approve or decline the application under the authority the Owner gave for that property.

The Owner can change the rule for a property they own. A Manager cannot change it. An Admin may record a change only when an Owner instruction or reference is provided and retained in the audit history.

Existing property rules must remain unchanged during rollout. The property form must show the current rule and require an explicit choice for a newly registered property; the proposed initial choice is **Owner approval**. Do not silently rewrite existing properties to this choice.

An application-based lease must always point to its source application, and that application must be approved under the property's current rule before the lease can be activated. Changing the approval rule later must not retroactively approve or invalidate past decisions.

## Manual leases for existing or offline tenancies

Keep the manual lease path for an existing tenancy or a tenancy handled outside the application workflow. It must be clearly identified as a manual/offline lease and capture the reason or supporting record reference.

- A Manager may prepare a manual lease draft for an assigned property.
- Only the Owner may activate that lease, unless an Admin records the Owner's written instruction with a reference.
- A Manager's application-review delegation or lease-signing authorization does not allow the Manager to activate a manual/offline lease. The Owner activates it, or an Admin records the Owner's written instruction and reference before activating it.
- A manual lease must not be presented as an application-approved lease.

## Signing and activation records

Before activation, the authorized actor confirms that the parties have signed outside the system and provides a reference to the signed copy. Store the confirmation, signed-copy reference, actor, timestamp, and any required Owner instruction reference with the lease's audit history.

The reference may be a document name, storage location, or other traceable identifier. This is an administrative record only; the system does not verify signatures or provide electronic-signature services.

## Ending a lease

- The Owner may end a lease for a property they own.
- A Manager may end a lease only when the Owner has separately granted termination authority for that property. The system must record which authorization was used.
- An Admin may end a lease as an exception only after recording the Owner's instruction and a traceable reference.
- Ending a lease requires an effective date and reason. Preserve the prior active lease and its history; do not delete it to end the tenancy.
- The same authorization rules apply to every API route or interface action that could end, delete, or otherwise deactivate a lease.

## Application decision history

Owners can see all applications for properties they own, including pending, approved, declined, and withdrawn applications. Past decisions are read-only and show the decision, decision-maker, date, and any recorded note. Owners can act only on applications currently awaiting their decision.

Managers see applications only for assigned properties and can act only when the property's rule delegates the decision to them. Agents can assist with prospects and applications but cannot make approval decisions.

## Tenant account prerequisite

The tenant account must exist before the system can activate a lease that links that tenant to the unit. Admin remains responsible for creating tenant accounts. When a Manager prepares a lease and the matching account does not exist, show a clear message explaining that an Admin must create the tenant account first. Do not silently create an account or imply that an invitation was sent.

## Billing boundary

Rent billing remains based on the approved active lease. Invoice generation is manual unless the host deploys an external scheduler. Payment collection remains recorded manually until a payment provider is connected. These controls do not add a payment processor or scheduler.

## User experience

- Label manual/offline lease creation clearly and request a reason or record reference.
- Explain why an application cannot advance, such as awaiting the Owner's decision or awaiting a tenant account.
- Show the acting role, approval rule, and any authority required before displaying an action.
- Ask for a concise reason and Owner instruction reference for Admin exceptions.
- Show the signed-copy reference and lease decision history to users with access to that lease.
- Keep Owner property and application views scoped to properties they own; keep Manager views scoped to assigned properties.

## Data and audit requirements

Persist enough information to explain each consequential decision:

- property approval rule and changes to that rule;
- application decision, decision-maker, and time;
- manual/offline lease reason or supporting reference;
- signature confirmation and signed-copy reference;
- lease activation actor and time;
- lease termination reason, effective date, actor, authority used, and any Owner instruction reference.

Do not overwrite the evidence for earlier decisions when a property rule or authorization changes. Access to these records follows the same Owner, Manager, Admin, Agent, and Tenant scopes as the associated property or lease.

## Acceptance criteria

1. An Owner can select or change the approval rule only for an owned property.
2. A Manager cannot change the property's approval rule.
3. An Admin exception that changes an owner-controlled rule is rejected unless it records the Owner's instruction and a reference.
4. Under Owner approval, only the Owner can approve or decline the application; an application-based lease cannot activate before approval.
5. Under delegated Manager approval, only an assigned Manager can decide; an application-based lease still cannot activate before approval.
6. No application-based lease can activate without a valid approved source application.
7. A Manager can activate an application-based lease only with separate Owner-granted signing authority; an Owner can activate it directly.
8. A manual/offline lease can be prepared by a Manager but can be activated only by the Owner or by an Admin with a recorded Owner instruction and reference.
9. A lease cannot activate without signature confirmation and a signed-copy reference.
10. A Manager cannot end a lease without separate termination authorization for that property; an Admin exception requires the Owner's instruction and reference.
11. Every lease-ending route preserves the lease record and records the reason, effective date, actor, and authority used.
12. Owners can review all application outcomes for their own properties but can change only pending Owner decisions.
13. A missing tenant account is clearly reported, and no account is silently created.
14. Existing property approval rules remain unchanged during rollout.

## Expected implementation areas

- Backend property approval settings, authorization checks, and audit records.
- Backend application decisions and lease create/activate/end rules.
- Contract and property migrations for any new persisted references or history.
- Owner, Manager, and Admin dashboards for approval settings, decision history, manual lease handling, and authorization prompts.
- API service updates for new fields and actions.
- README updates describing approval, signing, termination, manual lease, and billing boundaries.

## Out of scope

- Electronic-signature capture or validation.
- Payment gateway integration or automatic payment reconciliation.
- Hosting or scheduler setup for recurring invoice generation.
- Automatic tenant account creation or invitation emails.
- Changing existing property approval rules as a bulk migration.
- Changing unrelated property, maintenance, or role workflows.
