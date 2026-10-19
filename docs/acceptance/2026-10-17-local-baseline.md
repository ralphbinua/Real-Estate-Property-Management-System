# Local release baseline — updated 2026-10-19

## Scope

The user selected the current checkout and local testing. No target database
migrations, cloud deployment, production scheduler invocation, or shared Git
push was performed. Local results do not establish staging or production readiness.

Runtime: Windows, Python 3.12.14, Node 22.14.0, Django 6.1.2. Backend dependencies
were installed from `backend/requirements.txt` into the ignored root `.venv`;
frontend dependencies were installed from the lockfile with `npm ci`.

## Findings corrected

- Ordinary application-based lease preparation belongs to Admin/assigned Manager;
  Owner renewal-successor preparation is a separate action. Renewal successors
  follow manual-lease activation restrictions.
- Tenants can export their own invoices, payments, leases, and maintenance;
  maintenance exports hide private financial columns. Occupancy/Tenant assignment
  follows authorized lease activation.
- Google feature scope and release verification now have separate columns; the
  Delivery Plan includes evidence, environment, and review date.
- README now documents DB_SSLMODE, Python 3.12, ESLint's Node 22.13 minimum,
  lockfile installs, local checks, and deployment evidence limits.
- Default test discovery omitted all 27 contracts tests because the app package
  marker was missing. The marker and a discovery regression check were added.
  Contract migrations already had their own marker and were discoverable.
- API/browser test settings inherited environment Redis configuration. Both now
  force process-local caches. Regression checks inspect both settings under a
  synthetic Redis URL without opening a Redis connection. The original local
  run used LocMemCache, so shared Redis was not used in that run.
- Browser maintenance verification matched both the status badge and history.
  The assertion now requests an exact status match; the full UI rerun passed.
- The roadmap's detailed-plan link now targets a regular repository document
  rather than the ignored local planning directory.

## Verification record

| Check | Result |
| --- | --- |
| Pinned Python dependency install | Passed |
| `npm ci` | Passed; 237 packages audited, zero reported vulnerabilities |
| Django system check with `core.test_settings` | Passed; no issues |
| `makemigrations --check --dry-run` with test settings | Passed; no changes detected |
| Original default backend suite | 79 passed; incomplete discovery, superseded by expanded run |
| Infrastructure regressions before fixes | Failed for all three contract modules and both Redis-inheriting settings |
| Infrastructure regressions after fixes | 2 passed, including invocation from repository root |
| Expanded backend discovery | 108 cases, including contract workflows |
| Expanded full backend suite | Passed: 108 tests ran, 104 passed and 4 were skipped; no Django system-check issues |
| Frontend lint and build after lockfile install | Passed |
| Browser security smoke | Passed: sign-in, session restore, profile edit, logout |
| Browser UI rerun | Passed: all five roles at 1440/768/320 pixels; Tenant/Admin maintenance and notification flow; logout |
| Rental journey and role isolation API acceptance (2026-10-19) | Passed: 6 focused tests across both lifecycle paths and two-world permission isolation |
| Five-role browser rental journey (2026-10-19) | Passed on temporary SQLite: Agent viewing/application at 320px; Manager review stops at Owner decision; Owner approval at 320px; Admin creates matching Tenant; Manager prepares pending lease; Owner activates at 320px; Tenant sees own active lease at 320px. Mobile overflow checks passed for Agent, Owner, and Tenant views. |
| Frontend lint/build after browser acceptance changes | Passed |
| Google document readback | Corrected text, heading and normal-body structure verified |
| Google Sheet readback | Target values and wrapping verified; browser visual access timed out |
| Quality workflow | Added and reviewed; execution on GitHub pending |

The browser tests migrate and seed a temporary SQLite database, start local
servers, and remove their temporary test database afterward. Synthetic UI
screenshots are written to the ignored `frontend/.ui-review/` directory.

## Remaining release gates

- Saved application-rule snapshot and revoked-authority edge cases remain to be
  verified. The browser journey covers one Owner-decision application path and
  the API suite covers scoped lists, forbidden actions, and cross-world detail
  reads using two unrelated property portfolios. Renewal/move-out browser
  acceptance remains untested.
- PostgreSQL concurrency/locking verification; SQLite cannot establish it.
- Target migration inventory, data preservation, backup/restore rehearsal,
  HTTPS/session/CSRF deployment checks, and actual billing/reminder run evidence.
- Business timezone confirmation, independent missed-job monitoring, and a named
  operational recovery procedure.
- Actual quality CI execution after the changes are committed and pushed.

New exports, linked expense drafts, uploads, communications, signing, and online
payments remain proposed work, subject to the roadmap's selection gate.
