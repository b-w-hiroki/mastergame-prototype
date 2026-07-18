# 開発ガイド — MasterGame

プロトタイプ（`wireframes/`）の検証を経て、実装に進むためのモノレポ構成です。

```
.
├── index.html            # プロトタイプ確認ハブ（GitHub Pages）
├── wireframes/           # 動作プロトタイプ（HTML） … 仕様の source of truth
├── supabase/             # DB スキーマ・RPC・seed（バックエンド）
│   ├── config.toml
│   ├── migrations/0001_core.sql … 0007_admin.sql
│   └── seed.sql
├── apps/
│   ├── mobile/           # React Native + Expo（ユーザーアプリ）
│   └── admin/            # Next.js（運営コンソール）
└── docs/                 # 仕様書・提案デッキ・本ガイド
```

## 1. バックエンド（Supabase）

```bash
# Supabase CLI: https://supabase.com/docs/guides/cli
supabase start                 # ローカルスタック起動
supabase db reset              # migrations + seed を適用
# 型生成（任意・推奨）
supabase gen types typescript --local > apps/mobile/src/lib/database.types.ts
```

クラウドを使う場合は Supabase でプロジェクト作成 → `supabase link` → `supabase db push`。

### スキーマ概要（仕様書反映）
| ファイル | 内容 |
|---|---|
| 0001_core | profiles / games / user_genres / point_wallets / point_ledger / missions / mission_completions / exchange_items / exchange_requests / VIP(vip_tiers, staking_accruals) |
| 0002_postback | ad_partners / mission_clicks / postback_events / fraud_flags / user_moderation_state |
| 0003_offerwall | ad_networks / offers / offer_completions / ad_impressions / user_daily_offer_counts |
| 0004_community | user_roles / forums / forum_members / topics / posts / reactions / bounty_questions / reports / moderation_actions / notifications |
| 0005_nudge | nudge_events / nudge_cooldowns |
| 0006_functions | apply_points / claim_mission / request_exchange / next_nudge_target（SECURITY DEFINER RPC） |
| 0007_admin | admin_overview / admin_user_rows（運営集計ビュー） |
| 0008_rate | app_config（**point_yen_rate=1000 → 1,000P=1円**）/ points_to_yen() / missions.xp_reward（XPをポイントと分離）/ admin_overview に円換算列を追加 |
| 0009_economy | payout_ratio（還元率50%）/ revenue_benchmarks（収益ベンチ）/ recommended_action_pricing（推奨単価ビュー）。詳細は [ECONOMY.md](ECONOMY.md) |
| 0010_distribution | exchange_items.cost_rate_bps（交換先の実原価率）/ redemption_mix（交換先ミックス）/ effective_cost_rate()・face_to_real_cost()（額面→実コスト＝真の粗利） |
| 0011_postback_rpc | track_click（click_id発行）/ confirm_postback（冪等付与・attribution・状態遷移）。Edge Function `postback` から呼ばれる |

**Edge Functions**：`supabase/functions/postback`（S2S postback受信・HMAC署名検証）。デプロイ手順は [PRODUCTION.md](PRODUCTION.md) / [functions/README](../supabase/functions/README.md)。

**本番化**：手順は **[docs/PRODUCTION.md](PRODUCTION.md)**（Supabase作成→push→functions→OAuth→アプリ/管理デプロイ→広告連携）。

すべて RLS 有効。ポイント残高・台帳の書き込みは SECURITY DEFINER の RPC 経由のみ。

## 2. モバイルアプリ（Expo）

```bash
cd apps/mobile && npm install && cp .env.example .env
npm start
```
詳細は [apps/mobile/README.md](../apps/mobile/README.md)。

## 3. 運営コンソール（Next.js）

```bash
cd apps/admin && npm install && cp .env.example .env.local
npm run dev   # http://localhost:3000
```
詳細は [apps/admin/README.md](../apps/admin/README.md)。

## プロトタイプ ↔ 実装の対応

| プロトタイプ画面 | 実装の入口 |
|---|---|
| core-flow ホーム/ミッション | `apps/mobile/app/index.tsx` → `claim_mission` / `next_nudge_target` RPC |
| core-flow ログイン | `apps/mobile/app/login.tsx` → `supabase.auth` |
| admin ダッシュボード | `apps/admin/app/page.tsx` → `admin_overview` ビュー |

> ステータス：実装は **足場（scaffold）**。主要フローを動く形で用意し、残りは同じパターンで拡張します。

## 経済オペレーション（0017 で追加した service_role RPC）

いずれも `service_role`（Edge Function / 運営コンソール / スケジュール実行）から呼びます。付与はすべて冪等キー付き `apply_points` を通ります。

| 用途 | 呼び出し |
|---|---|
| ステーキング月次付与 | `select accrue_staking(date_trunc('month', now())::date);`（`(user,period)` で冪等） |
| 交換の確定（コード付与） | `select fulfill_exchange('<request_id>', '<code>');`（運営コンソール「交換申請」からも操作可） |
| 交換の取消（返金＋在庫戻し） | `select cancel_exchange('<request_id>', 'reason');` |
| オファーウォール確定 | Edge Function `offer-postback` → `confirm_offer(...)`（日次上限 `app_config.daily_offer_cap`、既定20） |
| 通知の既読化（ユーザー） | `select mark_notification_read('<id>');`（`authenticated`） |

### ステーキングの定期実行（pg_cron 例）

```sql
create extension if not exists pg_cron;
-- 毎月1日 00:10 UTC に当月分を付与
select cron.schedule('accrue-staking-monthly', '10 0 1 * *',
  $$select public.accrue_staking(date_trunc('month', now())::date)$$);
```

### Edge Function シークレット

- ミッション postback：`POSTBACK_SECRET_<PARTNER>`（署名 `partner:txn:click_id:reward:timestamp`）
- オファー postback：`OFFER_SECRET_<NETWORK>`（署名 `network:network_txn_id:user_id:reward:timestamp`）

いずれも `X-Timestamp` ±300s のリプレイ対策付き。`.env.example` を参照。
