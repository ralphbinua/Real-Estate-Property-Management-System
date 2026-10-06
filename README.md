# Real Estate Property Management System

A web application for managing rental properties, units, tenants, leases, rent records, maintenance requests, and rental inquiries. The system has separate access for Admins, Property Owners, Property Managers, Agents, and Tenants.

## What the system supports

- Manage properties and their individual units, including rent and availability.
- Record prospect inquiries, arrange viewings, and submit rental applications.
- Review applications according to the Owner's recorded approval rules.
- Create and manage lease contracts.
- Create rent invoices and record or review payment status.
- Submit and manage maintenance requests.
- Review activity records and system settings.

Rent payments are tracked in the system. No external payment provider is configured in this repository.

## Roles

- **Admin:** Creates and manages accounts, assigns roles, configures the system, and oversees all records. An Admin may record an exception only with the Owner's written instruction and a reference to it; Admin access alone does not make the Admin the property decision-maker.
- **Property Owner:** Registers properties they own, chooses who decides rental applications, reviews property performance, and makes decisions reserved to them by the management agreement.
- **Property Manager:** Runs day-to-day work for assigned properties, including units, tenants, applications within the Owner's chosen approval rule, lease preparation, rent records, and maintenance. A Manager can activate an application-based lease or end a lease only when the Owner has separately recorded the relevant authority.
- **Agent:** Works with assigned listings and prospective tenants: answers inquiries, schedules viewings, and helps prepare applications. Agents do not approve applications or activate leases.
- **Tenant:** Uses their own account to view their home and lease, check rent records, submit and track maintenance requests, and update personal information.

Access and decision authority should follow the written management agreement and applicable local requirements.

## Rental application and lease workflow

- Each new property starts with **Owner approval** for rental applications. The Owner may delegate application decisions to the assigned Property Manager. The rule in effect when an application is submitted is saved with that application, so changing the rule later does not rewrite older applications.
- A Manager may review applications and send them to the Owner when the Owner's approval is required. If the Owner delegated decisions to the Manager, the Manager may approve or decline them.
- A lease prepared from an application must use an approved application and a Tenant account whose email matches the applicant. An Admin must create the Tenant account first; the system does not create accounts or send invitations automatically.
- A Manager may prepare an application-based lease. To activate it, the Manager must have the Owner's separate signing authorization for that property. The Owner may activate a lease directly. An Admin may record activation only with the Owner's written instruction and its reference.
- The person activating a lease confirms that required parties signed outside the system and records where the signed copy is stored. The system does not create or verify electronic signatures.
- Existing or offline leases can be entered with a reason or a reference to the existing lease record. A Manager can prepare that record, but only the Owner or an Admin with the Owner's written instruction can activate it.
- The Owner can end leases for their properties. A Manager can end a lease only with a separate Owner-granted termination authorization. An Admin needs the Owner's written instruction. The system records the reason, effective date, actor, and authority, and keeps the lease history.

## Technology

- **Frontend:** React, Vite, React Bootstrap, React Router, and Axios
- **Backend:** Django and Django REST Framework
- **Authentication:** JSON Web Tokens (JWT)
- **Database:** PostgreSQL

## Run locally

### Requirements

- Python and pip
- PostgreSQL, either local or hosted
- Node.js **20.19+** or **22.12+**, with npm

### 1. Configure and start the backend

From the project folder, open PowerShell and run:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install Django djangorestframework djangorestframework-simplejwt django-cors-headers "psycopg[binary]" python-dotenv "reportlab>=5.0.1,<6"
```

The backend reads its environment settings from `backend/.env`. Create that file with your database connection details:

```dotenv
DJANGO_DEBUG=true
DJANGO_SECRET_KEY=replace-with-a-long-random-local-key
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your-database-password
DB_HOST=127.0.0.1
DB_PORT=5432
```

For a hosted Supabase database, use the connection details supplied by Supabase for `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT`. The backend enables SSL when the database host contains `supabase`.

Run the database setup and start Django:

```powershell
python manage.py migrate
python manage.py createsuperuser
```

The Django superuser is separate from the app's Admin role. To use the Admin dashboard, change the new account's app role to `Admin` in the Django shell, replacing the example email:

```powershell
python manage.py shell -c "from users.models import User; u = User.objects.get(email='admin@example.com'); u.role = User.Role.ADMIN; u.save(update_fields=['role'])"
python manage.py runserver 127.0.0.1:8000
```

Keep the backend terminal running. The Vite development server forwards `/api` requests to this Django server.

### 2. Start the frontend

Open a second PowerShell window from the project folder:

```powershell
cd frontend
npm install
npm run dev
```

Open the local address printed by Vite. By default, it is `http://localhost:5173`.

