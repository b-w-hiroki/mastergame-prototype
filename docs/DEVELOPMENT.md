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
- `supabase/tests/60_referral_test.sql` … 自己招待/二重利用/同一端末/古アカ/BAN の拒否・マイルストーン確定・日次上限・権限
- `supabase/tests/70_legal_test.sql` … 規約の版管理と再同意・年齢確認（最低年齢/1度だけ/未成年）・ポイント失効と予告通知
- `supabase/tests/80_game_hub_test.sql` … タイトル別掲示板の自動生成/冪等・1タイトル1掲示板・フォロー・フィードの絞り込み
- `supabase/tests/90_deletion_test.sql` … 退会の申請/取消/確定・匿名化・**台帳が消えないこと**・退会後の付与ブロック・再登録検知
- `supabase/tests/95_support_test.sql` … 問い合わせの作成/返信・日次上限・他人への返信拒否・運営回答と通知・対応コンテキスト
- `supabase/tests/96_analytics_events_test.sql` … バッチ送信/件数上限/イベント名検証・ファネル（連打で歪まない）・D1リテンション・保持期間

> ランナーは `*_test.sql` を広く拾います（以前は `[0-9]*_test.sql` だったため、命名が
> 数字で始まらないテストが**黙ってスキップ**されていました）。0件なら失敗させます。

各テストは `begin; … rollback;` で隔離。アサーション失敗（`RAISE EXCEPTION`）で非0終了します。

## 行動イベント計測（0028）

0022 で「配りすぎていないか」は見えるようになりましたが、**「効いているか」が見えません**でした。
持っている数字が台帳だけだったため、ミッションの**どこで落ちているか**も、
**D1/D7 リテンション**も測れず、改善のループが回らない状態でした。

| 要素 | 内容 |
|---|---|
| `app_events` | 行動イベント。`(name, created_at)` と `(user_id, created_at)` の2軸に索引 |
| `record_events` | **バッチ送信**（1件ずつ通信すると電池と通信を無駄にする）。件数上限とイベント名の形式検証つき |
| `analytics_daily` | DAU / イベント数 / セッション数の日次（無取引日も0で埋める） |
| `mission_funnel` | 表示→タップ→達成。**ユーザー数ベース**で見る（イベント数だと連打で歪む） |
| `retention_cohorts` | 登録日コホートの D1 / D7 / D30 復帰率 |
| `purge_app_events` | 保持期間（既定90日）を過ぎた生ログの削除。既定は dry run |

- アプリ側 `src/lib/analytics.ts` は**計測でアプリを壊さない**ことを最優先にしています。
  送信失敗時はイベントを捨てずにバッファへ戻し（オフラインでも復帰後に届く）、
  上限超過分は**古い方から**捨てます（直近の行動のほうが分析価値が高い）。
  送信中の再入では二重送信しません。
- バックグラウンド移行時に flush し、未送信イベントを次回起動まで滞留させません。
- 運営コンソールの **行動分析**（`/analytics`）で DAU 推移・ファネル・コホートを確認できます。
  タップしたのに達成が確定しない割合が高い場合は警告を出します。

> 生ログは放置すると際限なく膨らみます。長期の推移が必要なら、
> `purge_app_events` の前に日次集計を別テーブルへ退避してください。

## 問い合わせ・カスタマーサポート（0027）

0024 のプライバシーポリシーには「お問い合わせ窓口」を明記したのに、アプリからの導線も
運営側の受け皿もありませんでした。

**ポイ活の CS は「ポイントが反映されない」が大半**を占めます。この種の問い合わせは、
運営が該当ユーザーの台帳・postback・オファー確定状況を見られれば即答できますが、
それが無いと1件ごとに DB を手で漁ることになり運用が破綻します。

| 要素 | 内容 |
|---|---|
| `inquiries` / `inquiry_messages` | スレッド形式の問い合わせ。書き込みは RPC 経由のみ（`is_staff` を偽装させない） |
| `create_inquiry` / `reply_to_inquiry` | ユーザー側。連投対策の日次上限つき（`app_config.inquiry_daily_cap`） |
| `answer_inquiry` / `close_inquiry` | 運営側。回答で通知を飛ばし、**担当者個人は露出させない**（`author_id` を残さない） |
| **`support_user_context`** | **対応に必要な材料を1発で引く** — 残高・直近の増減・**未確定オファー**・却下 postback・未解決の不正フラグ・退会状況 |

- ユーザーが返信すると `answered` → `open` に戻します（回答済みのまま埋もれさせない）。
- 運営コンソールの **お問い合わせ**（`/support`）でスレッドを開くと、上記コンテキストが
  自動表示されます。未確定オファーがあれば「反映されないの最頻の原因」として警告を出します。

