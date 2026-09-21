import { expect, test } from '@playwright/test';
import { checkA11y, login } from './helpers';
const shot = (name: string) => `${process.env.SHOT_DIR ?? 'test-results'}/${name}.png`;

test('major interaction blocks the bill until a reason is recorded', async ({ page }) => {
  await login(page);
  await page.goto('/billing');
  const search = page.getByRole('searchbox', { name: /Search items/ });
  await search.fill('restyl');
  await page.getByRole('button', { name: /^Add Restyl/ }).click();
  await expect(page.getByRole('list', { name: /Items on this bill/ }).getByText('Restyl 0.5')).toBeVisible();
  await search.fill('ultracet');
  await page.getByRole('button', { name: /^Add Ultracet/ }).click();
  await expect(page.getByText(/Major interaction/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Save & print bill/ })).toBeDisabled();
  await page.screenshot({ path: shot('billing-interaction'), fullPage: true });
  await checkA11y(page, 'billing-interaction');
  await page.getByRole('button', { name: /record reason and continue/ }).click();
  await page.getByRole('textbox', { name: 'Reason' }).fill('Prescriber confirmed both on phone');
  await page.getByRole('button', { name: 'Save reason' }).click();
  await expect(page.getByText('Pharmacist reason recorded')).toBeVisible();
});

test('billing works offline and syncs when back online', async ({ page, context }) => {
  await login(page);
  await page.goto('/billing');
  await page.waitForTimeout(4500); // offline copy downloads shortly after the shell mounts
  await context.setOffline(true);
  const search = page.getByRole('searchbox', { name: /Search items/ });
  await search.fill('crocin');
  await page.getByRole('button', { name: /^Add Crocin/ }).click();
  await expect(page.getByRole('list', { name: /Items on this bill/ }).getByText('Crocin Advance')).toBeVisible();
  await expect(page.getByText(/Offline – bills saved on this device/)).toBeVisible();
  await page.keyboard.press('F7');
  await page.getByRole('button', { name: /Save & print bill/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Bill saved' });
  await expect(dlg).toContainText(/Saved offline as INV-C1\//);
  await page.screenshot({ path: shot('billing-offline-saved') });
  await page.getByRole('button', { name: 'New bill' }).click();
  await expect(page.getByText(/1 to sync/)).toBeVisible();
  await context.setOffline(false);
  await page.goto('/sync');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Nothing waiting')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/INV-C1\//).first()).toBeVisible();
  await page.screenshot({ path: shot('sync-page'), fullPage: true });
  await checkA11y(page, 'sync');
});

test('interaction rules page lists the starter set', async ({ page }) => {
  await login(page);
  await page.goto('/interactions');
  await expect(page.getByText(/warfarin/i).first()).toBeVisible();
  await page.screenshot({ path: shot('interactions'), fullPage: true });
  await checkA11y(page, 'interactions');
});
