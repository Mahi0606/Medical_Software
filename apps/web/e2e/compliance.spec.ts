import { expect, test } from '@playwright/test';
import { checkA11y, login } from './helpers';
const shot = (name: string) => `${process.env.SHOT_DIR ?? 'test-results'}/${name}.png`;

for (const [path, name] of [['/suppliers', 'suppliers'], ['/customers', 'customers'], ['/doctors', 'doctors'], ['/registers?register=H1', 'registers'], ['/audit', 'audit'], ['/settings', 'settings-store'], ['/settings?tab=licences', 'settings-licences'], ['/settings?tab=users', 'settings-users'], ['/settings?tab=backup', 'settings-backup']] as const) {
  test(`${name} page renders and passes axe`, async ({ page }) => {
    await login(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot(name), fullPage: true });
    await checkA11y(page, name);
  });
}

test('customer detail opens with ledger', async ({ page }) => {
  await login(page);
  await page.goto('/customers?id=1');
  await expect(page.getByText('Suresh Iyer').first()).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('customer-detail'), fullPage: true });
  await checkA11y(page, 'customer-detail');
});
