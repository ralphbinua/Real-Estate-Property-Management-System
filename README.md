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

- **Admin:** Manages user accounts, roles, system settings, and system-wide oversight. Admin access does not automatically give authority to make an Owner's property decisions.
- **Property Owner:** Authorizes management of properties they own, provides property information, reviews their properties, and makes decisions reserved to them by the management agreement.
- **Property Manager:** Handles day-to-day work for properties assigned with the Owner's approval. This includes units, tenants, leases, rent records, applications within delegated authority, and maintenance.
- **Agent:** Works with assigned listings and prospective tenants. Agents answer inquiries, arrange viewings, and help with applications, but do not approve or reject them.
- **Tenant:** Uses their own account to view their home and lease, review rent records, submit maintenance requests, and update personal information.

Access and decision authority should follow the written management agreement and applicable local requirements.

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
python -m pip install Django djangorestframework djangorestframework-simplejwt django-cors-headers "psycopg[binary]" python-dotenv
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
| Maintenance requests | `/api/maintenance/` |
| System settings | `/api/settings/` |

Most API requests require a valid sign-in token. The frontend adds it automatically after login.

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