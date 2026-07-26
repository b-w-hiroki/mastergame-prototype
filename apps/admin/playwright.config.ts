import { defineConfig, devices } from '@playwright/test';

// 認証ゲート（middleware + requireAdmin）の E2E。
// ダミー env で起動しても未ログインは /login にリダイレクトされることを検証する
// （実 Supabase は不要：セッションクッキーが無ければ getUser は user=null）。
const PW_EXECUTABLE = process.env.PW_EXECUTABLE; // ローカルは /opt/pw-browsers/chromium を指定

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    ...(PW_EXECUTABLE ? { launchOptions: { executablePath: PW_EXECUTABLE } } : {}),
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key-for-e2e',
    },
  },
});
