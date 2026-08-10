# 本番化ランブック — MasterGame

プロトタイプ → 動く MVP1 まで、上から順に実行すれば本番に近い環境が立ち上がります。
コードはすべて用意済み（足場）。**必要なのは各種アカウントと鍵の設定**です。

> フロント2アプリ（運営コンソール／本番アプリWeb）のホスティングと、資料ハブへの公開URL差し込みは
> [`DEPLOY.md`](DEPLOY.md) にまとめています（Vercel 設定・CIワークフロー・URL差し替え手順）。

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

# スキーマ適用（0001〜0018）＋ seed
supabase db push
supabase db execute --file supabase/seed.sql    # もしくは Studio で seed.sql 実行

# Edge Functions（ミッション postback / オファーウォール postback）
# パートナー/ネットワークごとに secret を設定（共通鍵フォールバックは無し）
supabase secrets set POSTBACK_SECRET_SANDBOX=<secret>       # seed の sandbox パートナー
supabase secrets set OFFER_SECRET_APPLOVIN=<secret>
supabase functions deploy postback       --no-verify-jwt
supabase functions deploy offer-postback --no-verify-jwt
supabase functions deploy send-push      --no-verify-jwt   # プッシュ配信（service_role 認可）
```

> **プッシュ通知（Expo）**：モバイルは起動時に `register_push_token` で Expo push token を保存します。
> 実配信には Expo プロジェクト（`app.json` の `extra.eas.projectId`）と、iOS は APNs 鍵 / Android は FCM 設定が必要です。
> 配信は `send-push` Edge Function（`Authorization: Bearer <service_role>`）に `{user_id,title,body}` を POST。

適用後の検証（マイグレーション/権限/seed が入ったか。セキュリティ不変条件も REST 越しに再確認）：

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_ROLE_KEY=<service_role> \
  npm run check:supabase
```

運用（定期実行）：

```sql
-- ステーキング月次付与（Supabase の Scheduled Functions / pg_cron 等で）
select cron.schedule('accrue-staking-monthly', '10 0 1 * *',
  $$select public.accrue_staking(date_trunc('month', now())::date)$$);
```

管理者権限：運営コンソールに入れるのは `app_metadata.role='admin'` のユーザー、または
`ADMIN_EMAILS`（管理画面の env、カンマ区切り）に含まれるメールのみ。

控えておく値（ダッシュボード → Project Settings → API）：
- `Project URL` → `SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `*_ANON_KEY`
- `service_role`（**秘匿**）→ 管理画面・Function のみ

> ローカル検証（Docker 必要）：`supabase start` → `supabase db reset`（migrations+seed 適用）→ `supabase functions serve postback` / `offer-postback`
> DB の不変条件テストは Docker 不要：`PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres bash supabase/tests/run.sh`

### ステージング環境（推奨構成）

本番と同じ手順で **もう1つの Supabase プロジェクト**を作り、そこへ同じ migrations/seed を適用します。
アプリ側は環境ごとに env を切り替えるだけ（コード変更不要）。

| 対象 | 本番 | ステージング |
|---|---|---|
| Supabase | 本番プロジェクト | 別プロジェクト（`supabase link --project-ref <staging_ref>` → `db push`） |
| 運営コンソール (Vercel) | Production 環境変数 | Preview 環境変数（`NEXT_PUBLIC_SUPABASE_*` をステージング値に） |
| モバイル (Expo) | 本番 `.env` | `EXPO_PUBLIC_SUPABASE_*` をステージング値にした別ビルド/チャンネル |

各プロジェクト適用後に `npm run check:supabase`（上記）で設定を検証してから配信します。

### スモークチェックが見ているもの

`scripts/check-supabase.mjs` は**実プロジェクトに対して REST 越しに**以下を確認します。
ローカルのDBテストとは別物で、「PostgREST 経由で本当にその通り動くか」を見る唯一の手段です。

| 分類 | 内容 |
|---|---|
| 公開カタログ | `missions` / `exchange_items` / `vip_tiers` が anon で読める |
| **登録前に見せる面** | `game_hub_rows` / `current_legal_documents` / `games` が anon で読める |
| **漏れてはいけないもの** | `app_config`（粗利構造・各種上限）/ `fraud_settings` / `revenue_benchmarks` / `ad_partners` / `app_events` / `fraud_flags` / `user_roles` が anon から読めない |
| 内部RPC | `apply_points` / `process_account_deletions` / `expire_points` / `support_user_context` / `resolve_fraud_flag` 等が anon から実行できない |
| 認証必須RPC | `claim_daily_streak` / `create_inquiry` / `record_events` / `register_device` 等が未ログインで通らない |
| マイグレーション適用 | 0021〜0029 の各テーブル/ビューが存在する（**ブラウザ経由で古い `setup_all.sql` を流した場合ここで落ちる**） |
| **法務文書の下書き検出** | 公開中の規約類に `〔` が残っていないか（差し替え漏れのままリリースするのを防ぐ） |

> `game_hub_rows` は権限剥孤の副作用で一度壊した実績があるため、**実環境での確認を必ず通してください**。

### ステージングで通しで確認する手順

1. Supabase でステージング用プロジェクトを作成
2. `supabase link --project-ref <staging_ref>` → `supabase db push`
   （ブラウザだけで済ませたい場合は `supabase/setup_all.sql` を SQL Editor に貼って実行）
3. `SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-supabase.mjs`
4. Edge Function をデプロイ（`postback` / `offer-postback` / `send-push`）
5. アプリの env をステージング値にして、実アカウントで
   **サインアップ → ミッション達成 → 連続ログイン → 交換申請 → 問い合わせ → 退会** を一周する
6. 運営コンソールを同じ値に向け、`/economy` `/analytics` `/fraud` `/support` が表示できることを確認

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
