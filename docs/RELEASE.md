# リリース手順とストア審査チェックリスト — MasterGame

ポイ活アプリはストア審査（特に iOS）と国内法規の両方が厳しい領域です。
このドキュメントは「何が済んでいて、何が人の判断待ちか」を明示します。

> ⚠ **コードで対応できる部分は実装済みですが、法務確認・アカウント情報・ストア入力は人の作業です。**
> 未対応のまま提出すると審査で落ちます。

---

## 1. リリース前チェックリスト

### 実装済み（コード側の対応が完了しているもの）

| 項目 | 実装 | 根拠 |
|---|---|---|
| **アプリ内アカウント削除** | `/account/delete`（猶予期間つき） | App Store の**必須要件**。無いとリジェクト（0026） |
| 利用規約・プライバシーポリシーの表示 | `/legal/terms` `/legal/privacy` | 未ログインでも閲覧可（0024） |
| 特定商取引法に基づく表記 | `/legal/tokushoho` | 掲示のみ（同意対象ではない）（0024） |
| 年齢確認 | 登録時に生年月日（1度だけ設定可） | 最低年齢未満は登録不可・未成年は保護者案内（0024） |
| 規約改定時の再同意 | `pending_legal_consents()` | 版を記録しているため改定を検知できる（0024） |
| ATT（トラッキング許諾）の説明文 | `app.json` の `NSUserTrackingUsageDescription` | オファーウォールで IDFA を使う場合に**必須**（0024） |
| 輸出コンプライアンス | `usesNonExemptEncryption: false` | 提出のたびの質問を回避（0024） |
| 不要な権限の排除 | Android `blockedPermissions` | 位置情報・録音をライブラリが勝手に追加するのを抑止（0024） |
| ポイント有効期限の告知 | 規約に明記＋失効30日前に通知 | `notify_expiring_points()`（0024） |
| 問い合わせ窓口 | `/support`（アプリ内） | プライバシーポリシーの窓口記載と整合（0027） |
| 不正対策 | 多重アカウント/速度/エミュレータ検知 | 広告主への説明材料にもなる（0021） |

### 人の作業が必要（**未完了**）

| 項目 | 何をするか |
|---|---|
| 🔴 **法務確認** | `legal_documents` の条文は `〔 〕` を含む**下書き**。弁護士確認のうえ運営者名・住所・連絡先・管轄裁判所を実値に差し替える |
| 🔴 **資金決済法の判断** | ポイントが**前払式支払手段**に該当するか。該当する場合は未使用残高に応じた供託等の義務。未交換残高は `/economy` で常時確認できる |
| 🔴 **景品表示法の確認** | 報酬額の表示・「必ずもらえる」等の表現 |
| 🟠 ストアのプライバシー入力 | App Store の App Privacy / Google Play の Data safety。**下記2章の対応表**をそのまま使える |
| 🟠 年齢レーティング | 実際の機能（コミュニティ投稿・広告）に合わせて設定 |
| 🟠 アイコン・スクリーンショット | `assets/` のプレースホルダを差し替え |
| 🟠 審査メモ | テストアカウントと、**アカウント削除の場所**（マイページ→退会）を明記する。審査員が削除機能を見つけられずリジェクトされる事故を防ぐ |
| 🟠 EAS のアカウント設定 | `eas.json` の `REPLACE-ME`（Apple ID / ascAppId / teamId / Play サービスアカウント） |

---

## 2. ストアのプライバシー申告 対応表

実装が実際に何を集めているかの一覧です（`0024` のプライバシーポリシー §1 と対応）。

