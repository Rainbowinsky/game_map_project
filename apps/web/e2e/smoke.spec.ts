import { expect, test } from '@playwright/test';

test('shows the Phase 1 application shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Fantasy Map Editor' })).toBeVisible();
  await expect(page.getByText('P3 authentication API is ready')).toBeVisible();
});
