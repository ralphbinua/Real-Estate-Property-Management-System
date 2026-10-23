const { chromium } = require('playwright');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const frontendDir = path.resolve(__dirname, '..');
const backendDir = path.resolve(frontendDir, '..', 'backend');
const frontendUrl = 'http://127.0.0.1:15173';
const backendUrl = 'http://127.0.0.1:18000';
const python = process.env.PYTHON_EXECUTABLE || 'python';
const email = 'browser-smoke@example.test';
const password = crypto.randomBytes(24).toString('base64url');
const uiReview = process.argv.includes('--ui-review');
const rentalJourney = process.argv.includes('--rental-journey');
const expenseExportOnly = process.argv.includes('--expense-export-only');
const applicantEmail = 'rental-applicant@example.test';
const reviewRoles = [
  ['Admin', 'admin'], ['Property Manager', 'manager'], ['Agent', 'agent'],
  ['Owner', 'owner'],
];
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-estate-browser-'));
const env = {
  ...process.env,
  BROWSER_TEST_DB: path.join(testDir, 'test.sqlite3'),
  BROWSER_TEST_EMAIL: email,
  BROWSER_TEST_PASSWORD: password,
  DJANGO_DEBUG: 'false',
  DJANGO_SECRET_KEY: crypto.randomBytes(48).toString('hex'),
};
const children = [];

