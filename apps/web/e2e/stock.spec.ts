import { expect, test } from '@playwright/test';
import { checkA11y, login } from './helpers';
const shot = (name: string) => `${process.env.SHOT_DIR ?? 'test-results'}/${name}.png`;

for (const [path, name] of [['/items', 'items'], ['/items/1', 'item-detail'], ['/inventory?view=expired', 'inventory-expired'], ['/inventory?view=expiring', 'inventory-expiring'], ['/purchases', 'purchases'], ['/purchases/new', 'purchase-new'], ['/purchases/1', 'purchase-detail'], ['/purchases/returns?supplierId=1', 'purchase-return']] as const) {
  test(`${name} page renders and passes axe`, async ({ page }) => {
    await login(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot(name), fullPage: true });
    await checkA11y(page, name);
  });
}

test('items list searches and opens the new item form', async ({ page }) => {
  await login(page);
  await page.goto('/items');
  await expect(page.getByText('Dolo 650')).toBeVisible();
  await page.getByRole('button', { name: /New item/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('item-form'), fullPage: true });
  await checkA11y(page, 'item-form');
});
