# Real Estate Property Management System

A website for managing rental properties and the people who live in or manage them. It keeps property details, rental applications, leases, rent records, expenses, and maintenance requests together.

The system has five account types: Admin, Property Owner, Property Manager, Agent, and Tenant. Each type has access to the tasks and information it needs.

## What you can do

- Add properties and units, and keep their rent and availability up to date.
- Track rental inquiries, schedule viewings, and review applications.
- Prepare and manage leases.
- Create rent invoices and record payments.
- Submit property expenses for Owner review and view monthly statements.
- Submit and track maintenance requests.
- View in-app updates, activity history, and system settings.

The system records payments; it does not collect money online. No payment service is connected.

## Who uses the system

- **Admin:** Manages user accounts and system settings, and helps oversee records. Admins need the Owner's written instruction to record decisions reserved for an Owner.
- **Property Owner:** Adds their properties, chooses who reviews rental applications, and makes decisions reserved to them.
- **Property Manager:** Handles everyday tasks for assigned properties, such as maintaining unit details, preparing leases, recording rent, and coordinating repairs. Some actions require the Owner's recorded permission.
- **Agent:** Answers prospective tenants' questions, schedules viewings, and helps prepare applications. Agents cannot approve applications or activate leases.
- **Tenant:** Views their home, lease, and rent records; submits maintenance requests; and updates personal information.

Access and decision authority should follow the written management agreement and applicable local requirements.

## Application and lease rules

- Each new property starts with **Owner approval** for rental applications. The Owner may delegate application decisions to the assigned Property Manager. The rule in effect when an application is submitted is saved with that application, so changing the rule later does not rewrite older applications.
- Once an inquiry has a rental application, its property and unit cannot be changed. Start a new inquiry for a different property or unit; viewing notes and other valid inquiry updates remain available.
- A Manager may review applications and send them to the Owner when the Owner's approval is required. If the Owner delegated decisions to the Manager, the Manager may approve or decline them.
- A lease prepared from an application must use an approved application and a Tenant account whose email matches the applicant. An Admin must create the Tenant account first; the system does not create accounts or send invitations automatically.
- A Manager may prepare an application-based lease. To activate it, the Manager must have the Owner's separate signing authorization for that property. The Owner may activate a lease directly. An Admin may record activation only with the Owner's written instruction and its reference.
- The person activating a lease confirms that required parties signed outside the system and records where the signed copy is stored. The system does not create or verify electronic signatures.
- Existing or offline leases can be entered with a reason or a reference to the existing lease record. A Manager can prepare that record, but only the Owner or an Admin with the Owner's written instruction can activate it.
- The Owner can end leases for their properties. A Manager can end a lease only with a separate Owner-granted termination authorization. An Admin needs the Owner's written instruction. The system records the reason, effective date, actor, and authority, and keeps the lease history.

## How the system is built

- **Frontend:** React, Vite, React Bootstrap, React Router, and Axios
- **Backend:** Django and Django REST Framework
- **Authentication:** Django sessions with CSRF protection
- **Database:** PostgreSQL

## Run the website on your computer

These steps are for someone setting up the project for the first time on Windows. You will need an internet connection to download the tools and project packages. Even when your database is on Supabase, Python and the server setup below are still needed to run the server on your computer.

### Requirements

- Python **3.12** (used to run the server)
- Node.js **20.19+** (20.x), **22.13+** (22.x), or **24+** (used to run the website), including npm
- Git (used to download the project)
- A PostgreSQL database, either hosted by Supabase or running on your computer

### Step 1: Check for the required tools

PowerShell is the command window included with Windows. Open it and enter these commands one at a time:

```powershell
node --version
npm --version
git --version
py --version
```

If PowerShell says a command is “not recognized,” install that tool. After installing, close and reopen PowerShell, then check the versions again.