function runPython(args) {
  const result = spawnSync(python, args, {
    cwd: backendDir,
    env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Python setup failed: ${result.error || result.stderr || result.stdout}`);
  }
}

function start(executable, args, cwd) {
  const child = spawn(executable, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { output += chunk.toString(); });
  }
  children.push(child);
  return { child, get output() { return output; } };
}

async function assertPortFree(port) {
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) {
    throw new Error(`Port ${port} is unavailable; stop the process using it before this test.`, { cause: error });
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

async function waitFor(url, server) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      throw new Error(`Server exited before startup:\n${server.output}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* Server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not respond at ${url}:\n${server.output}`);
}

function browserExecutable() {
  if (process.env.BROWSER_EXECUTABLE) return process.env.BROWSER_EXECUTABLE;
  if (process.platform !== 'win32') return undefined;
  const candidates = [
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function reviewWorkspace(page, role, route, reviewDir) {
  await page.locator(`.pm-${route}`).waitFor({ timeout: 10000 });
  await page.getByRole('heading', { level: 1 }).waitFor();
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const theme = await page.evaluate(() => ({
      canvas: getComputedStyle(document.body).backgroundColor,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--app-accent').trim(),
      sidebar: getComputedStyle(document.querySelector('.workspace-sidebar')).backgroundColor,
    }));
    if (theme.canvas !== 'rgb(243, 246, 251)' || theme.accent !== '#2563eb') {
      throw new Error(`${role} is not using the unified SaaS color system at ${width}px.`);
    }
    if (width === 1440 && theme.sidebar !== 'rgb(16, 26, 48)') {
      throw new Error(`${role} desktop sidebar did not adopt the new navigation surface.`);
    }
    if (width === 1440 && await page.locator('.workspace-frame > .workspace-sidebar .workspace-side-icon svg').count() !== await page.locator('.workspace-frame > .workspace-sidebar .workspace-side-link').count()) {
      throw new Error(`${role} sidebar still uses letter badges instead of navigation icons.`);
    }
    await page.screenshot({ path: path.join(reviewDir, `${route}-${width}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`${role} layout overflows ${width}px by ${overflow}px.`);
    if (width === 768 || width === 320) {
      if (await page.locator('.workspace-frame > .workspace-sidebar').isVisible()) throw new Error(`${role} still shows the desktop sidebar.`);
      const tabs = page.getByRole('navigation', { name: 'Primary workspace navigation' });
      if (await tabs.getByRole('button').count() < 4) throw new Error(`${role} is missing primary tabs.`);
      const more = tabs.getByRole('button', { name: 'More' });
      if (await more.count()) {
        await more.click();
        await page.locator('#app-primary-navigation.show').waitFor();
        const backdrop = await page.locator('.app-menu-scrim').boundingBox();
        if (!backdrop || backdrop.height < 300) throw new Error(`${role} More backdrop does not cover the page.`);
        if (width === 320) await page.screenshot({ path: path.join(reviewDir, `${route}-more-320.png`) });
        await tabs.getByRole('button', { name: 'Close' }).click();
      }
      if (width === 320) {
        await page.getByRole('button', { name: 'Account' }).click();
        const accountSheet = page.getByRole('dialog', { name: 'Account' });
        await accountSheet.waitFor();
        if (!(await accountSheet.getByRole('button', { name: 'Sign out' }).isVisible())) throw new Error(`${role} sign out is missing from account.`);
        await page.locator('.app-account-sheet-scrim').click({ position: { x: 8, y: 8 } });
        const secondTab = tabs.getByRole('button').nth(1);
        await secondTab.click();
        if (['admin', 'manager', 'agent'].includes(route)) {
          const label = route === 'agent' ? 'listings' : 'properties';
          await page.getByRole('button', { name: `Search and filter ${label}` }).click();
          await page.getByRole('dialog', { name: `Search and filter ${label}` }).waitFor();
          await page.getByRole('button', { name: 'Close filters' }).click();
        }
        const sectionOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (sectionOverflow > 1) throw new Error(`${role} second section overflows by ${sectionOverflow}px.`);
        await page.screenshot({ path: path.join(reviewDir, `${route}-section-320.png`), fullPage: true });
        await tabs.getByRole('button', { name: 'Overview' }).click();
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log(`PASS: ${role} workspace at 1440px, 768px, and 320px`);
}

async function reviewAdminForms(page, reviewDir) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Add property' }).click();
  const propertyDialog = page.getByRole('dialog', { name: 'Add new property' });
  await propertyDialog.waitFor();
  await page.waitForTimeout(350);
  await propertyDialog.getByLabel('Title', { exact: true }).waitFor();
  await propertyDialog.getByLabel('Unit 1 monthly rent').waitFor();
  const bounds = await propertyDialog.boundingBox();
  if (!bounds || bounds.x < -1 || bounds.x + bounds.width > 321) throw new Error('Property dialog extends beyond the mobile viewport.');
  const propertyScroll = await propertyDialog.locator('.modal-body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  if (propertyScroll < 50) throw new Error('Property dialog body is not scrollable on mobile.');
  await propertyDialog.locator('.modal-body').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: path.join(reviewDir, 'property-form-320.png') });
  await propertyDialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.locator('#app-primary-navigation .workspace-side-link').filter({ hasText: 'User accounts' }).click();
  await page.getByRole('button', { name: 'Add User' }).click();
  const userDialog = page.getByRole('dialog', { name: 'Create New User Account' });
  await userDialog.waitFor();
  await page.waitForTimeout(350);
  await userDialog.getByLabel('Middle name (optional)').waitFor();
  const userBounds = await userDialog.boundingBox();
  if (!userBounds || userBounds.x < -1 || userBounds.x + userBounds.width > 321) throw new Error('User dialog extends beyond the mobile viewport.');
  const userScroll = await userDialog.locator('.modal-body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  if (userScroll < 50) throw new Error('User dialog body is not scrollable on mobile.');
  await userDialog.locator('.modal-body').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: path.join(reviewDir, 'user-form-320.png') });
  await userDialog.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function reviewAdminLeaseViews(page) {
  await selectWorkspaceSection(page, 'admin', 'contracts', 'Lease contracts');
  const view = page.getByLabel('Lease contract view');
  const search = page.getByLabel('Search lease contracts');
  await view.waitFor();
  await search.waitFor();
  if (await view.inputValue() !== 'Active') throw new Error('Admin lease list does not default to Active contracts.');
  const rows = page.locator('#contracts tbody tr');
  await page.locator('#contracts').getByText('Admin Lease Search Fixture').first().waitFor();
  if (await rows.count() !== 1) throw new Error(`Active view should show one lease, got ${await rows.count()}.`);

  await view.selectOption('Pending');
  await rows.getByText('Pending', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#contracts tbody tr').length === 1);
  if (await rows.count() !== 1) throw new Error('Pending view should show one lease.');

  await view.selectOption('History');
  await rows.getByText('Expired', { exact: true }).waitFor();
  await rows.getByText('Terminated', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#contracts tbody tr').length === 2);
  if (await rows.count() !== 2) throw new Error(`History should show expired and terminated leases, got ${await rows.count()}.`);

  await view.selectOption('All');
  await search.fill('A Very Long Example');
  await page.waitForFunction(() => document.querySelectorAll('#contracts tbody tr').length === 4);
  if (await rows.count() !== 4) throw new Error(`Tenant search should return four leases across statuses, got ${await rows.count()}.`);

  await search.fill('no matching tenant query');
  await page.locator('#contracts').getByText('No lease contracts match “no matching tenant query”.').waitFor();
  await search.fill('');
  await page.waitForFunction(() => document.querySelectorAll('#contracts tbody tr').length === 4);
  if (await rows.count() !== 4 || await view.inputValue() !== 'All') {
    throw new Error('Clearing lease search did not restore the selected All view.');
  }
  await selectWorkspaceSection(page, 'admin', 'overview', 'Overview');
  console.log('PASS: Admin lease Active, Pending, History, All, and tenant search views');
}

async function reviewNotifications(page, reviewDir) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Recent notifications' });
  await panel.waitFor();
  const bounds = await panel.boundingBox();
  if (!bounds || bounds.x < -1 || bounds.x + bounds.width > 321) throw new Error('Notification panel extends beyond the mobile viewport.');
  await page.screenshot({ path: path.join(reviewDir, 'notifications-320.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function reviewManagerInquiries(page, reviewDir) {
  await page.route('**/api/properties/inquiries/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const results = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      prospect_name: index === 0 ? 'Alexandra Very Long Prospect Name' : `Prospect ${index + 1}`,
      prospect_email: index === 0 ? 'alexandra.long.address@example.test' : `prospect${index + 1}@example.test`,
      property: 100 + index,
      viewing_at: null,
      agentDetails: { name: 'A Very Long Agent Name' },
      status: 'New',
    }));
    await route.fulfill({ json: { count: results.length, results, next: null, previous: null } });
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole('button', { name: 'More' }).click();
  await page.locator('#app-primary-navigation .workspace-side-link').filter({ hasText: 'Inquiries' }).click();
  await page.waitForFunction(() => !document.getElementById('app-primary-navigation')?.classList.contains('show') && !document.getElementById('app-primary-navigation')?.classList.contains('collapsing'));
  await page.getByRole('heading', { name: 'Inquiry pipeline' }).waitFor();
  await page.getByText('7 inquiries', { exact: true }).waitFor();
  await page.getByText('Alexandra Very Long Prospect Name').waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Manager inquiries overflow mobile viewport by ${overflow}px.`);
  await page.screenshot({ path: path.join(reviewDir, 'manager-inquiries-320.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(reviewDir, 'manager-inquiries-1440.png'), fullPage: true });
}

function seedMaintenanceFixture() {
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from django.contrib.auth import get_user_model; from properties.models import Property, Unit; U=get_user_model(); tenant=U.objects.get(email=os.environ['BROWSER_TEST_EMAIL']); manager=U.objects.get(email='ui-manager@example.test'); home=Property.objects.create(title='Browser maintenance home', address='1 Browser Test Lane', property_type='Apartment', manager=manager); Unit.objects.create(property=home, unit_number='1A', monthly_rate=1000, tenant=tenant)",
  ]);
}

function seedAdminLeaseFixture() {
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "from datetime import date; from django.contrib.auth import get_user_model; from properties.models import Property; from contracts.models import Contract; U=get_user_model(); owner=U.objects.get(email='ui-owner@example.test'); tenant=U.objects.create_user(username='ui_lease_tenant', email='ui-lease-tenant@example.test', first_name='A Very Long Example Name', last_name='For Layout Review', role=U.Role.TENANT); home=Property.objects.create(title='Admin Lease Search Fixture', address='1 Lease Search Lane', property_type='Apartment', owner=owner); [Contract.objects.create(property=home, tenant=tenant, start_date=start, end_date=end, rent_amount=1200, status=status) for status,start,end in [('Active',date(2026,1,1),date(2027,1,1)),('Pending',date(2027,1,1),date(2027,12,31)),('Expired',date(2024,1,1),date(2024,12,31)),('Terminated',date(2023,1,1),date(2023,12,31))] ]",
  ]);
}

function seedExpenseFixture() {
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "from datetime import date; from django.contrib.auth import get_user_model; from properties.models import Property; from billing.models import PropertyExpense; U=get_user_model(); owner=U.objects.get(email='ui-owner@example.test'); manager=U.objects.get(email='ui-manager@example.test'); home=Property.objects.create(title='Browser Expense Export', address='1 Expense Export Lane', property_type='Apartment', owner=owner, manager=manager); PropertyExpense.objects.create(property=home, category='Repairs', amount='123.45', incurred_on=date(2026,10,6), payee='CSV test vendor', reference='EXP-CSV', description='Browser export fixture', created_by=manager)",
  ]);
}

async function verifyExpenseExport(page, role) {
  const sectionLabel = role === 'manager' ? 'Rent ledger' : 'Payments';
  await selectWorkspaceSection(page, role, 'billing', sectionLabel);
  await page.getByRole('heading', { name: 'Property expenses and Owner statement' }).waitFor();
  const propertySelect = page.locator('section[aria-label="Property expenses and Owner statement"] select').first();
  await propertySelect.selectOption({ label: 'Browser Expense Export' });
  const propertyId = await propertySelect.inputValue();
  const exportRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/expenses/export/')) exportRequests.push(request.url());
  });
  const responseWait = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/expenses/export/'
      && url.searchParams.get('propertyId') === propertyId
      && response.request().method() === 'GET';
  });
  const downloadWait = page.waitForEvent('download');
  const button = page.getByRole('button', { name: 'Export expenses CSV' });
  await button.waitFor();
  if (!(await button.isEnabled())) throw new Error(`${role} expense export button is disabled.`);
  console.log(`Checking ${role} expense export for property ${propertyId}.`);
  await button.click();
  const [response, download] = await Promise.all([
    responseWait.catch((error) => { throw new Error(`${role} expense export made no matching API request (${exportRequests.join(', ') || 'none'}).`, { cause: error }); }),
    downloadWait,
  ]);
  if (!response.ok()) throw new Error(`${role} expense export returned HTTP ${response.status()}.`);
  if (!download.suggestedFilename().startsWith('expenses-') || !download.suggestedFilename().endsWith('.csv')) {
    throw new Error(`${role} expense export did not download a date-stamped CSV.`);
  }
  const csv = fs.readFileSync(await download.path(), 'utf8');
  if (!csv.includes('EXP-CSV') || !csv.includes('Browser Expense Export')) {
    throw new Error(`${role} expense CSV is missing property ${propertyId}'s fixture: ${JSON.stringify(csv.slice(0, 400))}`);
  }
  console.log(`PASS: ${role} selected-property expense CSV download`);
}

function seedRentalJourneyFixture() {
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from django.contrib.auth import get_user_model; from properties.models import Property, Unit; U=get_user_model(); password=os.environ['BROWSER_TEST_PASSWORD']; admin=U.objects.create_user(username='rental_admin', email='rental-admin@example.test', password=password, first_name='Rental', last_name='Admin', role=U.Role.ADMIN); owner=U.objects.create_user(username='rental_owner', email='rental-owner@example.test', password=password, first_name='Rental', last_name='Owner', role=U.Role.OWNER); manager=U.objects.create_user(username='rental_manager', email='rental-manager@example.test', password=password, first_name='Rental', last_name='Manager', role=U.Role.PROPERTY_MANAGER); agent=U.objects.create_user(username='rental_agent', email='rental-agent@example.test', password=password, first_name='Rental', last_name='Agent', role=U.Role.AGENT); home=Property.objects.create(title='Acceptance Journey Home', address='1 Acceptance Test Lane', property_type='Apartment', owner=owner, manager=manager, application_approval_mode='Owner'); unit=Unit.objects.create(property=home, unit_number='A-101', monthly_rate=32000, status='Available'); home.assigned_agents.add(agent)",
  ]);
}

function dateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateTimeInputValue(date) {
  return `${dateInputValue(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function sessionApi(page, endpoint, method = 'GET', body) {
  return page.evaluate(async ({ endpoint, method, body }) => {
    const csrfCookie = document.cookie.split('; ').find((cookie) => cookie.startsWith('csrftoken='))?.slice('csrftoken='.length);
    const response = await fetch(`/api${endpoint}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(csrfCookie || '') },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const clone = response.clone();
    const data = await response.json().catch(() => null);
    const raw = data === null ? await clone.text() : '';
    return { status: response.status, data, raw };
  }, { endpoint, method, body });
}

async function expireRentalContract(contractId) {
  env.BROWSER_RENTAL_CONTRACT_ID = String(contractId);
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from datetime import timedelta; from django.utils import timezone; from contracts.models import Contract; contract=Contract.objects.get(pk=os.environ['BROWSER_RENTAL_CONTRACT_ID']); contract.end_date=timezone.localdate()-timedelta(days=1); contract.save(update_fields=['end_date']); renewal=contract.renewal; renewal.proposed_start_date=timezone.localdate(); renewal.save(update_fields=['proposed_start_date'])",
  ]);
}

async function setRentalContractUpcoming(contractId) {
  env.BROWSER_RENTAL_CONTRACT_ID = String(contractId);
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from datetime import timedelta; from django.utils import timezone; from contracts.models import Contract; contract=Contract.objects.get(pk=os.environ['BROWSER_RENTAL_CONTRACT_ID']); contract.end_date=timezone.localdate()+timedelta(days=30); contract.save(update_fields=['end_date'])",
  ]);
}

async function seedTurnoverMaintenance(propertyTitle) {
  env.BROWSER_RENTAL_PROPERTY = propertyTitle;
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from django.contrib.auth import get_user_model; from properties.models import Property; from maintenance.models import MaintenanceRequest; U=get_user_model(); home=Property.objects.get(title=os.environ['BROWSER_RENTAL_PROPERTY']); tenant=U.objects.get(email='rental-applicant@example.test'); MaintenanceRequest.objects.create(property=home, unit=home.units.get(unit_number='A-101'), tenant=tenant, issue_description='Browser turnover repair gate')",
  ]);
}

async function setRentalDeposit(contractId) {
  env.BROWSER_RENTAL_CONTRACT_ID = String(contractId);
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from contracts.models import Contract; contract=Contract.objects.get(pk=os.environ['BROWSER_RENTAL_CONTRACT_ID']); contract.deposit_amount='500.00'; contract.save(update_fields=['deposit_amount'])",
  ]);
}

async function loginAs(browser, role, width) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(10000);
  const page = await context.newPage();
  await page.goto(frontendUrl);
  await page.getByLabel('Email address').fill(`rental-${role}@example.test`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**/${role === 'admin' ? 'admin' : role === 'owner' ? 'owner' : role === 'manager' ? 'manager' : role === 'agent' ? 'agent' : 'tenant'}`, { timeout: 10000 });
  await page.locator(`.pm-${role}`).waitFor({ state: 'visible' });
  if (width !== 1440) await page.setViewportSize({ width, height: 900 });
  return { context, page };
}

async function selectWorkspaceSection(page, role, section, label) {
  const width = await page.evaluate(() => window.innerWidth);
  if (width <= 768) {
    const tabs = page.getByRole('navigation', { name: 'Primary workspace navigation' });
    const primaryTab = tabs.getByRole('button', { name: label, exact: true });
    if (await primaryTab.count()) {
      await primaryTab.click();
    } else {
      const moreButton = tabs.getByRole('button', { name: 'More', exact: true });
      if (await moreButton.count()) {
        await moreButton.click();
        await page.locator('#app-primary-navigation .workspace-side-link').filter({ hasText: label }).click();
      } else {
        throw new Error(`Mobile ${role} navigation has no ${label} tab; rendered buttons: ${(await tabs.getByRole('button').allTextContents()).join(' | ')}`);
      }
    }
  } else {
    await page.locator('.workspace-frame > .workspace-sidebar .workspace-side-link').filter({ hasText: label }).click();
  }
  await page.locator(`.pm-${role}[data-active-section="${section}"]`).waitFor();
}

async function assertNoMobileOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${label} overflows mobile viewport by ${overflow}px.`);
}

