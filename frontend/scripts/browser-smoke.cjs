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
    if (width === 768) {
      const tabletMenu = page.getByRole('button', { name: 'Toggle navigation' });
      await tabletMenu.click();
      await page.waitForFunction(() => document.getElementById('app-primary-navigation')?.classList.contains('show'));
      const backdrop = await page.locator('.app-menu-scrim').boundingBox();
      if (!backdrop || backdrop.height < 700) throw new Error(`${role} tablet menu backdrop does not cover the page.`);
      await page.mouse.click(24, 128);
      if (await tabletMenu.getAttribute('aria-expanded') !== 'false') throw new Error(`${role} tablet menu backdrop did not close navigation.`);
    }
    if (width === 320) {
      if (await page.locator('.workspace-frame > .workspace-sidebar').isVisible()) {
        throw new Error(`${role} still shows a second mobile navigation bar.`);
      }
      const menu = page.getByRole('button', { name: 'Toggle navigation' });
      await menu.click();
      if (await menu.getAttribute('aria-expanded') !== 'true') throw new Error(`${role} mobile navigation did not open.`);
      const panel = page.locator('#app-primary-navigation');
      const links = panel.locator('.workspace-side-link');
      await page.waitForFunction(() => document.getElementById('app-primary-navigation')?.classList.contains('show'));
      await links.first().waitFor();
      const panelBox = await panel.boundingBox();
      if (!panelBox || panelBox.width < 280 || panelBox.height < 400 || panelBox.x < -1) {
        throw new Error(`${role} mobile menu did not expand into a usable panel.`);
      }
      if (!(await panel.getByRole('link', { name: 'Your profile' }).isVisible())) throw new Error(`${role} profile is missing from the mobile menu.`);
      await page.screenshot({ path: path.join(reviewDir, `${route}-menu-320.png`) });
      const secondLink = links.nth(1);
      const previousHeading = await page.getByRole('heading', { level: 1 }).textContent();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      if (!(await secondLink.evaluate((element) => element === document.activeElement))) {
        throw new Error(`${role} mobile navigation is not keyboard reachable.`);
      }
      const focusOutline = await secondLink.evaluate((element) => getComputedStyle(element).outlineStyle);
      if (focusOutline === 'none') throw new Error(`${role} navigation focus is invisible.`);
      await secondLink.click();
      if (await menu.getAttribute('aria-expanded') !== 'false') throw new Error(`${role} mobile navigation did not close after selection.`);
      if (await secondLink.getAttribute('aria-current') !== 'page') throw new Error(`${role} selected section is not announced.`);
      await page.waitForFunction(() => !document.getElementById('app-primary-navigation')?.classList.contains('show') && !document.getElementById('app-primary-navigation')?.classList.contains('collapsing'));
      await page.waitForFunction((heading) => document.querySelector('h1')?.textContent !== heading, previousHeading);
      await page.screenshot({ path: path.join(reviewDir, `${route}-section-320.png`), fullPage: true });
      const sectionOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (sectionOverflow > 1) throw new Error(`${role} second section overflows by ${sectionOverflow}px.`);
      await menu.click();
      await links.first().click();
      await page.waitForFunction(() => !document.getElementById('app-primary-navigation')?.classList.contains('show') && !document.getElementById('app-primary-navigation')?.classList.contains('collapsing'));
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
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
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

async function reviewNotifications(page, reviewDir) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
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
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
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

async function main() {
  await assertPortFree(18000);
  await assertPortFree(15173);
  runPython(['manage.py', 'migrate', '--settings=core.browser_test_settings', '--noinput']);
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from django.contrib.auth import get_user_model; U=get_user_model(); U.objects.create_user(username='browser_smoke', email=os.environ['BROWSER_TEST_EMAIL'], password=os.environ['BROWSER_TEST_PASSWORD'], first_name='Browser', last_name='Smoke', role=U.Role.TENANT)",
  ]);
  if (uiReview) {
    runPython([
      'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
      `import os; from django.contrib.auth import get_user_model; U=get_user_model(); roles=${JSON.stringify(reviewRoles)}; [U.objects.create_user(username='ui_'+path, email='ui-'+path+'@example.test', password=os.environ['BROWSER_TEST_PASSWORD'], first_name='A Very Long Example Name', last_name='For Layout Review', role=role) for role,path in roles]`,
    ]);
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
    if (uiReview) fs.mkdirSync(reviewDir, { recursive: true });
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
      await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await page.locator('#app-primary-navigation .workspace-side-link').filter({ hasText: 'Rent & payments' }).click();
      await page.waitForURL('**/tenant?section=payments', { timeout: 10000 });
      await page.getByRole('heading', { name: 'Rent & payments' }).waitFor();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${frontendUrl}/tenant`);
      await reviewWorkspace(page, 'Tenant', 'tenant', reviewDir);
      await reviewNotifications(page, reviewDir);
    }

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login', { timeout: 10000 });
    const afterLogout = await page.request.get(`${frontendUrl}/api/users/me/`);
    if (afterLogout.status() !== 403) throw new Error(`Expected 403 after logout, got ${afterLogout.status()}.`);
    await page.goto(`${frontendUrl}/tenant`);
    await page.waitForURL('**/login', { timeout: 10000 });
    console.log('PASS: logout revokes access');

    if (uiReview) {
      for (const [role, route] of reviewRoles) {
        const roleContext = await browser.newContext();
        const rolePage = await roleContext.newPage();
        await rolePage.goto(frontendUrl);
        await rolePage.getByLabel('Email address').fill(`ui-${route}@example.test`);
        await rolePage.getByLabel('Password').fill(password);
        await rolePage.getByRole('button', { name: 'Sign in' }).click();
        await rolePage.waitForURL(`**/${route}`, { timeout: 10000 });
        await reviewWorkspace(rolePage, role, route, reviewDir);
        if (route === 'admin') await reviewAdminForms(rolePage, reviewDir);
        if (route === 'manager') await reviewManagerInquiries(rolePage, reviewDir);
        await roleContext.close();
      }
      console.log(`UI screenshots: ${reviewDir}`);
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
