import { test, expect } from '@playwright/test';

// 認証ゲート：未ログインでは保護ページに入れず /login へ飛ぶこと。
test.describe('admin auth gate', () => {
  test('unauthenticated / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: '運営ログイン' })).toBeVisible();
  });

  test('protected route (/missions) also redirects to /login', async ({ page }) => {
    await page.goto('/missions');
    await expect(page).toHaveURL(/\/login$/);
  });

  // 運営専用データを扱う新しい画面もゲートされていること
  // （/economy は未交換残高＝債務、/fraud はユーザーの不正判定を表示するため漏洩の影響が大きい）
  for (const path of ['/economy', '/fraud', '/referrals', '/games', '/deletions', '/support']) {
    test(`protected route (${path}) redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test('/login renders email & password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.getByRole('button', { name: /ログイン/ })).toBeVisible();
  });

  test('login labels are associated (for/id) — a11y', async ({ page }) => {
    await page.goto('/login');
    // ラベルクリックで対応する入力にフォーカスが移る＝for/id が正しく紐づいている
    await page.getByText('メールアドレス').click();
    await expect(page.locator('#login-email')).toBeFocused();
  });
});