async function runRentalJourney(browser, reviewDir) {
  const propertyTitle = 'Acceptance Journey Home';
  const applicantName = 'Rental Journey Applicant';
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const futureDate = dateInputValue(date);

  const agentSession = await loginAs(browser, 'agent', 320);
  const agentPage = agentSession.page;
  await selectWorkspaceSection(agentPage, 'agent', 'listings', 'Listings');
  await agentPage.getByRole('button', { name: 'Inspect Units (1)' }).click();
  await agentPage.locator('.pm-agent .rounded.border').filter({ hasText: 'A-101' }).click();
  await agentPage.screenshot({ path: path.join(reviewDir, 'rental-agent-unit-click-320.png'), fullPage: true });
  const viewingDate = new Date();
  viewingDate.setDate(viewingDate.getDate() + 2);
  const viewingDialog = agentPage.locator('.pm-viewing-modal').filter({ has: agentPage.getByText('Schedule a viewing', { exact: true }) });
  await viewingDialog.waitFor();
  await viewingDialog.getByLabel('Prospect name').fill(applicantName);
  await viewingDialog.getByLabel('Prospect email').fill(applicantEmail);
  await viewingDialog.getByLabel('Viewing date and time').fill(dateTimeInputValue(viewingDate));
  await viewingDialog.getByLabel('Notes').fill('Local browser acceptance viewing.');
  await viewingDialog.getByRole('button', { name: 'Schedule viewing' }).click();
  const prospectRow = agentPage.locator('tr').filter({ hasText: applicantName });
  await prospectRow.waitFor();
  await agentPage.waitForFunction(({ applicantName }) => {
    const row = [...document.querySelectorAll('tr')].find((candidate) => candidate.textContent.includes(applicantName));
    return row?.querySelector('select')?.value === 'Viewing Scheduled';
  }, { applicantName });
  await agentPage.screenshot({ path: path.join(reviewDir, 'rental-agent-viewing-320.png'), fullPage: true });
  await assertNoMobileOverflow(agentPage, 'Agent prospect pipeline');

  await prospectRow.getByRole('button', { name: 'Start application' }).click();
  const applicationDialog = agentPage.locator('.pm-application-modal').filter({ has: agentPage.getByText('Rental application', { exact: true }) });
  await applicationDialog.waitFor();
  await applicationDialog.getByLabel('Employment / occupation').fill('Local acceptance test');
  await applicationDialog.getByLabel('Monthly income (₱)').fill('85000');
  await applicationDialog.getByLabel('Requested move-in date').fill(futureDate);
  await applicationDialog.getByLabel('Application notes').fill('Synthetic browser acceptance data.');
  await applicationDialog.getByRole('button', { name: 'Submit application' }).click();
  await agentPage.getByText(`Rental application submitted for ${applicantName}.`).waitFor();
  await selectWorkspaceSection(agentPage, 'agent', 'applications', 'Applications');
  const applicationRow = agentPage.locator('tr').filter({ hasText: applicantEmail });
  await applicationRow.getByText('Submitted', { exact: true }).waitFor();
  if (await applicationRow.getByRole('button', { name: /approve|reject/i }).count()) {
    throw new Error('Agent application row exposes a decision action.');
  }
  await agentPage.screenshot({ path: path.join(reviewDir, 'rental-agent-application-320.png'), fullPage: true });
  await agentSession.context.close();
  console.log('PASS: Agent viewing and application submission at 320px; no decision controls');

  const managerSession = await loginAs(browser, 'manager', 1440);
  const managerPage = managerSession.page;
  await selectWorkspaceSection(managerPage, 'manager', 'applications', 'Applications');
  let managerApplicationRow = managerPage.locator('tr').filter({ hasText: applicantEmail });
  await managerApplicationRow.getByRole('button', { name: 'Begin review' }).click();
  await managerApplicationRow.getByLabel(`Manager review notes for ${applicantName}`).fill('Reviewed in the local browser journey.');
  await managerApplicationRow.getByRole('button', { name: 'Send to owner' }).click();
  await managerApplicationRow.getByText('Pending Owner Approval', { exact: true }).waitFor();
  if (await managerApplicationRow.getByRole('button', { name: 'Approve', exact: true }).count()) {
    throw new Error('Manager can approve an Owner-decision application in the browser.');
  }
  await managerPage.screenshot({ path: path.join(reviewDir, 'rental-manager-review-1440.png'), fullPage: true });
  console.log('PASS: Manager review stops at Owner decision');

  const ownerSession = await loginAs(browser, 'owner', 320);
  const ownerPage = ownerSession.page;
  await selectWorkspaceSection(ownerPage, 'owner', 'approvals', 'Approvals');
  const ownerApplicationRow = ownerPage.locator('tr').filter({ hasText: applicantEmail });
  await ownerApplicationRow.getByLabel(`Decision notes for ${applicantName}`).fill('Approved in the local browser journey.');
  await ownerApplicationRow.getByRole('button', { name: 'Approve', exact: true }).click();
  await ownerApplicationRow.getByText('Approved', { exact: true }).waitFor();
  await ownerPage.screenshot({ path: path.join(reviewDir, 'rental-owner-approval-320.png'), fullPage: true });
  await assertNoMobileOverflow(ownerPage, 'Owner application approvals');
  console.log('PASS: Owner decision at 320px');

  const adminSession = await loginAs(browser, 'admin', 1440);
  const adminPage = adminSession.page;
  await selectWorkspaceSection(adminPage, 'admin', 'users', 'User accounts');
  await adminPage.getByRole('button', { name: /Add User/ }).click();
  const userDialog = adminPage.getByRole('dialog', { name: 'Create New User Account' });
  await userDialog.waitFor();
  await userDialog.getByLabel('First name').fill('Rental Journey');
  await userDialog.getByLabel('Last name').fill('Applicant');
  await userDialog.getByLabel('Email Address').fill(applicantEmail);
  await userDialog.getByLabel('Password').fill(password);
  await userDialog.getByLabel('Account Role').selectOption('Tenant');
  await userDialog.getByRole('button', { name: 'Create Account' }).click();
  await adminPage.getByLabel('Tenants').getByText(applicantEmail, { exact: true }).waitFor();
  await adminSession.context.close();
  console.log('PASS: Admin creates matching Tenant account');

  const leaseManagerPage = managerPage;
  await leaseManagerPage.reload();
  await leaseManagerPage.locator('.pm-manager').waitFor({ state: 'visible' });
  await selectWorkspaceSection(leaseManagerPage, 'manager', 'applications', 'Applications');
  const approvedRow = leaseManagerPage.locator('tr').filter({ hasText: applicantEmail });
  await approvedRow.getByRole('button', { name: 'Create lease' }).click();
  const leaseDialog = leaseManagerPage.locator('.modal').filter({ has: leaseManagerPage.getByText(`Create lease · ${applicantName}`, { exact: true }) });
  await leaseDialog.waitFor();
  const tenantSelect = leaseDialog.locator('.modal-body .mb-3').filter({ hasText: 'Select tenant account' }).locator('select');
  await tenantSelect.locator('option').filter({ hasText: applicantEmail }).waitFor({ state: 'attached' });
  const tenantOptionValue = await tenantSelect.locator('option').evaluateAll(
    (options) => options.find((option) => option.textContent.includes('rental-applicant@example.test'))?.value || '',
  );
  if (!tenantOptionValue) throw new Error(`Matching Tenant account is not available for lease preparation; options: ${(await tenantSelect.locator('option').allTextContents()).join(' | ')}`);
  await tenantSelect.selectOption(tenantOptionValue);
  const start = new Date();
  start.setDate(1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  await leaseDialog.locator('input[type="date"]').nth(0).fill(dateInputValue(start));
  await leaseDialog.locator('input[type="date"]').nth(1).fill(dateInputValue(end));
  await leaseDialog.getByRole('button', { name: 'Prepare lease' }).click();
  await leaseManagerPage.getByText(`Lease prepared for ${applicantName}. It is pending until all parties sign and an authorized person activates it.`).waitFor();
  console.log('PASS: Manager prepares pending application lease');

  const activationOwnerPage = ownerPage;
  await activationOwnerPage.reload();
  await activationOwnerPage.locator('.pm-owner').waitFor({ state: 'visible' });
  await selectWorkspaceSection(activationOwnerPage, 'owner', 'contracts', 'Lease contracts');
  const pendingLeaseRow = activationOwnerPage.locator('tr').filter({ hasText: applicantEmail });
  await pendingLeaseRow.getByRole('button', { name: 'Record signatures & activate' }).click();
  const activationDialog = activationOwnerPage.locator('.modal').filter({ has: activationOwnerPage.getByText('Activate signed lease', { exact: true }) });
  await activationDialog.waitFor();
  await activationDialog.locator('input[maxlength="500"]').fill('test-only/browser-journey-signed-lease.pdf');
  await activationDialog.locator('#owner-confirm-signed-lease').check();
  await activationDialog.getByRole('button', { name: 'Activate lease' }).click();
  await pendingLeaseRow.getByText('Active', { exact: true }).waitFor();
  await activationOwnerPage.screenshot({ path: path.join(reviewDir, 'rental-owner-activation-320.png'), fullPage: true });
  await assertNoMobileOverflow(activationOwnerPage, 'Owner lease contracts');
  console.log('PASS: Owner activates signed lease at 320px');

  const tenantContext = await browser.newContext({ viewport: { width: 320, height: 900 } });
  const tenantPage = await tenantContext.newPage();
  await tenantPage.goto(frontendUrl);
  await tenantPage.getByLabel('Email address').fill(applicantEmail);
  await tenantPage.getByLabel('Password').fill(password);
  await tenantPage.getByRole('button', { name: 'Sign in' }).click();
  try {
    await tenantPage.waitForURL('**/tenant', { timeout: 10000 });
  } catch {
    throw new Error(`Tenant login did not reach workspace. URL: ${tenantPage.url()}; alerts: ${(await tenantPage.locator('[role="alert"]').allTextContents()).join(' | ')}`);
  }
  await tenantPage.locator('.pm-tenant').waitFor({ state: 'visible' });
  await selectWorkspaceSection(tenantPage, 'tenant', 'lease', 'Lease');
  await tenantPage.getByText(propertyTitle).waitFor();
  await tenantPage.getByText('Active', { exact: true }).waitFor();
  await tenantPage.screenshot({ path: path.join(reviewDir, 'rental-tenant-active-lease-320.png'), fullPage: true });
  await assertNoMobileOverflow(tenantPage, 'Tenant lease view');

  const managerLifecyclePage = leaseManagerPage;
  const lifecycleLeases = await sessionApi(managerLifecyclePage, '/contracts/');
  const lifecycleLease = (Array.isArray(lifecycleLeases.data) ? lifecycleLeases.data : lifecycleLeases.data.results || []).find((item) => item.tenantDetails?.email === applicantEmail);
  if (!lifecycleLease) throw new Error('Could not identify the active synthetic lease before renewal acceptance.');
  await setRentalContractUpcoming(lifecycleLease._id);
  await managerLifecyclePage.reload();
  await managerLifecyclePage.locator('.pm-manager').waitFor({ state: 'visible' });
  await selectWorkspaceSection(managerLifecyclePage, 'manager', 'contracts', 'Leases');
  const managerLeaseRow = managerLifecyclePage.locator('tr').filter({ hasText: applicantName });
  await managerLeaseRow.getByRole('button', { name: 'Propose renewal' }).click();
  const renewalDialog = managerLifecyclePage.locator('.modal').filter({ has: managerLifecyclePage.getByText('Propose lease renewal', { exact: true }) });
  await renewalDialog.waitFor();
  const renewalEnd = new Date(end);
  renewalEnd.setFullYear(renewalEnd.getFullYear() + 1);
  await renewalDialog.locator('input[type="date"]').fill(dateInputValue(renewalEnd));
  await renewalDialog.locator('input[type="number"]').fill('33000');
  await renewalDialog.getByRole('button', { name: 'Save proposal' }).click();
  await managerLeaseRow.getByText('Renewal: Proposed', { exact: false }).waitFor();
  const ownerLifecyclePage = activationOwnerPage;
  await ownerLifecyclePage.reload();
  await ownerLifecyclePage.locator('.pm-owner').waitFor({ state: 'visible' });
  await selectWorkspaceSection(ownerLifecyclePage, 'owner', 'contracts', 'Lease contracts');
  const ownerLeaseRow = ownerLifecyclePage.locator('tr').filter({ hasText: applicantEmail });
  await ownerLeaseRow.getByRole('button', { name: 'Approve renewal' }).click();
  await ownerLeaseRow.getByText('Renewal: Approved', { exact: false }).waitFor();
  const leasesResponse = await sessionApi(managerLifecyclePage, '/contracts/');
  if (leasesResponse.status !== 200) throw new Error(`Manager could not read own lease for lifecycle acceptance: HTTP ${leasesResponse.status}.`);
  const activeLease = (Array.isArray(leasesResponse.data) ? leasesResponse.data : leasesResponse.data.results || []).find((item) => item.tenantDetails?.email === applicantEmail || item.tenant?.email === applicantEmail);
  if (!activeLease) throw new Error(`Could not identify the browser journey lease in the manager list: ${JSON.stringify(leasesResponse.data).slice(0, 500)}`);
  await expireRentalContract(activeLease.id || activeLease._id);
  await managerLifecyclePage.reload();
  await managerLifecyclePage.locator('.pm-manager').waitFor({ state: 'visible' });
  await selectWorkspaceSection(managerLifecyclePage, 'manager', 'contracts', 'Leases');
  const expiredLeaseRow = managerLifecyclePage.locator('tr').filter({ hasText: applicantName });
  await expiredLeaseRow.getByRole('button', { name: 'Prepare next lease' }).click();
  await expiredLeaseRow.getByText(/Next lease #\d+ is waiting for external signatures/).waitFor();
  if (await expiredLeaseRow.getByRole('button', { name: 'Record signatures & activate' }).count()) throw new Error('Manager can activate the manually prepared renewal successor.');
  await ownerLifecyclePage.reload();
  await ownerLifecyclePage.locator('.pm-owner').waitFor({ state: 'visible' });
  await selectWorkspaceSection(ownerLifecyclePage, 'owner', 'contracts', 'Lease contracts');
  const successorRow = ownerLifecyclePage.locator('tr').filter({ hasText: applicantEmail }).filter({ hasText: 'Pending' }).last();
  await successorRow.getByRole('button', { name: 'Record signatures & activate' }).click();
  const successorActivation = ownerLifecyclePage.locator('.modal').filter({ has: ownerLifecyclePage.getByText('Activate signed lease', { exact: true }) });
  await successorActivation.waitFor();
  await successorActivation.getByPlaceholder('File name, document location, or reference').fill('test-only/browser-journey-renewal.pdf');
  await successorActivation.getByPlaceholder('Existing tenancy or offline arrangement').fill('Approved renewal successor from the browser acceptance journey.');
  await successorActivation.locator('#owner-confirm-signed-lease').check();
  const successorActivationResponse = ownerLifecyclePage.waitForResponse((response) => response.url().includes('/activate/') && response.request().method() === 'POST');
  await successorActivation.getByRole('button', { name: 'Activate lease' }).click();
  const activationResult = await successorActivationResponse;
  if (!activationResult.ok()) throw new Error(`Owner renewal successor activation returned HTTP ${activationResult.status()}: ${await activationResult.text()}`);
  const activatedLeases = await sessionApi(ownerLifecyclePage, '/contracts/');
  const activeSuccessor = (Array.isArray(activatedLeases.data) ? activatedLeases.data : activatedLeases.data.results || []).find((item) => item.manualLeaseReference?.startsWith('Lease renewal #') && item.status === 'Active');
  if (!activeSuccessor) throw new Error(`Owner activation succeeded but successor is not Active: ${JSON.stringify(activatedLeases.data).slice(0, 700)}`);
  console.log('PASS: Manager proposes, Owner approves, post-expiry preparation and Owner-only renewal activation');

  await setRentalDeposit(activeSuccessor._id);
  await seedTurnoverMaintenance(propertyTitle);
  const currentOwnerLeaseRow = ownerLifecyclePage.locator('tr').filter({ hasText: applicantEmail }).filter({ hasText: 'Active' }).last();
  await currentOwnerLeaseRow.getByRole('button', { name: 'Inspections and move-out' }).click();
  await currentOwnerLeaseRow.getByLabel('Move-out reason').fill('Browser lifecycle acceptance');
  const moveOutResponse = ownerLifecyclePage.waitForResponse((response) => response.url().includes('/move-out/') && response.request().method() === 'POST');
  await currentOwnerLeaseRow.getByRole('button', { name: 'Start move-out' }).click();
  const moveOutResult = await moveOutResponse;
  if (!moveOutResult.ok()) throw new Error(`Owner move-out returned HTTP ${moveOutResult.status()}: ${await moveOutResult.text()}`);
  await ownerLifecyclePage.getByText('Turnover in progress. The unit remains unavailable until completion.').waitFor();
  await managerLifecyclePage.reload();
  await managerLifecyclePage.locator('.pm-manager').waitFor({ state: 'visible' });
  await selectWorkspaceSection(managerLifecyclePage, 'manager', 'contracts', 'Leases');
  const managerTurnoverRow = managerLifecyclePage.locator('tr').filter({ hasText: applicantName }).filter({ hasText: 'Terminated' }).last();
  await managerTurnoverRow.getByRole('button', { name: 'Inspections and move-out' }).click();
  await managerTurnoverRow.getByLabel('Inspection type').selectOption({ label: 'Move Out' });
  await managerTurnoverRow.getByLabel('walls condition').selectOption({ label: 'Good' });
  await managerTurnoverRow.getByRole('button', { name: 'Save inspection version' }).click();
  await tenantPage.reload();
  await tenantPage.locator('.pm-tenant').waitFor({ state: 'visible' });
  await selectWorkspaceSection(tenantPage, 'tenant', 'lease', 'Lease');
  const moveOutInspections = await sessionApi(managerLifecyclePage, `/contracts/${activeSuccessor._id}/inspection/`);
  const moveOutInspection = Array.isArray(moveOutInspections.data) && moveOutInspections.data.find((item) => item.kind === 'Move Out');
  if (moveOutInspections.status !== 200 || !moveOutInspection) throw new Error(`Manager move-out inspection was not recorded: ${JSON.stringify(moveOutInspections.data)}`);
  const acknowledgement = await sessionApi(tenantPage, `/contracts/${activeSuccessor._id}/inspection-acknowledge/`, 'POST', { inspectionId: moveOutInspection.id });
  if (acknowledgement.status !== 200 || !acknowledgement.data?.tenantAcknowledgedAt) throw new Error(`Tenant inspection acknowledgement failed: HTTP ${acknowledgement.status} ${JSON.stringify(acknowledgement.data)}`);
  await managerLifecyclePage.reload();
  await managerLifecyclePage.locator('.pm-manager').waitFor({ state: 'visible' });
  await selectWorkspaceSection(managerLifecyclePage, 'manager', 'contracts', 'Leases');
  const managerSettlementRow = managerLifecyclePage.locator('tr').filter({ hasText: applicantName }).filter({ hasText: 'Terminated' }).last();
  await managerSettlementRow.getByRole('button', { name: 'Inspections and move-out' }).click();
  await managerSettlementRow.getByLabel('Deposit deductions').fill('100');
  await managerSettlementRow.getByLabel('Deduction reason').fill('Repair cost under review');
  await managerSettlementRow.getByRole('button', { name: 'Request Owner approval' }).click();
  await ownerLifecyclePage.reload();
  await ownerLifecyclePage.locator('.pm-owner').waitFor({ state: 'visible' });
  await selectWorkspaceSection(ownerLifecyclePage, 'owner', 'contracts', 'Lease contracts');
  const ownerSettlementRow = ownerLifecyclePage.locator('tr').filter({ hasText: applicantEmail }).filter({ hasText: 'Terminated' }).last();
  await ownerSettlementRow.getByRole('button', { name: 'Inspections and move-out' }).click();
  await ownerSettlementRow.getByRole('button', { name: 'Approve', exact: true }).last().click();
  await ownerSettlementRow.getByText('Decision: Approved.', { exact: false }).waitFor();
  await managerLifecyclePage.reload();
  await managerLifecyclePage.locator('.pm-manager').waitFor({ state: 'visible' });
  await selectWorkspaceSection(managerLifecyclePage, 'manager', 'contracts', 'Leases');
  const managerCompletionRow = managerLifecyclePage.locator('tr').filter({ hasText: applicantName }).filter({ hasText: 'Terminated' }).last();
  await managerCompletionRow.getByRole('button', { name: 'Inspections and move-out' }).click();
  await managerCompletionRow.getByRole('button', { name: 'Complete turnover' }).click();
  await managerCompletionRow.getByText('Resolve open maintenance work before turnover.').waitFor();
  await managerLifecyclePage.reload();
  await managerLifecyclePage.locator('.pm-manager').waitFor({ state: 'visible' });
  const workOrders = await sessionApi(managerLifecyclePage, '/maintenance/');
  if (workOrders.status !== 200) throw new Error(`Manager maintenance list returned HTTP ${workOrders.status}: ${workOrders.raw}`);
  const openWork = (Array.isArray(workOrders.data) ? workOrders.data : workOrders.data.results || []).find((item) => item.description === 'Browser turnover repair gate' || item.issueDescription === 'Browser turnover repair gate');
  if (!openWork) throw new Error(`Could not find turnover maintenance fixture: ${JSON.stringify(workOrders.data).slice(0, 500)}`);
  const workId = openWork.id || openWork._id;
  const resolveResponse = await sessionApi(managerLifecyclePage, `/maintenance/${workId}/`, 'PATCH', { status: 'Resolved' });
  if (resolveResponse.status >= 300) throw new Error(`Manager could not resolve lifecycle maintenance: HTTP ${resolveResponse.status} ${JSON.stringify(resolveResponse.data)}`);
  await selectWorkspaceSection(managerLifecyclePage, 'manager', 'contracts', 'Leases');
  await managerLifecyclePage.reload();
  await managerLifecyclePage.locator('.pm-manager').waitFor({ state: 'visible' });
  await selectWorkspaceSection(managerLifecyclePage, 'manager', 'contracts', 'Leases');
  const completedTurnoverRow = managerLifecyclePage.locator('tr').filter({ hasText: applicantName }).filter({ hasText: 'Terminated' }).last();
  await completedTurnoverRow.getByRole('button', { name: 'Inspections and move-out' }).click();
  await completedTurnoverRow.getByRole('button', { name: 'Complete turnover' }).click();
  await completedTurnoverRow.getByText('Turnover completed', { exact: false }).waitFor();
  const unitsResponse = await sessionApi(managerLifecyclePage, '/properties/units/');
  const unit = (Array.isArray(unitsResponse.data) ? unitsResponse.data : unitsResponse.data.results || []).find((item) => item.unitNumber === 'A-101');
  if (unit?.status !== 'Available') throw new Error(`Turnover completion did not release the unit: ${JSON.stringify(unit)}`);
  console.log('PASS: Move-out, tenant inspection acknowledgement, Owner settlement, maintenance block and turnover completion');
  await managerSession.context.close();
  await ownerSession.context.close();
  await tenantContext.close();
  console.log('PASS: Tenant sees own active lease at 320px');
}

async function submitMaintenanceRequest(tenantPage) {
  await tenantPage.reload();
  await tenantPage.getByRole('button', { name: 'Report new issue' }).click();
  const issueDialog = tenantPage.getByRole('dialog', { name: 'Report maintenance issue' });
  await issueDialog.waitFor({ timeout: 5000 }).catch(async () => {
    throw new Error(`Maintenance form did not open: ${JSON.stringify(await tenantPage.evaluate(() => ({
      alerts: [...document.querySelectorAll('[role="alert"]')].map((element) => element.textContent),
      modal: document.querySelector('.modal')?.outerHTML.slice(0, 1200),
    })))}`);
  });
  await issueDialog.getByLabel('Select unit').selectOption({ index: 1 });
  await issueDialog.getByLabel('Issue description').fill('Leaking tap in the kitchen');
  const createdResponse = tenantPage.waitForResponse((response) => response.url().endsWith('/api/maintenance/') && response.request().method() === 'POST');
  await issueDialog.getByRole('button', { name: 'Submit ticket' }).click();
  const created = await (await createdResponse).json();
  if (!created._id) throw new Error('Tenant maintenance request was not created.');
  await tenantPage.locator('.workspace-frame > .workspace-sidebar .workspace-side-link').filter({ hasText: 'Maintenance' }).click();
  await tenantPage.getByText('Leaking tap in the kitchen').waitFor();
  return created._id;
}

async function assignMaintenanceRequestInBrowser(adminPage, requestId) {
  await adminPage.locator('.workspace-frame > .workspace-sidebar .workspace-side-link').filter({ hasText: 'Maintenance' }).click();
  const requestRow = adminPage.locator('tr').filter({ hasText: 'Leaking tap in the kitchen' });
  await requestRow.waitFor();
  await requestRow.getByRole('combobox', { name: `Assign maintenance request ${requestId}` }).selectOption({ index: 2 });
  await adminPage.getByText('Maintenance assignment updated.').waitFor();
  await requestRow.locator('select').last().selectOption('In Progress');
  await adminPage.getByText('Maintenance status updated.').waitFor();
  await adminPage.setViewportSize({ width: 320, height: 900 });
  const adminOverflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (adminOverflow > 1) throw new Error(`Admin maintenance queue overflows mobile by ${adminOverflow}px.`);
}

async function verifyTenantMaintenance(tenantPage) {
  await tenantPage.reload();
  await tenantPage.locator('.workspace-frame > .workspace-sidebar .workspace-side-link').filter({ hasText: 'Maintenance' }).click();
  const tenantRow = tenantPage.locator('tr').filter({ hasText: 'Leaking tap in the kitchen' });
  await tenantRow.getByText('In Progress', { exact: true }).waitFor();
  await tenantRow.getByText('A Very Long Example Name For Layout Review').waitFor();
  await tenantPage.setViewportSize({ width: 320, height: 900 });
  const tenantOverflow = await tenantPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (tenantOverflow > 1) throw new Error(`Tenant maintenance log overflows mobile by ${tenantOverflow}px.`);
  await tenantPage.getByRole('button', { name: /^Notifications/ }).click();
  await tenantPage.getByText('Your maintenance request is now in progress.').waitFor();
  await tenantPage.setViewportSize({ width: 1440, height: 900 });
  console.log('PASS: Tenant submission, Admin assignment and status, Tenant tracking and notification');
}

async function main() {
  await assertPortFree(18000);
  await assertPortFree(15173);
  runPython(['manage.py', 'migrate', '--settings=core.browser_test_settings', '--noinput']);
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from django.contrib.auth import get_user_model; U=get_user_model(); U.objects.create_user(username='browser_smoke', email=os.environ['BROWSER_TEST_EMAIL'], password=os.environ['BROWSER_TEST_PASSWORD'], first_name='Browser', last_name='Smoke', role=U.Role.TENANT)",
  ]);
  if (rentalJourney) seedRentalJourneyFixture();
  if (uiReview || expenseExportOnly) {
    runPython([
      'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
      `import os; from django.contrib.auth import get_user_model; U=get_user_model(); roles=${JSON.stringify(reviewRoles)}; [U.objects.create_user(username='ui_'+path, email='ui-'+path+'@example.test', password=os.environ['BROWSER_TEST_PASSWORD'], first_name='A Very Long Example Name', last_name='For Layout Review', role=role) for role,path in roles]`,
    ]);
    seedAdminLeaseFixture();
    seedExpenseFixture();
  }

  const backend = start(python, ['-u', 'manage.py', 'runserver', '127.0.0.1:18000', '--settings=core.browser_test_settings', '--noreload'], backendDir);
  const frontend = start(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.browser-test.config.mjs', '--host', '127.0.0.1', '--port', '15173', '--strictPort'], frontendDir);
  await waitFor(`${backendUrl}/api/auth/csrf/`, backend);
  await waitFor(frontendUrl, frontend);

  const executablePath = browserExecutable();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const reviewDir = path.join(frontendDir, '.ui-review');
    if (uiReview || rentalJourney) fs.mkdirSync(reviewDir, { recursive: true });
    await page.goto(frontendUrl);
    if (uiReview) {
      await page.getByRole('heading', { name: 'Sign in' }).waitFor();
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 900 });
        if (width === 1440 && !(await page.locator('.pm-login-intro').isVisible())) throw new Error('Desktop sign in is missing the new product introduction.');
        if (width === 320 && await page.locator('.pm-login-intro').isVisible()) throw new Error('Mobile sign in still shows the desktop introduction.');
        await page.screenshot({ path: path.join(reviewDir, `login-${width}.png`) });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) throw new Error(`Login page overflows ${width}px by ${overflow}px.`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    if ((!rentalJourney || uiReview) && !expenseExportOnly) {
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL('**/tenant', { timeout: 10000 });
      console.log('PASS: sign in');

      await page.reload();
      await page.getByRole('link', { name: 'Your profile' }).waitFor();
      console.log('PASS: session survives refresh');

      await page.getByRole('link', { name: 'Your profile' }).click();
      await page.waitForURL('**/profile', { timeout: 10000 });
      await page.getByLabel('First name').fill('Verified');
      const patchResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/users/me/') && response.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Save profile' }).click();
      if (!(await patchResponse).ok()) throw new Error('Profile PATCH failed.');
      const profile = await page.request.get(`${frontendUrl}/api/users/me/`);
      if (!profile.ok() || (await profile.json()).first_name !== 'Verified') {
        throw new Error(`Profile was not saved: HTTP ${profile.status()}`);
      }
      await page.locator('.app-account-name').getByText('Verified Smoke').waitFor();
      console.log('PASS: protected profile update');
    }

    let maintenanceRequestId;
    if (uiReview) {
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const cards = await page.locator('.pm-profile-card').all();
        const firstCard = await cards[0].boundingBox();
        const secondCard = await cards[1].boundingBox();
        if (width === 1440 && Math.abs(firstCard.y - secondCard.y) > 2) throw new Error('Desktop account sections are not side by side.');
        if (width === 320 && secondCard.y <= firstCard.y) throw new Error('Mobile account sections do not stack.');
        await page.screenshot({ path: path.join(reviewDir, `profile-${width}.png`), fullPage: true });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) throw new Error(`Profile page overflows ${width}px by ${overflow}px.`);
      }
      await page.locator('.app-brand').click();
      await page.getByRole('navigation', { name: 'Primary workspace navigation' }).getByRole('button', { name: 'Payments' }).click();
      await page.waitForURL('**/tenant?section=payments', { timeout: 10000 });
      await page.getByRole('heading', { name: 'Rent & payments' }).waitFor();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${frontendUrl}/tenant`);
      await reviewWorkspace(page, 'Tenant', 'tenant', reviewDir);
      await reviewNotifications(page, reviewDir);
      seedMaintenanceFixture();
      maintenanceRequestId = await submitMaintenanceRequest(page);
    }

    if (uiReview || expenseExportOnly) {
      const rolesToReview = expenseExportOnly
        ? reviewRoles.filter(([, route]) => ['admin', 'manager', 'owner'].includes(route))
        : reviewRoles;
      for (const [role, route] of rolesToReview) {
        const roleContext = await browser.newContext();
        const rolePage = await roleContext.newPage();
        await rolePage.goto(frontendUrl);
        await rolePage.getByLabel('Email address').fill(`ui-${route}@example.test`);
        await rolePage.getByLabel('Password').fill(password);
        await rolePage.getByRole('button', { name: 'Sign in' }).click();
        await rolePage.waitForURL(`**/${route}`, { timeout: 10000 });
        if (uiReview) await reviewWorkspace(rolePage, role, route, reviewDir);
        if (uiReview && route === 'admin') {
          await reviewAdminLeaseViews(rolePage);
          await reviewAdminForms(rolePage, reviewDir);
          await assignMaintenanceRequestInBrowser(rolePage, maintenanceRequestId);
        }
        if (uiReview && route === 'manager') await reviewManagerInquiries(rolePage, reviewDir);
        if (['admin', 'manager', 'owner'].includes(route)) await verifyExpenseExport(rolePage, route);
        await roleContext.close();
      }
      if (uiReview) {
        await verifyTenantMaintenance(page);
        console.log(`UI screenshots: ${reviewDir}`);
      }
    }

    if (rentalJourney) await runRentalJourney(browser, reviewDir);

    if ((!rentalJourney || uiReview) && !expenseExportOnly) {
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL('**/login', { timeout: 10000 });
      const afterLogout = await page.request.get(`${frontendUrl}/api/users/me/`);
      if (afterLogout.status() !== 403) throw new Error(`Expected 403 after logout, got ${afterLogout.status()}.`);
      await page.goto(`${frontendUrl}/tenant`);
      await page.waitForURL('**/login', { timeout: 10000 });
      console.log('PASS: logout revokes access');
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
    setTimeout(resolve, 2000).unref();
  })));
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedTestDir = path.resolve(testDir);
  if (path.dirname(resolvedTestDir) !== tempRoot || !path.basename(resolvedTestDir).startsWith('real-estate-browser-')) {
    throw new Error('Refusing to remove an unexpected test directory.');
  }
  fs.rmSync(resolvedTestDir, { recursive: true, force: true });
});
