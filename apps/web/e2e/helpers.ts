import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function login(page: Page, username = 'owner', password = 'owner1234') {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** WCAG 2.1 A/AA scan; fails on serious/critical violations. */
export async function checkA11y(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('canvas').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (serious.length) console.log(`[axe:${context}]`, JSON.stringify(serious.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })), null, 1));
  expect(serious, `${context}: serious/critical accessibility violations`).toEqual([]);
  return results.violations;
}
