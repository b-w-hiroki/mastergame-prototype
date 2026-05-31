# 本番化ランブック — MasterGame

プロトタイプ → 動く MVP1 まで、上から順に実行すれば本番に近い環境が立ち上がります。
コードはすべて用意済み（足場）。**必要なのは各種アカウントと鍵の設定**です。

## 0. 用意するもの（アカウント）

- [ ] Supabase アカウント（無料枠で可）
- [ ] Apple Developer / Google Play（アプリ配布。検証だけなら Expo Go でも可）
- [ ] OAuth：Google Cloud / Apple / LINE Developers（使う分だけ）
- [ ] 広告：AppLovin / Tapjoy / ironSource 等（後工程）
- [ ] Vercel（管理画面ホスティング。任意）

---

## 1. バックエンド（Supabase）

```bash
# CLI（未導入なら）
npm i -g supabase            # もしくは npx supabase ...

# ログイン & プロジェクト作成（ダッシュボードで作成→ref を控える）
supabase login
supabase link --project-ref <PROJECT_REF>

# スキーマ適用（0001〜0011）＋ seed
supabase db push
supabase db execute --file supabase/seed.sql    # もしくは Studio で seed.sql 実行

# Edge Function（postback）
supabase secrets set POSTBACK_SECRET_APPLOVIN=<secret>
supabase functions deploy postback --no-verify-jwt
```

控えておく値（ダッシュボード → Project Settings → API）：
- `Project URL` → `SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `*_ANON_KEY`
- `service_role`（**秘匿**）→ 管理画面・Function のみ

> ローカル検証（Docker 必要）：`supabase start` → `supabase db reset`（migrations+seed 適用）→ `supabase functions serve postback`

### OAuth プロバイダ（Supabase → Authentication → Providers）
- 各プロバイダの Client ID / Secret を設定
- Redirect URL に `https://<ref>.supabase.co/auth/v1/callback` を登録
- アプリのディープリンク `mastergame://auth-callback` を Additional Redirect URLs に追加

---

## 2. モバイルアプリ（Expo）

```bash
cd apps/mobile
cp .env.example .env          # EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
npm install
npm start                     # Expo Go で実機確認

# ストア配布（EAS）
npm i -g eas-cli && eas login
eas build -p ios --profile production
eas build -p android --profile production
eas submit -p ios   # / android
```
- ディープリンク scheme：`mastergame`（`app.json` 設定済み）
- 動作する範囲：サインアップ / ログイン / OAuth / ホーム（残高・ナッジ・ミッション付与）/ 交換

---

## 3. 運営コンソール（Next.js → Vercel）

```bash
cd apps/admin
cp .env.example .env.local     # URL / ANON / SERVICE_ROLE_KEY
npm install && npm run dev     # http://localhost:3000

# Vercel（任意）
vercel
# 環境変数（NEXT_PUBLIC_SUPABASE_URL / ANON / SUPABASE_SERVICE_ROLE_KEY）を Vercel に登録
```
- ダッシュボード集計・ユーザー一覧は `admin_overview` / `admin_user_rows` ビューを参照
- `SUPABASE_SERVICE_ROLE_KEY` は **サーバー専用**（クライアントに露出させない）

---

## 4. 広告ネットワーク連携（収益化）

1. 各ネットワークの SDK をモバイルに統合（動画リワード / オファーウォール）
2. ネットワーク管理画面で **postback URL** を設定：
   ```
   https://<ref>.functions.supabase.co/postback?partner=applovin&transaction_id={TXN}&click_id={CLICK_ID}&sig={HMAC}
   ```
3. `track_click` RPC で発行した `click_id` をオファー遷移時に付与
4. 実 eCPM が取れたら **economy.html** で単価を再計算 → `revenue_benchmarks` / ミッション単価へ反映

詳細：`supabase/functions/README.md`、`docs/specs/*`、`docs/ECONOMY.md`。

---

## 5. Go-live チェックリスト

- [ ] RLS が全テーブルで有効（書き込みは RPC 経由のみ）
- [ ] `service_role` キーが管理画面/Function のサーバー側のみに存在
- [ ] postback の署名検証・冪等性（transaction_id 重複）を実データで確認
- [ ] OAuth リダイレクト（`mastergame://auth-callback`）が実機で通る
- [ ] ポイント経済レート（`app_config.point_yen_rate`）と単価の最終確認
- [ ] **法務**：ポイントに換金性が出る場合の前払式支払手段該当性を専門家レビュー
- [ ] バックアップ / 監視（Supabase ログ・アラート）

---

## 環境変数の一覧

ルートの [`.env.example`](../.env.example) に全変数を集約しています。
