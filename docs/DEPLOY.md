# デプロイ設定一式（公開URLの差し込みまで）

本番アプリ（Expo Web）・運営コンソール（Next.js）を公開し、資料ハブの「公開URL：準備中」を
実URLに差し替えるまでの手順です。**コード・設定は用意済み。必要なのはアカウント連携とシークレット投入だけ**。

> バックエンド（Supabase の作成・`db push`・Edge Function・OAuth）は [`PRODUCTION.md`](PRODUCTION.md) を先に実施してください。
> ここではフロント2アプリのホスティングとハブ反映に絞ります。

## 構成（推奨）

| 対象 | ホスティング | 設定ファイル |
|---|---|---|
| 運営コンソール（Next.js / SSR・Server Actions） | **Vercel** | `apps/admin/vercel.json` |
| 本番アプリ（Expo Web / 静的 SPA・PWA） | **Vercel**（最短）または GitHub Pages（別リポ） | `apps/mobile/vercel.json` |
| 資料ハブ（社内向け） | 現状の GitHub Pages を維持（noindex） | （変更なし） |

> **ドメイン分離の原則**：本番アプリ／コンソールは、社内向け資料ハブ（`*.github.io/mastergame-prototype`、`Disallow: /`）とは
> **別オリジン**に置きます。ハブの `robots.txt` はドメイン全体に効くため、本番アプリを同じ Pages サイトの配下に置かないこと。

---

## 1. 運営コンソール（Next.js → Vercel）

### A. Vercel ダッシュボードから（最短）
1. Vercel で **New Project** → このリポジトリを Import。
2. **Root Directory** に `apps/admin` を指定（`vercel.json` が検出される）。
3. **Environment Variables** を登録：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`（**サーバー専用**。Production スコープのみ）
4. Deploy。発行された URL（例：`https://mastergame-admin.vercel.app`）を控える。

### B. GitHub Actions から（任意・手動実行）
`/.github/workflows/deploy-admin.yml`（`workflow_dispatch`）。実行前に Repo Secrets を登録：
- `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`

Actions タブ → **Deploy Admin (Vercel)** → Run workflow。

---

## 2. 本番アプリ（Expo Web / PWA）

ビルドは `npm run export:web`（= `expo export -p web && node scripts/inject-pwa.mjs`）。出力は `apps/mobile/dist/`。
ビルド時に `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` が必要です。

### 選択肢A：Vercel（推奨・最短）
1. Vercel で **New Project** → Import → **Root Directory** = `apps/mobile`（`vercel.json` で `export:web` → `dist` が設定済み）。
2. Environment Variables：`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`。
3. Deploy → URL（例：`https://mastergame-app.vercel.app`）を控える。

### 選択肢B：GitHub Pages（**別リポジトリ**で）
資料ハブが既存リポの Pages を使用しているため、本番アプリ Pages は**専用リポ**（例：`mastergame-app`）に置きます。
そのリポに以下を置き、`dist/` を Pages へ公開：

```yaml
# .github/workflows/pages.yml（別リポ側）
name: Deploy Web
on: { push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.dep.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npm run export:web
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}
          EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: dep
        uses: actions/deploy-pages@v4
```

> サブパス配信（`user.github.io/repo/`）にする場合は、Expo の `experiments.baseUrl` か `--base-url` を設定してください。

---

## 3. 資料ハブに公開URLを差し込む

`index.html` の本番カード（`<!-- DEPLOY: ... -->` の目印あり）2箇所を更新します：

1. 「公開URL：準備中（デプロイ前）」の文言を実URLに。
2. 「ソースを見る」リンクの `href` を、ソースではなく**本番URL**へ変更（または本番リンクを追加）。
   - `target="_blank" rel="noopener noreferrer"` を維持（外部・別オリジンのため）。
3. ハブは社内向けのまま（`noindex` 維持）。本番アプリは別オリジンなので検索インデックス可。

差し替え後にコミット → main にマージで GitHub Pages に反映されます。

---

## 4. 反映確認

- 運営コンソール：URL にアクセス → ログイン後ダッシュボード集計が表示される。`SUPABASE_SERVICE_ROLE_KEY` 未設定時はエラーメッセージで判別可能。
- 本番アプリ（Web/PWA）：HTTPS で開くと「インストール / ホーム画面に追加」が表示。機内モードで一度開いた画面が表示（オフライン）。
- ハブ：本番カードのリンクが実URLに繋がる。
