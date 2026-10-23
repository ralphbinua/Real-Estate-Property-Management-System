# Admin Lease Views and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admins focus on active leases, keep pending leases actionable, browse terminated lease history, and find leases by tenant or property details.

**Architecture:** Use the existing server-side contract list endpoint for status filtering, search, ordering, and pagination. The Admin page will expose status views and a debounced search field, keeping the selected query parameters when navigating pages. Do not add a new lease status or infer that a lease is inactive solely from its end date.

**Tech Stack:** Django REST Framework, Django ORM, React, React Bootstrap, Playwright browser smoke tests.

**Spec:** In-chat workflow direction confirmed 2026-10-19; see the requirements captured in this plan.

## Global Constraints

- Preserve the role-scoped contract queryset and all current lease permissions.
- Use existing statuses: `Pending`, `Active`, `Terminated`, and `Expired`.
- Filtering must not delete or mutate leases; terminated leases remain available in History and All views.
- Search and sorting must happen before API pagination so results remain ordered across pages.
- Do not add a new dependency.

## Review Focus

1. Default view shows only Active leases, and Pending leases remain one click away for activation or follow-up.
2. Terminated and Expired leases are hidden from the default view but remain visible in History and All.
3. Search matches tenant first name, last name, multi-word full name, email, property title, and unit number.
4. Changing a view or search query resets pagination to page 1; moving between pages retains the query and ordering.
5. Empty search results show an explicit no-match state without changing the selected view.

---

### Task 1: Make contract search handle full tenant names

**Files:**
- Modify: `backend/contracts/views.py`
- Create: `backend/contracts/test_admin_contract_filters.py`

**Interfaces:**
- Consumes the existing `status`, `search`, `ordering`, and `page` query parameters.
- Keeps `GET /api/contracts/` response shape unchanged.

- [x] Write API tests for case-insensitive tenant first/last name, a full name split across fields (for example `Amy Able`), email, property title, and unit number.
- [x] Run `python manage.py test contracts.test_admin_contract_filters --settings=core.test_settings`; confirm the full-name search fails before the fix.
- [x] Tokenize the search string and require each token to match at least one supported field, while preserving the role-scoped base queryset.
- [x] Re-run the focused tests and confirm every search case passes.

### Task 2: Add Admin lease views and tenant search

**Files:**
- Modify: `frontend/src/pages/admin/AdminDashboard.jsx`
- Modify: `frontend/scripts/browser-smoke.cjs`
- Test: `backend/contracts/test_admin_contract_filters.py`

**Interfaces:**
- Sends the selected `status`, debounced `search`, current `ordering`, and `page` values to `fetchContractsPage`.
- View options: `Active` (default), `Pending — needs action`, `History` (Terminated and Expired), and `All contracts` (omit `status`).
- Search placeholder: `Search tenant, email, property, or unit`.

- [x] Add backend tests proving Active and Pending filters return that status, History returns Terminated and Expired, and omitting `status` returns all statuses in the caller’s authorized scope.
- [x] Run the focused API tests and verify the current endpoint handles individual status filters; add the grouped History filter while preserving All behavior.
- [x] Add the view selector and search input to the Lease Contracts toolbar; debounce search by 300 ms and reset to page 1 whenever view or search changes.
- [x] Pass the active view, search term, and selected ordering on initial load and every pagination request.
- [x] Extend the browser smoke test to verify Active is selected by default, Pending and History can be opened, search returns a matching tenant lease, and clearing search restores the selected view.
- [x] Run the focused API tests, `npm run lint`, `npm run build`, and `npm run test:ui`.

### Task 3: Confirm behavior and preserve the existing sorting work

**Files:**
- Review: `backend/contracts/views.py`
- Review: `frontend/src/pages/admin/AdminDashboard.jsx`
- Review: `backend/contracts/test_admin_contract_ordering.py`

**Interfaces:**
- Preserve the server-side `ordering` values already added for Active-first, lease end date, property, and tenant.
- Preserve newest-first behavior for API callers that do not provide `ordering`.

- [x] Verify the selected sort value is sent on the initial request and every pagination request.
- [x] Run `python manage.py test contracts.test_admin_contract_filters contracts.test_admin_contract_ordering --settings=core.test_settings` (8 tests passed).
- [x] Review the final diff to confirm no lease status is changed by filtering, searching, sorting, or paging.

## Acceptance Criteria

- Admin opens Lease Contracts and sees Active leases by default, ordered with the current selected sort.
- Pending leases are clearly accessible as a needs-action view; terminated and expired leases are available in History.
- Admin can search by tenant name (including full name), tenant email, property title, or unit number.
- Search, status view, and ordering are applied server-side and persist across pages.
- Existing contract permissions and statuses remain unchanged.

**Local verification (2026-10-19):** 8 focused Django filter/ordering tests passed; frontend lint and production build passed; the browser UI smoke suite passed, including Admin Active/Pending/History/All views, full-name search, no-match/clear behavior, all role layouts, and the existing rental acceptance journey. Staging and production behavior have not been verified.
