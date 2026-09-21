import { test } from '@playwright/test';
import { login } from './helpers';
const shot = (name: string) => `${process.env.SHOT_DIR ?? 'test-results'}/${name}.png`;

test('billing in dark mode and at tablet width', async ({ page }) => {
  await login(page);
  await page.goto('/billing');
  const search = page.getByRole('searchbox', { name: /Search items/ });
  await search.fill('pan');
  await page.getByRole('button', { name: /^Add Pan 40/ }).click();
  await page.getByRole('button', { name: /Switch to dark mode/ }).click();
  await page.screenshot({ path: shot('billing-dark') });
  await page.getByRole('button', { name: /Switch to light mode/ }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: shot('billing-1024') });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: shot('billing-768'), fullPage: true });
});
