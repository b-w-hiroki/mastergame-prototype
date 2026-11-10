import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Isolated static demo only. No real rewards, accounts or database calls.
for (const width of [320, 390]) {
  test(`demo exchange boundary at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(resolve('../../wireframes/core-flow.html')).href);
    await expect(page.getByText('操作デモ・架空のポイントです。')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('entry.png') });
    await page.evaluate('go("points")');
    expect(await page.locator('#points').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('#itemgrid .item').first().click();
    expect(await page.locator('#sheet').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator('#sheet')).toContainText('実際の報酬の配送・換金は行いません');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('confirmation.png') });
    // Dismiss through backdrop, then simulate the stale former button callback.
    await page.locator('#overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
    await page.evaluate('exchange(0)');
    expect(await page.evaluate('balance')).toBe(125000);
    await page.locator('#itemgrid .item').first().click();
    await page.getByRole('button', { name: 'このアイテムと交換する' }).click();
    await expect(page.locator('#cong-title')).toHaveText('実際の報酬は届きません');
    await page.evaluate('exchange(0)');
    expect(await page.evaluate('balance')).toBe(45000);
    expect(await page.evaluate('exchangeRequests.length')).toBe(1);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('completion.png') });
    await page.locator('#congrats .ok').click();
    await page.evaluate('go("points")');
    await page.locator('#itemgrid .item').first().click();
    await expect(page.getByRole('button', { name: 'ポイントが不足しています' })).toBeDisabled();
    await page.evaluate('exchange(0)');
    expect(await page.evaluate('balance')).toBe(45000);
  });
}