## アカウント削除・退会（0026）

**App Store は 2022 年から「アカウントを作成できるアプリは、アプリ内でアカウント削除も提供すること」を
必須要件にしています。無いと審査で落ちます。** 加えて 0024 のプライバシーポリシーには
「退会後は速やかに削除します」と書いてあるのに実装が無く、文書と実態が矛盾していました。

### なぜ物理削除ではなく「匿名化」なのか

`point_ledger` をはじめ多くのテーブルが `auth.users` を **`on delete cascade`** で参照しています。
素朴に `auth.users` を削除すると **台帳ごと消えて会計が壊れます**（発行済みポイントの記録が消え、
経済KPIも監査証跡も失われる）。台帳は追記専用として設計してあるので、ここで消してはいけません。

| データ | 扱い |
|---|---|
| メール・生年月日・プロフィール | 削除／無効化（`auth.users.email` は無効ドメインへ退避しログイン不能に） |
| プッシュトークン・ジャンル・フォロー・通知 | 物理削除 |
| 保有ポイント | **失効**。台帳に負の確定エントリ（`account_closed`）として記録 |
| 投稿・トピック | 残す（消すとスレッドが壊れる）。表示名は profiles 由来なので匿名化で特定不能になる |
| `point_ledger` | **残す**（会計記録・追記専用） |
| `legal_acceptances` | **残す**（いつどの版に同意したかの法的証跡） |
| `user_devices` | **残す**（「退会→再登録」での初回ボーナス荒稼ぎ検知に必要） |

### 猶予期間と運用

- 既定7日の猶予後に確定（`app_config.account_deletion_grace_days`）。誤操作と勢いでの退会を救います。
  ストア要件は「アプリ内で削除を**開始**できること」なので猶予付きで問題ありません。
- `process_account_deletions(p_dry_run)` … **既定は dry run**。service_role 専用、pg_cron 等で日次実行。
- 退会後に遅れて届いた postback / オファー確定は `deleted` 状態で**ブロック**します
  （失効済み残高が復活してしまうため。`confirm_postback` / `confirm_offer` のガードに追加）。
- 退会済みアカウントのある端末で再登録すると `rejoin_after_deletion` を起票します。
  **ブロックはしません**（家族の共有端末など正当なケースがあるため、運営がレビューする材料として残す）。
- 運営コンソールの **退会**（`/deletions`）で申請状況・失効予定ポイント・退会理由を確認できます。

## ゲームハブ（0025）

「MasterGame」という名前でありながら、コミュニティは汎用のトピック/投稿でしかなく、
**「ゲーマー向け」である必然性がプロダクトに出ていませんでした**。ポイ活アプリは無数にあるので、
差別化はここでしか作れません。**ゲームタイトルを軸にコミュニティを構造化**します。

`forums` にはもともと `type='game'` と `game_id` 列があったのに使われておらず、
seed の `eldia-guild` も `game_id` が NULL のままでした。その設計を実際に動かしたのが 0025 です。

| 要素 | 内容 |
|---|---|
| `games` の拡充 | 説明・プラットフォーム・パブリッシャー・リリース日・注目フラグ |
| `ensure_game_forum()` | タイトルごとの掲示板を用意し `forums.game_id` で紐づける（冪等） |
| `trg_game_forum` | **タイトルを追加すると掲示板が自動生成される**。`game_id` の UNIQUE で1タイトル1掲示板を保証 |
| `user_games` | タイトルのフォロー。ポイントが動かないので RLS で直接読み書きさせる（RPC 必須にしない） |
| `game_hub_rows` | 一覧用（フォロワー数・投稿数・最終更新） |
| `my_game_feed()` | **フォロー中タイトルのトピックだけ**を流すフィード。汎用の新着一覧との差はここ |

- アプリは `/games`（一覧・フォロー）と `/games/[slug]`（タイトルの掲示板）、
  コミュニティタブの先頭に「フォロー中のゲーム」フィードを置いています。
- 運営コンソールの **ゲームタイトル**（`/games`）でタイトルを追加でき、掲示板は自動で付いてきます。
- ゲーム情報は公開情報なので `anon` にも `SELECT` を許可（登録前に「どんなゲームがあるか」を見せたい）。
  一方 `user_games`（誰が何をフォローしているか）は本人限定です。

> seed はゲーム別掲示板を手で作りません（トリガが作るため、手で作ると1タイトル2掲示板になります）。

## 法務・ストア審査対応（0024）

