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
| プッシュ通知トークン登録 | `select register_push_token('<expo_token>', 'ios');`（`authenticated`。アプリ起動時に自動） |
| プッシュ配信 | Edge Function `send-push`（service_role）に `{user_id,title,body,data?}` を POST → `push_tokens` を引いて Expo Push API へ |

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

## テスト（DB 不変条件）

セキュリティ・経済ロジックの不変条件を、使い捨てDBに全マイグレーション＋seedを適用して検証します（CI の `db-tests` ジョブで自動実行）。

```bash
# 素の Postgres（ローカル or CI service）に対して実行
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres \
  bash supabase/tests/run.sh
```

- `supabase/tests/00_harness.sql` … auth shim（素のPGでも動く）＋ アサーションヘルパ（`test.ok/eq/raises`）
- `supabase/tests/10_security_test.sql` … 権限剥奪・claim冪等・在庫アトミック・台帳不変
- `supabase/tests/20_economy_test.sql` … postback冪等/取消・staking・offer冪等/日次上限・fulfill/cancel・bounty二重付与防止
- `supabase/tests/30_push_test.sql` … push トークンの upsert/付け替え/本人限定削除・RPC権限
- `supabase/tests/40_fraud_test.sql` … 端末登録・多重アカウント/エミュレータ/速度検知・重複起票抑制・凍結/BAN・権限
- `supabase/tests/50_analytics_test.sql` … 日次集計の欠測日埋め・経路別内訳・未交換残高・交換率/ゼロ除算・権限

各テストは `begin; … rollback;` で隔離。アサーション失敗（`RAISE EXCEPTION`）で非0終了します。

## ポイント経済の可視化（0022）

`admin_overview` は累計しか持たず、日次の推移も発行に対する交換の比率も、
**未交換残高（＝将来の支払債務）** も見えませんでした。ポイ活は配布過多が即赤字になるため、
運営コンソールの **ポイント経済** 画面（`/economy`）で常時監視します。

| ビュー | 内容 |
|---|---|
| `economy_daily` | 日次の発行/消費/交換/参加者（直近60日）。取引ゼロの日も 0 行で埋めてグラフが歪まないようにする |
| `economy_by_reason` | 経路別の内訳（直近30日）。想定外の経路の急伸＝設定ミスか不正の入口 |
| `economy_liability` | **未交換残高**（額面 / 円 / 実コスト見込み / 保有者数） |
| `admin_economy_summary` | 上記＋交換率・1人あたり発行額・実効原価率・還元率を1行に |

- 実コストは 0010 の交換先ミックス（`face_to_real_cost`）を通した「実際に出ていく金額」。額面ではありません。
- 直近7日の発行ペースが30日実績を2割以上上回ると画面上で警告を出します。
- 全ビューは `security_invoker` + クライアントロールから `revoke`（service_role 専用）。

> **未交換残高は法務の論点でもあります。** ポイントが資金決済法の前払式支払手段に該当する場合、
> 基準日の未使用残高に応じて供託等の義務が生じ得ます（要法務確認）。KPIとして常時見えるようにしてあります。

## 不正検知（0021）

ポイ活の収益源は広告主の CPA 報酬なので、不正ユーザーの混入は「広告主に切られる＝事業が止まる」
直接のリスクになります。API の穴（無限鋳造・連打・在庫レース）は 0013 で塞いだため、
0021 が対象にするのは **正規 API を正しく叩く不正ユーザー** です。

| 検知 | 仕組み | 起票 |
|---|---|---|
| `multi_account` | `user_devices` に端末↔アカウントを記録し、同一 `device_id` のアカウント数を数える | 閾値超で `fraud_flags`、さらに上位閾値で `moderation_state='marked'` |
| `velocity` | `apply_points`（全付与が通る唯一の隘路）から直近1時間の獲得回数/ポイントを検査 | 回数超過=medium / ポイント超過=high |
| `emulator` | アプリが `expo-device` の `isDevice=false` を申告 | medium |

- **閾値は `fraud_settings` テーブルで調整**（マイグレーション不要）。
  `multi_account_warn` / `multi_account_mark` / `velocity_count_1h` / `velocity_points_1h` / `flag_cooldown_minutes`。
- 同一ユーザー・同一種別の未解決フラグは `flag_cooldown_minutes`（既定24h）内は再起票しない＝レビューキューが溢れない。
- 検知は **絶対に付与を壊さない**：`apply_points` 内の検知呼び出しは例外を握りつぶす（監視が落ちても経済は回る）。
- 自動処分は `marked`（レビュー目印。獲得はブロックしない）まで。**凍結/BAN は運営判断**＝
  運営コンソールの「不正検知」画面から `resolve_fraud_flag(flag_id, 'dismiss'|'freeze'|'ban')`。
  `frozen`/`banned` は `confirm_postback` / `confirm_offer` の両方で付与がブロックされます。

> **限界**: `device_id` はクライアント申告値であり「シグナル」であって証拠ではありません（再インストールでリセット）。
> それでも「同じ端末でアカウントを作り直して初回ボーナスを取り直す」という最頻の不正パターンには有効です。
> 端末の真正性を厳密に取るには DeviceCheck(iOS) / Play Integrity(Android) のアテステーション導入が必要です（次段の強化）。

## マイグレーション方針

- **前進のみ（forward-only）**。down/ロールバックスクリプトは用意しない。誤りは新しい番号の
  マイグレーションで訂正する（`point_ledger` は追記専用＝0013 のトリガで UPDATE/DELETE 禁止）。
- ローカル検証は `supabase db reset`（全マイグレーション再適用）で行う。
- 破壊的操作を含むマイグレーション（例: 0013 の権限剥奪、0015 の `apply_points` 置換）を
  本番適用する前に、`apply_points` を service_role 以外から直接呼ぶバッチが無いことを確認する。

> **仕様書との差分**：`docs/specs/*.md` は初期設計時の想定スキーマ（例: `point_ledger` の
> `entry_type`/`reverses_entry_id`、`offer_completions.idempotency_key`）を含み、実装
> （`delta`/`reason`/`ref_type`/`ref_id` ＋ 0015 の `idempotency_key`）とは一部一致しません。
> 正となるのは **`supabase/migrations/`（実装）** です。