- **Node.js and npm:** Install a supported version from [nodejs.org](https://nodejs.org/). npm is included with the Windows installer.
- **Git:** Install [Git for Windows](https://git-scm.com/download/win). Use the installer’s recommended options.
- **Python:** Install Python **3.12** from [python.org](https://www.python.org/downloads/windows/). Select **Add python.exe to PATH** in the installer.
- **PostgreSQL database:** If you already use Supabase for this project, you do **not** need to install PostgreSQL on your computer. Otherwise, you can install it from [postgresql.org](https://www.postgresql.org/download/windows/).

When the checks print version numbers, continue to the next step. If Python's `py` command is not recognized after installation, rerun the Python installer and make sure its launcher is selected.

### Step 2: Set up the server

The **server** is the part of the project that handles information and talks to the database. In PowerShell, first make sure you are in the main project folder (the folder containing `backend` and `frontend`), then run:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

The server needs a settings file named `.env` inside the `backend` folder. Create `backend/.env` and add the settings below. Replace the example values with your own. Keep this file private; it contains passwords and must not be uploaded to GitHub. If you are using Supabase, use the database settings from Supabase instead of the local example values.

```dotenv
DJANGO_SECRET_KEY=replace-with-a-long-random-local-key
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your-database-password
DB_HOST=127.0.0.1
DB_PORT=5432
DB_SSLMODE=require
```

**Using Supabase?** In your Supabase project, open the database connection details and copy the database name, username, password, host, and port into `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT`. Keep `DB_SSLMODE=require`. You do not need to install PostgreSQL on your computer. If using PostgreSQL installed on your computer, use its local connection details instead.

Save the file as `backend/.env` (make sure it is not accidentally saved as `.env.txt`).

In PowerShell, prepare the database and create the first server account:

```powershell
python manage.py migrate
python manage.py createsuperuser
```

The account created above can manage the server, but it is not automatically an Admin in the website. To give it access to the Admin dashboard, replace `admin@example.com` with the email you used, then run:

```powershell
python manage.py shell -c "from users.models import User; u = User.objects.get(email='admin@example.com'); u.role = User.Role.ADMIN; u.save(update_fields=['role'])"
python manage.py runserver 127.0.0.1:8000 --settings=core.local_settings
```

Leave this PowerShell window open while you use the website. It is running the server. The local settings option in the last command is only for running on your own computer; do not use it for a live website.

### Step 3: Start the website

Open a second PowerShell window. Go to the project folder and run:

```powershell
cd frontend
npm ci
npm run dev
```

PowerShell will show a local web address, usually `http://localhost:5173`. Open that address in your browser. Keep both PowerShell windows open while using the website.

To stop the website and server, click each PowerShell window and press **Ctrl+C**.

### Optional: run the browser security check

This check is for developers who want to confirm the sign-in and account pages work. It is not needed to start the website. With the server environment activated and website packages installed, run this from the `frontend` folder:

```powershell
npm run test:browser
```

The check starts temporary test servers and a temporary database. It checks signing in, refreshing the page, editing a profile, and signing out. It cleans up after itself and does not change your Supabase or local PostgreSQL database. On Windows it needs Brave or Edge. If neither is installed, install its test browser once with `npx playwright install chromium`.

### Optional: developer quality checks

These checks are for developers making code changes. They are not required to run the website. With the server environment activated, run these commands from the `backend` folder:

```powershell
python manage.py check --settings=core.test_settings
python manage.py makemigrations --check --dry-run --settings=core.test_settings
python manage.py test --settings=core.test_settings --noinput
```

These backend checks use a temporary SQLite database and do not change your project database. They do not check production database behavior. To check the website code too, run these from the `frontend` folder:

```powershell
npm ci
npm run lint
npm run build
npm run test:browser
npm run test:ui
```

`test:ui` includes the security smoke journey, five-role layout checks at
1440, 768, and 320 pixels, and the Tenant/Admin maintenance scenario. It writes
synthetic screenshots to `frontend/.ui-review/`. `npm run test:rental` exercises
the five-role application-to-lease path, renewal approval and successor
activation, move-out inspection acknowledgement, deposit approval, maintenance
blocking, and turnover completion using synthetic SQLite data. The journey uses
authenticated session API calls for Tenant acknowledgement, maintenance
resolution, and final unit-availability verification; other steps exercise the
UI. Expense CSV export is available to Admins, assigned Managers, and Owners for the selected
property; it follows existing property/status filters and shared CSV formula
safety and 10,000-row limit behavior.

When code is uploaded to GitHub, the `Quality checks` workflow runs the project checks with Python 3.12 and Node 22. A separate `Security checks` workflow reviews software dependencies. Running checks on your own computer does not mean the GitHub checks have run; view their results on GitHub after uploading code.

## Optional technical reference

The sections below are mainly for developers and people who maintain the live website. You can skip them if you only need to understand the system or run it on your computer.

### API areas

The backend API is served under `/api`:

| Area | Path |
| --- | --- |
| Sign in | `/api/auth/login/` |
| System settings | `/api/settings/` |
| Users and activity | `/api/users/` |
| Properties, units, inquiries, and applications | `/api/properties/` |
| Owner portfolio | `/api/owner/portfolio/` |
| Lease contracts | `/api/contracts/` |
| Rent invoices and payment records | `/api/invoices/` |
| Rent payment transactions | `/api/payments/` |
| Maintenance requests | `/api/maintenance/` |
| Notifications | `/api/notifications/` |

Most API requests require a signed-in session. The browser sends the secure session cookie automatically, and the frontend sends a CSRF token with changes. Deploy the frontend and API on the same origin so this cookie flow works as configured.

Older JWT sign-ins are no longer accepted after this update. Users must sign in again. Login attempts are limited by client IP and account email using Django's cache; use a shared cache in a multi-server deployment and add rate limiting at the reverse proxy as well.

### Maintenance work orders

Tenants submit requests with a Normal or Urgent priority and can track status,
assignment, and public activity. Admins and the assigned Property Manager can
record vendor contact, an estimate, and final cost. Staff may request Owner
approval for each job. Once requested, the estimate cannot change while the
decision is pending, and work cannot move to In Progress or Resolved until the
Owner approves. If the Owner rejects it, staff must revise the estimate before
requesting approval again. Owner and staff views show the estimate, decision,
cost, and dated history; Tenants do not receive those private fields. Apply
`maintenance` migration `0003` before using this workflow.

### CSV exports

Invoices, payments, leases, and maintenance lists provide a CSV download. Tenants
can export their own records in all four areas. Each
export uses the same role and query filters as its list API. Exports contain up
to 10,000 rows, include headers even when empty, and omit private maintenance
financial columns for Tenants. Spreadsheet formula-like values are escaped.

### Delivery status

The [feature roadmap](docs/feature-roadmap-2026-10-16.md) distinguishes implemented
code, local verification, staging acceptance, and production verification.
Existing features and cron entries are not evidence of a successful deployment.
Application dates currently use UTC; confirm the business timezone before release.
The configured billing and reminder jobs run at 00:05 UTC on the first of the
month and 00:15 UTC daily, respectively. Billing records failures and sends Admin
in-app alerts, but detecting a scheduler that never invokes the app requires
independent monitoring. Verify all target database migrations, not only those
named in individual feature sections.

### Inspections and move-out

An Owner, or a Manager with the property's lease-ending authority, can start
move-out from an active lease. Admins must record the Owner instruction and a
reference. The unit enters Maintenance while turnover is pending. Staff can
record dated Move In and Move Out inspection versions with a condition checklist
and evidence reference; Tenants can acknowledge receipt of an inspection.
Staff request a deposit settlement after a Move Out inspection, with deductions
no greater than the lease deposit and a reason for any deduction. The Owner
approves or rejects each settlement. Staff can complete turnover only after
Owner approval and resolution of open unit maintenance requests. The unit then
becomes available if no active or pending lease holds it. The existing End
lease action remains available for leases that do not use the move-out flow.
Apply the `contracts` migration `0007` before using move-out.

### Property expenses and Owner statements

Admins and assigned Managers enter property expenses with category, date,
amount, payee, and receipt or document reference. Each expense remains Pending
until that property's Owner approves it. Rejected entries can be revised and
resubmitted; approved entries are immutable and require a separate correcting
entry. The expense history records submissions, revisions, and decisions.
An Owner can reverse an approved expense with a recorded reason, then staff can
enter a corrected replacement. Owner statements use calendar months by default. They total rent payments
whose status is Verified and payment date falls in the month, then subtract
Owner-approved expenses incurred in that month. Pending, rejected, or reversed
payments and expenses do not affect the statement. The displayed net cash
figure does not include taxes, opening balances, or payouts. Maintenance costs
must be entered separately as expenses after verification. Apply the `billing`
migrations `0005` and `0006` before using this area.

### Monthly rent invoices

Each lease sets a rent due day from **1 to 28**, defaulting to the **1st**. Monthly billing creates one invoice for each active lease whose due date falls within that lease term. Running billing again for the same month will not create another invoice. If a scheduled run is missed, the command can generate the correct month later; invoices whose due date has passed are marked overdue.

After updating the code, apply all database migrations from the `backend` folder before using the updated lease and billing workflows:

```powershell
python manage.py migrate
```

The Admin or Property Manager can still use **Run monthly billing batch** in the app. Every manual or scheduled attempt is recorded in billing run history with its month, result, and invoice count. Admins see all runs; Managers see their own manual runs. Failed runs also create an in-app Admin notification.

The root `vercel.json` configures a monthly cron call to `GET /api/invoices/scheduled-monthly-billing/` at 00:05 UTC on the first day of each month. Set a strong `CRON_SECRET` in the production deployment environment; Vercel sends it as a Bearer token. The endpoint rejects requests when the secret is absent or incorrect. Apply migrations before enabling the cron job. Confirm the job appears in the production deployment's Cron Jobs settings and verify its first run in the Admin billing history. Vercel does not retry failed cron calls, so monitor failed or missing runs and rerun the month manually if needed.

For non-Vercel hosting, schedule this command on the first day of each month from the `backend` folder. Django currently uses UTC to determine the billing month, so schedule it shortly after 00:00 UTC:

```powershell
python manage.py generate_monthly_invoices
```

To generate a particular month manually, for example when recovering a missed run:

```powershell
python manage.py generate_monthly_invoices --month 2026-10
```

The command does not install a scheduler. Set up a monthly job in the hosting provider or operating system scheduler, and use the deployment's Python environment and database configuration. Running the command twice is safe for invoice creation; both attempts appear in run history.

### Lease expiry reminders and renewals

The root `vercel.json` also schedules `GET /api/contracts/scheduled-reminders/` daily at 00:15 UTC. It uses the same production `CRON_SECRET` as monthly billing. The job sends in-app reminders to the Tenant, Owner, and assigned Manager when an active lease reaches 60, 30, and 7 days before its end date. Each milestone is recorded once, so retrying the job does not duplicate its notifications. On other hosts, run `python manage.py send_lease_expiry_reminders` daily.

The Owner or assigned Manager may propose the next term's end date and rent from an active lease. A Manager's proposal needs an Owner decision; an Owner proposal is approved when saved. The Tenant can see the proposal and receives an in-app update, but signatures still happen outside the system. This workflow records a proposed term, not a signed agreement. Once the old lease has ended, the Owner or assigned Manager can prepare the linked pending successor; this expires the old record and reserves the same home. Activation then follows the existing rules for a manual lease: the Owner or an Admin with the Owner's written instruction and reference records the signed-copy reference. Manager signing delegation for application-based leases does not authorize activating a renewal. Notice periods and any legal requirements remain governed by the signed agreements and applicable law.

### Rent payment ledger

An invoice can have more than one payment transaction, so a Tenant can pay the balance in parts. A Tenant submits the amount, payment date, method, transaction reference, and an optional receipt link through `POST /api/payments/`. The submission remains **Pending Verification** until the Property Manager assigned to the property or an Admin checks it.

A Property Manager can review payments only for assigned properties. An Admin can review payments across the system. They can verify or reject a Tenant's submission; a rejection needs a reason. If the Manager or Admin has already received money directly, they can record the amount through `POST /api/payments/record/`, which records who entered it and marks it verified. An incorrect verified entry can be reversed with a reason; the record stays in the history.

Only **Verified** payments reduce the invoice balance or count as collected rent. Pending, rejected, and reversed transactions do not count as collected. The API reports the paid amount, remaining balance, and number of payments awaiting review. Invoice status is based on that balance and due date; cancellation remains a separate invoice action and does not reverse verified payments. Once an invoice has payment history, its Tenant, property, and lease links cannot be reassigned, it cannot be archived from the financial ledger, and it cannot be hard-deleted. Older archived invoices with payment history remain visible as read-only financial history; no new payments can be recorded for them, and pending submissions can be rejected but not verified. Owners can view invoice balances and payment history for properties they own, but cannot change payment records. Tenants can see their own invoices and submissions.

The payment ledger does not process money online and does not upload receipt files. It stores a receipt link when one is provided. The billing migration preserves existing Paid and Pending Verification invoices as marked historical payment records; the old system did not store an amount per transaction, so those imported entries use the invoice's full amount.

Admin and Manager financial reports can be filtered by invoice due month and show rent invoiced, verified rent collected, and the remaining balance separately.

Verified payment rows offer **Download PDF** in the Tenant, Admin, Manager, and Owner payment views. The acknowledgment identifies the Tenant, property/unit, rental invoice, payment amount/date/method/reference, and verification. Its remaining balance is labeled with the download time, so later partial payments are reflected correctly. Downloads use the existing payment access scope through `GET /api/payments/{id}/acknowledgment/`; pending, rejected, and reversed payments cannot be downloaded. Install ReportLab using the backend setup command above when updating an existing environment.

### Financial validation and summaries

Invoice rent amounts and lease rents must be positive; late fees and security deposits may be zero but cannot be negative. An invoice's total is its rent amount plus late fee. Creating or editing financial amounts recalculates that total, and a supplied total must match it. Verified or reversed payment history continues to protect invoice amounts from editing; ordinary notes updates do not recalculate historical totals.

Invoice status filters use the same verified-payment balance and due-date rules as the displayed invoice status. Cancelled invoices stay cancelled, including when payment history exists. Owner monthly income is the sum of active lease rents for their visible properties; changing listing rates does not change this contractual income. If the overview cannot load and lease records are incomplete, monthly lease rent is shown as Unavailable with an overview retry; a single lease page is not treated as the full portfolio.

A pending lease on a property without units keeps that property reserved as Pending. Editing the draft preserves that reservation; moving the draft releases the old property when no other lease or approved application holds it.

### Project layout

```text
backend/                 Django project and API
  core/                  Settings and root URL routes
  users/                 Accounts, roles, activity, and system settings
  properties/            Properties, units, inquiries, and applications
    view_modules/        Focused API view modules
  contracts/             Lease contracts
  billing/               Invoices and payment ledger
  maintenance/           Maintenance requests
  notifications/         In-app notifications and inbox API
frontend/                React and Vite user interface
  src/                   Application source
    pages/               Role dashboards and sign-in page
    components/          Shared forms, navigation, and workflow sections
    context/             Authentication context
    hooks/               Shared React hooks
    services/            API calls and data helpers
    utils/               Formatting and domain utilities
```

### Put the website online (Vercel)

This section is for the person responsible for publishing and maintaining the live website. If you only want to run the project on your computer, you can skip it.

The project is set up to deploy the website and server together on [Vercel](https://vercel.com/docs/services). Vercel Services is in beta.

1. Import this GitHub repository into Vercel. Set the project root to the top-level folder of this repository. If using the Vercel command-line tool, use version 50.38.0 or newer.
2. Set up a hosted PostgreSQL database and a Redis-compatible cache. Supabase can provide the PostgreSQL database. Choose database and cache locations near the Vercel server location.
3. In Vercel's project settings, add the required environment variables for each environment: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `REDIS_URL`. These are private settings; do not put real passwords in this README or commit them to GitHub. Set `DJANGO_ALLOWED_HOSTS` to your custom domain if you have one. Vercel adds its generated deployment address automatically. The cache address must start with `redis://` or `rediss://`.
4. Before using the site, run the database setup command below once for the target database, using the same private settings:

   ```powershell
   python manage.py migrate --settings=core.settings
   ```

   Run this as a separate release step. Do not run it while a visitor is using the site or every time the project is built.
5. Publish a preview first. Check the sign-in page and try signing in, refreshing the page, editing a profile, and signing out. If these work, publish to production. Django's admin files are served by Vercel's CDN.

The root `vercel.json` schedules monthly billing and daily lease reminders on Vercel. Both scheduled tasks require a private `CRON_SECRET`; see the sections below. The project does not currently have file upload fields. If uploads are added later, they need durable file storage.

For a live website, turn off debug mode, use a strong secret key, configure the correct domain and database, and use HTTPS. Keep secrets in Vercel's private environment settings, never in GitHub. Back up the database regularly and check that backups can be restored. If you suspect an account or payment issue, review the activity records. The GitHub security workflow checks dependencies when code is pushed or a pull request is opened.