> ⚠ **公開前に必ず弁護士の確認を受けてください。** 0024 が用意するのは**仕組みと雛形**であり、
> 条文は `〔 〕` のプレースホルダを含む下書きです。運営者名・住所・連絡先・管轄裁判所を
> 実際の値に置き換え、ポイントが**資金決済法の前払式支払手段**に該当するか、景品表示法上の
> 表示が適切かは個別に判断が必要です。

### 規約の版管理と同意

- `legal_documents`（slug: `terms` / `privacy` / `tokushoho`）に**本文をDBで保持**。
  規約は改定されるものなので、アプリを再配布せず差し替えられるようにしてあります。
- `legal_acceptances` に「誰が・どの文書の・**どの版に**・いつ」同意したかを記録。
  改定時に `pending_legal_consents()` が未同意として返すため、再同意を求められます。
- 特商法表記は `requires_consent = false`（掲示のみで同意対象ではない）。
- 規約類は**未ログインでも読める**必要があるため、RLS ポリシーに加えて
  `anon` への `SELECT` GRANT も付けています（ポリシーだけでは権限不足で読めません）。

### 年齢確認

- `profiles.date_of_birth` は `set_date_of_birth()` で**1度だけ**設定可能
  （後から書き換えて年齢制限を回避させない）。
- `min_age`（既定13）未満は拒否し、**生年月日を保存しません**。
- `adult_age`（既定18）未満は `is_minor` を返し、アプリ側で保護者向けの案内を表示します。
- アプリ側の `src/lib/age.ts` でも同じ判定を先出しします（登録してから弾かれるのを避けるため）。
  「2月31日」のような存在しない日付は `Date` が繰り上げるので、生成後に一致を確認して弾いています。

### ポイント有効期限

- 最終ポイント利用（`point_wallets.updated_at`）から `point_expiry_months`（既定12ヶ月）で失効。
- `notify_expiring_points()` … `point_expiry_notice_days`（既定30日）前に予告通知。同一失効日には重複通知しない。
- `expire_points(p_dry_run)` … **既定は dry run**。本番投入前に対象件数とポイント数を確認できます。
  失効も台帳に**負の確定エントリ**として記録され（追記専用を維持）、冪等キーに失効月を含めて二重計上を防ぎます。
- どちらも service_role 専用。pg_cron 等で日次実行してください。

### ストア審査（app.json）

- **`NSUserTrackingUsageDescription`** … オファーウォールの成果照合で IDFA を使う場合、
  ATT の説明文が無いと iOS の審査で弾かれます。
- `usesNonExemptEncryption: false` … 提出のたびに輸出コンプライアンスを聞かれるのを防ぎます。
- Android は `AD_ID` / `POST_NOTIFICATIONS` を明示し、位置情報・録音は `blockedPermissions` で
  ライブラリが勝手に追加するのを止めています（不要な権限はストア審査とインストール率の両方に響きます）。

## 招待・リファラル（0023）

招待はポイ活の主要な成長エンジンですが、**同時に最も荒らされやすい導線**でもあります。
自己招待・捨てアカウント量産・端末を変えないままの多重取得が典型で、対策の無い招待機能は
不正の入口そのものになります。そのため 0021 の不正検知と連動させ、多層で守っています。

| 対策 | 実装 |
|---|---|
| 自己招待の禁止 | RPC で拒否＋ `referrals` の CHECK 制約（DBレベルでも不可） |
| 1アカウント1回だけ被招待 | `referee_id` を UNIQUE。競合時も `unique_violation` を捕まえて二重付与しない |
| **同一端末の招待を拒否** | `user_devices`（0021）を突き合わせ、共有端末なら拒否＋`fraud_flags` に high で起票 |
| 既存アカウントの刈り取り防止 | 登録から `referral_max_age_days`（既定7日）以内のみ被招待可 |
| 大量ファーミングの抑制 | 招待者の日次上限 `referral_referrer_daily_cap`（既定10） |
| **捨てアカウント対策** | 招待者への報酬は被招待者が `referral_milestone_points` を稼いでから確定 |
| BAN/凍結 | 申込時・確定時の両方で再確認（保留中に処分された場合は払わない） |

- 報酬額・閾値はすべて `app_config` で調整（マイグレーション不要）。
- 確定判定は `claim_mission` の成功時に走ります。「ミッションを達成した＝実際にアプリを使った」を
  条件にし、**最も荒らされやすい postback / offer 経路はあえて確定トリガーに使いません**。
- 運営コンソールの **招待**（`/referrals`）で一覧と「招待数が多いユーザー」を確認できます。
  自動で止まらない「多数の端末を使い分けた組織的ファーミング」はここで人が見ます。

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