| データ | 収集 | 用途 | ユーザーに紐づく | トラッキング |
|---|---|---|---|---|
| メールアドレス | ○ | アカウント・本人確認 | ○ | × |
| 生年月日 | ○ | **年齢確認のみ** | ○ | × |
| ユーザー名・プロフィール | ○ | サービス提供 | ○ | × |
| 端末識別子（自己生成） | ○ | **不正検知**（多重アカウント） | ○ | × |
| 端末モデル・OSバージョン | ○ | 不正検知・不具合調査 | ○ | × |
| 利用状況（ミッション達成・ポイント履歴） | ○ | サービス提供・不正検知 | ○ | × |
| 行動イベント（画面表示・タップ） | ○ | 機能改善の分析 | ○ | × |
| プッシュ通知トークン | ○ | 通知配信 | ○ | × |
| IDFA / 広告ID | △ | **提携先の成果照合**（ATT許諾時のみ） | ○ | ○ |
| 位置情報・連絡先・写真 | × | — | — | — |

> IDFA は「トラッキング」に該当します。ATT の許諾を得ていない場合は使用しません。
> オファーウォールを使わない構成なら、この行を外して申告できます。

---

## 3. ビルドと提出

### 前提

```bash
npm i -g eas-cli
eas login
cd apps/mobile
```

### シークレット（リポジトリにコミットしない）

`EXPO_PUBLIC_SUPABASE_ANON_KEY` はクライアントに載る公開値ですが、
プロジェクト固有の値をリポジトリに置かないため EAS のシークレットで渡します。

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>"
# URL は eas.json の env を実値に書き換えるか、同様にシークレット化する
```

`eas.json` の `submit.production.android.serviceAccountKeyPath` が指すファイルは
**コミットしないでください**（`.gitignore` 済み）。

### ビルド

```bash
# 開発ビルド（実機で開発クライアントを使う）
eas build --profile development --platform ios

# 社内配布（QA向け。Android は APK）
eas build --profile preview --platform all

# 本番（ストア提出用。Android は AAB、バージョンは自動インクリメント）
eas build --profile production --platform all
```

### 提出

```bash
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

### OTA 更新（JS のみの修正）

```bash
eas update --branch production --message "fix: ..."
```

> ネイティブ設定（`app.json` の権限・プラグイン）を変えた場合は OTA では反映されません。
> 再ビルドが必要です。

---

## 4. バックエンドの定期実行

本番では以下を日次で回します（`pg_cron` か外部スケジューラ）。
**いずれも初回は `dry_run = true` で対象件数を確認してから本番実行してください。**

```sql
create extension if not exists pg_cron;

-- ポイント失効の予告（30日前）と実行
select cron.schedule('notify-expiring-points', '10 0 * * *',
  $$select public.notify_expiring_points()$$);
select cron.schedule('expire-points', '20 0 * * *',
  $$select public.expire_points(false)$$);

-- 退会の確定（猶予期間を過ぎた申請）
select cron.schedule('process-deletions', '30 0 * * *',
  $$select public.process_account_deletions(false)$$);

-- 行動ログの掃除（保持期間を過ぎた生ログ）
select cron.schedule('purge-events', '40 0 * * *',
  $$select public.purge_app_events(false)$$);

-- ステーキング月次付与
select cron.schedule('accrue-staking-monthly', '10 0 1 * *',
  $$select public.accrue_staking(date_trunc('month', now())::date)$$);
```

Supabase プロジェクトの作成・マイグレーション適用・Edge Function のデプロイ手順は
**[PRODUCTION.md](PRODUCTION.md)** を参照してください。

---

## 5. リリース後に見る画面

| 見るもの | 画面 | 何を判断するか |
|---|---|---|
| ポイント経済 | `/economy` | 配りすぎていないか。**未交換残高（債務）**の伸び |
| 行動分析 | `/analytics` | ミッションのどこで落ちているか。D1/D7・ストリークの効果 |
| 不正検知 | `/fraud` | 多重アカウント・異常な獲得速度 |
| 招待 | `/referrals` | 組織的なファーミングの兆候 |
| お問い合わせ | `/support` | 「ポイント未反映」の傾向（提携先の遅延の早期発見） |
| 退会 | `/deletions` | 解約理由（プロダクト課題の一次情報） |
