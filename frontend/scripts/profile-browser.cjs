const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const frontendDir = path.resolve(__dirname, '..');
const baseUrl = 'http://127.0.0.1:15174';
const roles = ['Admin', 'Property Manager', 'Agent', 'Owner', 'Tenant'];

function browserExecutable() {
  if (process.env.BROWSER_EXECUTABLE) return process.env.BROWSER_EXECUTABLE;
  if (process.platform !== 'win32') return undefined;
  return [
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => fs.existsSync(candidate));
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Vite exited early.');
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch { /* Waiting for Vite. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Vite did not start.');
}

async function main() {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15174', '--strictPort'], {
    cwd: frontendDir,
    stdio: 'ignore',
  });
  let browser;
  try {
    await waitForServer(vite);
    const executablePath = browserExecutable();
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    for (const role of roles) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let profile = { _id: 1, name: 'Browser Smoke', first_name: 'Browser', last_name: 'Smoke', email: 'browser@example.test', role };
      await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/users/me/') {
          if (route.request().method() === 'PATCH') {
            profile = { ...profile, ...route.request().postDataJSON() };
            profile.name = [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ');
          }
          await route.fulfill({ json: profile });
        } else if (url.pathname === '/api/auth/email/change/') {
          const { new_email: newEmail, current_password: currentPassword } = route.request().postDataJSON();
          if (currentPassword !== 'test-password') throw new Error(`Email password missing for ${role}.`);
          profile = { ...profile, email: newEmail };
          await route.fulfill({ json: { detail: 'Your email address was updated.', profile } });
        } else if (url.pathname === '/api/settings/') {
          await route.fulfill({ json: { system_name: 'Test Workspace' } });
        } else {
          await route.fulfill({ json: [] });
        }
      });
      await page.goto(`${baseUrl}/profile`);
      await page.getByRole('link', { name: 'Your profile' }).waitFor();
      await page.getByLabel('First name').fill('Verified');
      await page.getByLabel('Middle name (optional)').fill('Marie');
      await page.getByLabel('Phone number (optional)').fill('+63 917 123 4567');
      await page.getByRole('button', { name: 'Save profile' }).click();
      await page.getByText('Your profile was updated.').waitFor();
      await page.locator('.app-account-name').getByText('Verified Marie Smoke').waitFor();
      if (profile.first_name !== 'Verified' || profile.middle_name !== 'Marie' || profile.phone_number !== '+63 917 123 4567' || profile.role !== role) throw new Error(`Profile update failed for ${role}.`);
      await page.locator('#new-email').fill(`updated-${roles.indexOf(role)}@example.test`);
      await page.locator('#email-current-password').fill('test-password');
      await page.getByRole('button', { name: 'Change email' }).click();
      await page.getByText('Your email address was updated.').waitFor();
      if (await page.locator('#profile-email').inputValue() !== profile.email) throw new Error(`Email update failed for ${role}.`);
      await context.close();
      console.log(`PASS: ${role} profile`);
    }
  } finally {
    if (browser) await browser.close();
    if (vite.exitCode === null && vite.signalCode === null) vite.kill();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