## API areas

The backend API is served under `/api`:

| Area | Path |
| --- | --- |
| Sign in | `/api/auth/login/` |
| Users and activity | `/api/users/` |
| Properties, units, inquiries, applications, and Owner portfolio | `/api/properties/` |
| Lease contracts | `/api/contracts/` |
| Rent invoices and payment records | `/api/invoices/` |
| Rent payment transactions | `/api/payments/` |
| Maintenance requests | `/api/maintenance/` |
| System settings | `/api/settings/` |

Most API requests require a valid sign-in token. The frontend adds it automatically after login.

## Monthly rent invoices

Each lease sets a rent due day from **1 to 28**, defaulting to the **1st**. Monthly billing creates one invoice for each active lease whose due date falls within that lease term. Running billing again for the same month will not create another invoice. If a scheduled run is missed, the command can generate the correct month later; invoices whose due date has passed are marked overdue.

After updating the code, apply all database migrations from the `backend` folder before using the updated lease and billing workflows:

```powershell
python manage.py migrate
```

The Admin or Property Manager can still use **Run monthly billing batch** in the app. For a regular monthly run, configure the hosting environment's scheduler to run this command on the first day of each month from the `backend` folder. Django currently uses UTC to determine the billing month, so schedule it shortly after 00:00 UTC:

```powershell
python manage.py generate_monthly_invoices
```

To generate a particular month manually, for example when recovering a missed run:

```powershell
python manage.py generate_monthly_invoices --month 2026-10
```

The command does not install or configure a scheduler. Set up a monthly job in the hosting provider or operating system scheduler, and use the deployment's Python environment and database configuration.

## Rent payment ledger

An invoice can have more than one payment transaction, so a Tenant can pay the balance in parts. A Tenant submits the amount, payment date, method, transaction reference, and an optional receipt link through `POST /api/payments/`. The submission remains **Pending Verification** until the Property Manager assigned to the property or an Admin checks it.

A Property Manager can review payments only for assigned properties. An Admin can review payments across the system. They can verify or reject a Tenant's submission; a rejection needs a reason. If the Manager or Admin has already received money directly, they can record the amount through `POST /api/payments/record/`, which records who entered it and marks it verified. An incorrect verified entry can be reversed with a reason; the record stays in the history.

Only **Verified** payments reduce the invoice balance or count as collected rent. Pending, rejected, and reversed transactions do not count as collected. The API reports the paid amount, remaining balance, and number of payments awaiting review. Invoice status is based on that balance and due date; cancellation remains a separate invoice action and does not reverse verified payments. Once an invoice has payment history, its Tenant, property, and lease links cannot be reassigned, it cannot be archived from the financial ledger, and it cannot be hard-deleted. Older archived invoices with payment history remain visible as read-only financial history; no new payments can be recorded for them, and pending submissions can be rejected but not verified. Owners can view invoice balances and payment history for properties they own, but cannot change payment records. Tenants can see their own invoices and submissions.

The payment ledger does not process money online and does not upload receipt files. It stores a receipt link when one is provided. The billing migration preserves existing Paid and Pending Verification invoices as marked historical payment records; the old system did not store an amount per transaction, so those imported entries use the invoice's full amount.

Admin and Manager financial reports can be filtered by invoice due month and show rent invoiced, verified rent collected, and the remaining balance separately.

Verified payment rows offer **Download PDF** in the Tenant, Admin, Manager, and Owner payment views. The acknowledgment identifies the Tenant, property/unit, rental invoice, payment amount/date/method/reference, and verification. Its remaining balance is labeled with the download time, so later partial payments are reflected correctly. Downloads use the existing payment access scope through `GET /api/payments/{id}/acknowledgment/`; pending, rejected, and reversed payments cannot be downloaded. Install ReportLab using the backend setup command above when updating an existing environment.

## Project layout

```text
backend/                 Django project and API
  core/                  Settings and main URL routes
  users/                 Accounts, roles, activity, and system settings
  properties/            Properties, units, inquiries, and applications
  contracts/             Lease contracts
  billing/               Invoices and payment records
  maintenance/           Maintenance requests
frontend/                React and Vite user interface
  src/pages/             Role dashboards and sign-in page
  src/components/        Shared forms, navigation, and workflow sections
  src/services/          Frontend calls to the backend API
```

## Before deployment

The commands above are for local development. Before deploying, set `DJANGO_DEBUG=false`, use a secure `DJANGO_SECRET_KEY`, configure the real host names and database, and review the deployment's security and access settings. Do not commit `.env` files or real passwords to Git.
