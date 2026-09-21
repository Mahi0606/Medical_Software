import { expect, test } from '@playwright/test';
import { checkA11y, login } from './helpers';
const shot = (name: string) => `${process.env.SHOT_DIR ?? 'test-results'}/${name}.png`;

for (const [path, name] of [['/purchase-orders', 'purchase-orders'], ['/purchase-orders?tab=orders', 'purchase-orders-list'], ['/purchase-orders/new', 'purchase-order-new'], ['/messages', 'messages'], ['/messages?tab=refills', 'messages-refills'], ['/messages?tab=settings', 'messages-settings'], ['/exports', 'exports'], ['/exports?kind=einvoice', 'exports-einvoice'], ['/reports?report=analytics', 'analytics'], ['/sync', 'sync']] as const) {
  test(`${name} renders and passes axe`, async ({ page }) => {
    await login(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(900);
    await page.screenshot({ path: shot(name), fullPage: true });
    await checkA11y(page, name);
  });
}

test('direct print dialogs open on labels and bill pages', async ({ page }) => {
  await login(page);
  await page.goto('/labels?batchIds=1:2');
  await expect(page.getByText(/Dolo 650/).first()).toBeVisible();
  await page.getByRole('button', { name: /Print via USB/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: shot('labels-direct-print') });
  await checkA11y(page, 'labels-direct-print');
  await page.keyboard.press('Escape');
  await page.goto('/sales');
  await page.getByRole('link', { name: /INV\// }).first().click();
  await page.getByRole('button', { name: /USB/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: shot('receipt-direct-print') });
});
