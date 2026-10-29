# Staging and Production Release Checklist

Use this checklist for a controlled staging release before production. Record the
operator, date, environment, result, and evidence link for each checked item.

## Before deployment

- [ ] Confirm the business IANA timezone and set `DJANGO_TIME_ZONE` in the target
  environment. The application currently defaults to provisional `Asia/Manila`
  based on the workspace timezone; override it if the business operates in
  another timezone. The Sheet's `Asia/Singapore` setting is not app config.
- [ ] Confirm `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, HTTPS, trusted origins,
  PostgreSQL connection and SSL mode, shared `REDIS_URL`, and `CRON_SECRET` are
  present without copying their values into evidence.
- [ ] Confirm the frontend and API use the deployed same origin and verify
  session login and CSRF-protected changes over HTTPS.
- [ ] Review `python manage.py showmigrations` and `python manage.py migrate --plan`
  against the target database. Include every app migration, including contracts
  `0008_lease_renewal_history`.
- [ ] Take a database backup and record the restore procedure and responsible
  operator before applying migrations.

## Staging deployment and migration

- [ ] Apply the reviewed migration plan to staging.
- [ ] Verify existing properties, users, leases, payments, expenses, and renewal
  records remain accessible. Confirm prior renewal rows are version 1.
- [ ] Rehearse restoring the staging backup and record the result.
- [ ] Run `python manage.py check --deploy` with staging settings and resolve or
  explicitly document each applicable finding.

## Workflow acceptance

- [ ] Run the automated backend, frontend lint/build, browser smoke, role UI, and
  five-role rental journey checks against a clean checkout.
- [ ] Test two Owners, Managers, Agents, and Tenants, including unrelated property
  assignments and direct API access to list, detail, mutation, notification, and
  export endpoints.
- [ ] Test renewal proposal → Owner decline → revised proposal → Owner decision;
  verify every proposal and decision remains in renewal history.
- [ ] Test renewal start/end boundaries, successor activation authority, and
  signed-copy reference recording.
- [ ] Test maintenance estimate approval, rejection and revision, actual cost,
  tenant-visible status history, and private-field scope.
- [ ] Reconcile split, rejected, verified, and reversed payments; confirm only
  verified amounts affect balances and only verified payments can download an
  acknowledgment.
- [ ] Reconcile approved and reversed expenses against calendar-month Owner
  statements.
- [ ] Test inspection versioning, tenant acknowledgement, deposit deductions at
  and above the deposit limit, Owner decisions, maintenance blocking, and
  turnover availability for both unit and unitless properties.

## Scheduled operations

- [ ] Verify the billing endpoint and reminder endpoint reject missing and
  invalid `CRON_SECRET` credentials.
- [ ] On PostgreSQL staging, run billing repeatedly and concurrently for an
  eligible lease/month. Confirm one invoice is created with the expected amount
  and local due date.
- [ ] Force a controlled billing failure and confirm a persisted failure run and
  Admin notification; rehearse recovery with an explicit billing month.
- [ ] Verify daily reminder milestones, recipient scope, idempotency, and actual
  deployment scheduler logs for both jobs.
- [ ] Create independent Healthchecks.io checks for billing (`5 0 1 * *` UTC)
  and reminders (`15 0 * * *` UTC), with an approved grace period and alert
  recipient for each job. If Vercel Hobby is used, allow at least 65 minutes
  because invocation may occur anywhere in the scheduled hour; confirm the
  deployed plan before setting grace.
- [ ] Set `BILLING_HEALTHCHECK_URL` and `LEASE_REMINDERS_HEALTHCHECK_URL` in
  staging/production without writing either private ping URL to the release
  evidence or logs.
- [ ] Verify success and failure check-ins, then deliberately suppress one
  staging invocation and confirm Healthchecks.io alerts when the job misses its
  expected run. Record the operator and safe recovery procedure.

## Sign-off

- [ ] Store migration, backup/restore, workflow, security, and scheduler evidence
  with the release record.
- [ ] Record unresolved issues and obtain operational sign-off before production.
- [ ] After production deployment, repeat health, migration, login, scheduler,
  and key role-scope checks. Do not infer production readiness from local or
  staging results.
