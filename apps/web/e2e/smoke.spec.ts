import { expect, test } from '@playwright/test';
import { checkA11y, login } from './helpers';

const shot = (name: string) => `${process.env.SHOT_DIR ?? 'test-results'}/${name}.png`;

test('login page is accessible and rejects bad credentials', async ({ page }) => {
  await page.goto('/login');
  await checkA11y(page, 'login');
  await page.getByLabel('Username').fill('owner');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/incorrect/i);
  await page.screenshot({ path: shot('login-error') });
});

test('dashboard renders key stats', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good/);
  await expect(page.getByText("Today's sales")).toBeVisible();
  await page.screenshot({ path: shot('dashboard'), fullPage: true });
  await checkA11y(page, 'dashboard');
});

test('billing: search, add, pay cash, save and print', async ({ page }) => {
  await login(page);
  await page.goto('/billing');
  const search = page.getByRole('searchbox', { name: /Search items/ });
  await search.fill('dolo');
  await expect(page.getByRole('button', { name: /^Add Dolo 650/ })).toBeVisible();
  await page.screenshot({ path: shot('billing-search') });
  await search.press('Enter');
  await expect(page.getByRole('list', { name: /Items on this bill/ }).getByText('Dolo 650')).toBeVisible();
  // FEFO picks the soonest-expiring batch, which has little stock: ask for 2 strips, then switch batch from the inline warning
  const qty = page.getByRole('spinbutton', { name: /Quantity of Dolo 650/ });
  await qty.fill('2');
  await expect(page.getByRole('alert').filter({ hasText: /Only .* in this batch/ })).toBeVisible();
  await page.getByRole('button', { name: 'Choose another batch' }).click();
  await page.getByRole('button', { name: /^B2400|^DLE2451/ }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: /Only .* in this batch/ })).toHaveCount(0);
  await expect(page.getByText('Total').last()).toBeVisible();
  await page.keyboard.press('F7'); // cash = total
  await page.screenshot({ path: shot('billing-cart'), fullPage: true });
  await checkA11y(page, 'billing');
  await page.getByRole('button', { name: /Save & print bill/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Bill saved' });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText(/INV\//);
  await page.screenshot({ path: shot('billing-saved') });
});

test('billing: Schedule H1 item is blocked until prescription details are entered', async ({ page }) => {
  await login(page);
  await page.goto('/billing');
  const search = page.getByRole('searchbox', { name: /Search items/ });
  await search.fill('azithral');
  await expect(page.getByRole('button', { name: /^Add Azithral/ })).toBeVisible();
  await search.press('Enter');
  await expect(page.getByText('Prescription details')).toBeVisible();
  await expect(page.getByText(/Still needed|No pharmacist on duty/)).toBeVisible();
  await page.keyboard.press('F7');
  await page.getByRole('button', { name: /Save & print bill/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Schedule H1/ }).first()).toBeVisible();
  await page.screenshot({ path: shot('billing-h1-blocked'), fullPage: true });
});

test('bill detail shows print preview', async ({ page }) => {
  await login(page);
  await page.goto('/sales');
  await page.getByRole('link', { name: /INV\// }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/INV\//);
  await page.getByText('Print preview').click();
  await page.screenshot({ path: shot('sale-detail'), fullPage: true });
  await checkA11y(page, 'sale-detail');
});

test('labels: template preview renders a barcode', async ({ page }) => {
  await login(page);
  await page.goto('/labels');
  await expect(page.getByRole('heading', { name: 'Barcode labels' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.screenshot({ path: shot('labels'), fullPage: true });
  await checkA11y(page, 'labels');
  await page.getByRole('tab', { name: 'Templates' }).click();
  await page.screenshot({ path: shot('labels-templates'), fullPage: true });
});

test('reports: day book and GSTR-1 load', async ({ page }) => {
  await login(page);
  await page.goto('/reports');
  await expect(page.getByText('Collections by mode')).toBeVisible();
  await page.getByRole('button', { name: 'GSTR-1 summary (outward)' }).click();
  await expect(page.getByText('B2C – rate-wise')).toBeVisible();
  await page.screenshot({ path: shot('reports-gstr1'), fullPage: true });
  await checkA11y(page, 'reports');
});
