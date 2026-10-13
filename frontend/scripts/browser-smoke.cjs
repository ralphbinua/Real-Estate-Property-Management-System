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

async function main() {
  await assertPortFree(18000);
  await assertPortFree(15173);
  runPython(['manage.py', 'migrate', '--settings=core.browser_test_settings', '--noinput']);
  runPython([
    'manage.py', 'shell', '--settings=core.browser_test_settings', '-c',
    "import os; from django.contrib.auth import get_user_model; U=get_user_model(); U.objects.create_user(username='browser_smoke', email=os.environ['BROWSER_TEST_EMAIL'], password=os.environ['BROWSER_TEST_PASSWORD'], first_name='Browser', last_name='Smoke', role=U.Role.TENANT)",
  ]);

  const backend = start(python, ['-u', 'manage.py', 'runserver', '127.0.0.1:18000', '--settings=core.browser_test_settings', '--noreload'], backendDir);
  const frontend = start(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.browser-test.config.mjs', '--host', '127.0.0.1', '--port', '15173', '--strictPort'], frontendDir);
  await waitFor(`${backendUrl}/api/auth/csrf/`, backend);
  await waitFor(frontendUrl, frontend);

  const executablePath = browserExecutable();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(frontendUrl);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/tenant', { timeout: 10000 });
    console.log('PASS: sign in');

    await page.reload();
    await page.getByRole('button', { name: 'Edit profile' }).waitFor();
    console.log('PASS: session survives refresh');

    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.getByRole('dialog').locator('input').first().fill('Verified');
    const patchResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/users/me/') && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save profile' }).click();
    if (!(await patchResponse).ok()) throw new Error('Profile PATCH failed.');
    const profile = await page.request.get(`${frontendUrl}/api/users/me/`);
    if (!profile.ok() || (await profile.json()).first_name !== 'Verified') {
      throw new Error(`Profile was not saved: HTTP ${profile.status()}`);
    }
    console.log('PASS: protected profile update');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login', { timeout: 10000 });
    const afterLogout = await page.request.get(`${frontendUrl}/api/users/me/`);
    if (afterLogout.status() !== 403) throw new Error(`Expected 403 after logout, got ${afterLogout.status()}.`);
    await page.goto(`${frontendUrl}/tenant`);
    await page.waitForURL('**/login', { timeout: 10000 });
    console.log('PASS: logout revokes access');
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
