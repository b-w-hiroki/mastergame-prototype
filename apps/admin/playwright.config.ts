import { defineConfig, devices } from '@playwright/test';

// 認証ゲート（middleware + requireAdmin）の E2E。
// ダミー env で起動しても未ログインは /login にリダイレクトされることを検証する
// （実 Supabase は不要：セッションクッキーが無ければ getUser は user=null）。
const PW_EXECUTABLE = process.env.PW_EXECUTABLE; // ローカルは /opt/pw-browsers/chromium を指定
const port = Number(process.env.PLAYWRIGHT_PORT ?? '3101');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PLAYWRIGHT_PORT');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    ...(PW_EXECUTABLE ? { launchOptions: { executablePath: PW_EXECUTABLE } } : {}),
  },
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key-for-e2e',
    },
  },
});
