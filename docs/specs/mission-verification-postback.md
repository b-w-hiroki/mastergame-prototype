# ミッション達成のサーバー検証(postback) 機能仕様書

> 対象プロダクト: MasterGame（ポイ活 × ゲームコミュニティ、運営: 株式会社クリティカルヒット）
> 対象MVP: MVP1（検証基盤・状態遷移）/ MVP2〜3（高度な不正検知）
> 技術前提: Supabase（Postgres / Auth / Realtime / Storage / Edge Functions=Deno）、管理画面=Next.js、モバイル=React Native + Expo
> ステータス: ドラフト v1.0 / 最終更新 2026-05-31

---

## 1. 目的・提供価値

### 1.1 解決する課題
MasterGame のコアループは「ミッション達成 → ポイント付与 → 報酬交換」である。ミッション達成の判定をクライアント（モバイルアプリ）の自己申告に任せると、改ざん・自動化・多重アカウントによりポイントを不正に獲得できてしまう。

広告主・ゲーム会社は「**不正コンバージョンには金を払わない**」。したがって、達成をサーバー側で検証し、検証済みの達成にのみポイントを付与する仕組みは、BtoB（広告掲載・送客）の信頼を成立させる前提条件である。これが無ければ単価交渉も継続契約も成立しない。

### 1.2 提供価値
| ステークホルダー | 価値 |
|---|---|
| MasterGame運営 | 不正流出を抑え、広告主に「検証済みコンバージョン」を提示できる。報酬精算（翌々月末）の根拠となる監査可能な台帳を持つ。 |
| 広告主 / ゲーム会社 | 自前の達成イベント（インストール/課金/レベル到達等）をS2Sで送れば、不正を除いた正味の成果に対してのみ費用が発生する。 |
| ユーザー | 「判定中 → 確定」が透明に可視化され、正当な達成が確実にポイント化される。 |

### 1.3 設計原則
- **サーバー権威**: ポイント付与の真実はサーバー側の台帳（point_ledger）にのみ存在する。クライアントは表示のみ。
- **冪等（idempotent）**: 同じpostbackが何度届いても、付与は一度だけ。
- **追記専用台帳**: 残高は台帳の集計で導出。取消は逆仕訳（reversal）で表現し、過去行は上書きしない（イミュータブル）。
- **後付け不可の土台**: 状態遷移と台帳はMVP1で最初から組み込む。不正検知ルールのみ後から拡張できる構造にする。

---

## 2. ユーザーストーリー

### 2.1 ユーザー視点
- US-U1: ユーザーとして、ミッション（記事を読む / Xを見る / ゲームをインストール・プレイ）を達成したら、アプリ上で「判定中」と表示され、検証完了後に自動でポイントが確定してほしい。手動申告の手間や不安をなくしたい。
- US-U2: ユーザーとして、判定中がいつまで続くのか（目安時間）と、確定 / 却下の理由がわかるようにしてほしい。
- US-U3: ユーザーとして、不正と誤判定された場合に問い合わせができ、人による再審査を受けられるようにしてほしい。

### 2.2 広告主 / ゲーム会社視点
- US-A1: 広告主として、自社サーバーからMasterGameへServer-to-Serverでコンバージョン（達成）を通知し、達成したユーザーにだけポイントが付与される状態にしたい。
- US-A2: 広告主として、クリック→コンバージョンが正しく紐づき（attribution）、自分が払う成果が「実在ユーザーの正味成果」であることを保証してほしい。
- US-A3: 広告主として、不正・重複・チャージバック分を後から取り消せる（reverse）手段がほしい。請求精算（翌々月末）に正しく反映されてほしい。
- US-A4: 広告主として、連携手順（エンドポイント、署名方式、テスト用サンドボックス）が明確で、数時間で疎通できるようにしてほしい。

---

## 3. スコープ / MVP配置

### 3.1 本仕様のスコープ
S2S postback の **受信 → 検証 → attribution → ポイント付与の状態遷移 → 台帳記録 → 管理画面での監査** までを対象とする。

### 3.2 MVP配置
| 機能 | MVP0 | MVP1 | MVP2 | MVP3 |
|---|:--:|:--:|:--:|:--:|
| ad_partners 管理 / シークレット発行 | ○(基盤) | ◎ | | |
| クリック計測（click ID付与・attributionウィンドウ） | | ◎ | | |
| postback受信エンドポイント（署名検証・IP許可・冪等性） | | ◎ | | |
| 状態遷移 pending→confirmed/rejected/reversed | | ◎ | | |
| point_ledger（追記専用台帳・二重付与防止） | | ◎ | | |
| 管理画面: 監査ビュー / 手動承認・却下 | | ◎ | | |
| 基本不正検知（同一IP/デバイス重複、達成速度しきい値、レート制限） | | ○(最小) | ◎ | |
| 高度不正検知（デバイスフィンガープリント、エミュレータ/VPN兆候、行動異常スコア） | | | ○ | ◎ |
| アカウントマーキングと自動保留ワークフロー | | ○(フラグのみ) | ◎ | ◎ |

◎=主実装 / ○=最小実装または準備

### 3.3 スコープ外（本仕様では扱わない）
- 報酬交換（CSV式 / コード式 / API式）そのもの。確定ポイントを消費する側であり、別仕様。
- 広告枠の入稿・配信ロジック、ミッション作成UI。
- 請求書発行・会計連携（台帳のエクスポートは提供する）。

---

## 4. 画面・UI仕様

### 4.1 ユーザー側（モバイル）: ミッション達成ステータス
Supabase Realtime で `point_ledger` / `postback_events` の状態変化を購読し、リアルタイムに表示更新する。

```
┌──────────────────────────────────────┐
│  ミッション: ○○ゲームをインストール       │
│  獲得予定: 500 pt                       │
│                                        │
│  状態:  ⏳ 判定中                        │
│  「達成を確認しています。通常10〜30分ほどで  │
│    確定します（最大72時間）」              │
│  ─────────────────────────────         │
│  [ ━━━━━━━━●──────── ]  検証中           │
└──────────────────────────────────────┘

確定後:
┌──────────────────────────────────────┐
│  状態:  ✅ 確定                          │
│  +500 pt がポイント残高に反映されました     │
└──────────────────────────────────────┘

却下時:
┌──────────────────────────────────────┐
│  状態:  ❌ 付与されませんでした            │
│  理由: 達成条件を確認できませんでした        │
│       （重複 / 検証不一致）               │
│  [ お問い合わせ・再審査を依頼する ]        │
└──────────────────────────────────────┘
```

表示マッピング:
| 内部状態 | ユーザー表示 | 補足 |
|---|---|---|
| pending | ⏳ 判定中 | 目安時間と最大期限を表示 |
| confirmed | ✅ 確定 | 残高反映額を表示 |
| rejected | ❌ 付与されませんでした | 理由は一般化（不正手口の詳細は出さない） |
| reversed | ⚠️ 取り消されました | 付与後の取消（チャージバック等） |

注意: 却下/取消の理由はユーザーに**一般化した文言**のみ提示する。具体的な検知ロジックを露出させない（攻撃者への情報供与を防ぐ）。

### 4.2 管理画面（Next.js）: 監査ビュー

```
┌─ Postback 監査 ─────────────────────────────────────────────┐
│ [パートナー▼] [状態▼:pending] [期間] [リスクスコア≥] [検索🔍] │
├──────┬──────────┬────────┬────────┬───────┬───────┬─────────┤
│ 受信  │ partner  │ user   │ txn_id │ pts   │ risk  │ status  │
├──────┼──────────┼────────┼────────┼───────┼───────┼─────────┤
│ 10:02│ gameco   │ u_8821 │ tx_771 │ 500   │ 82🔴  │ pending │
│ 10:01│ adnet_a  │ u_1290 │ tx_770 │ 120   │ 12🟢  │confirmed│
│ 09:58│ gameco   │ u_8821 │ tx_769 │ 500   │ 95🔴  │rejected │
├──────┴──────────┴────────┴────────┴───────┴───────┴─────────┤
│ [選択行を一括承認] [一括却下]                                  │
└─────────────────────────────────────────────────────────────┘

行クリックで詳細ドロワー:
┌─ tx_771 詳細 ───────────────────────────────────────────────┐
│ click_id: clk_aZ... / clicked_at: 09:31 / converted_at:10:02 │
│ attribution: window内 (31分) ✅                               │
│ ip: 203.0.113.5 / device_fp: 9f3a... / ua: ...               │
│ 冪等チェック: 重複なし ✅                                       │
│ fraud_flags:                                                  │
│   - same_device_multi_account (severity:high)                │
│   - velocity_exceeded (3達成/5分)                             │
│ 署名検証: OK / IP許可: OK                                      │
│ ─────────────────────────────────────────────────────────── │
│ [✅ 承認して付与]  [❌ 却下]  [👤 アカウントをマーキング]       │
│ 監査ログ(操作者・理由必須): [____________________]            │
└─────────────────────────────────────────────────────────────┘
```

要件:
- pending一覧はリスクスコア降順で既定表示。高リスクほど上位。
- 手動承認 / 却下は**操作者ID・理由・タイムスタンプ**を必須で監査ログ（audit_logs）に記録する。
- 同一 user / device に紐づく関連イベントを横断表示できる（クラスタリング）。
- 監査ビューへのアクセスはロール（admin / reviewer）で制御。閲覧専用ロールも用意。

---

## 5. データモデル（Postgres）

共通方針: 主キーは `uuid`（`gen_random_uuid()`）。すべて RLS 有効。書き込みは Edge Function の service_role 経由のみ（後述）。台帳は追記専用。

### 5.1 `ad_partners` — 広告主 / ゲーム会社 / 広告ネットワーク
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | パートナーID |
| name | text | NOT NULL | 表示名 |
| slug | text | NOT NULL, UNIQUE | URL用識別子（postbackパスに使用） |
| signing_secret | text | NOT NULL | HMAC共有シークレット（**暗号化保管/Vault参照**） |
| signing_algo | text | NOT NULL, default 'hmac-sha256' | 署名アルゴリズム |
| allowed_ips | inet[] | NULL | IP許可リスト（NULL=制限なしだが本番は必須） |
| attribution_window | interval | NOT NULL, default '24 hours' | click→conversion有効期間 |
| postback_mode | text | NOT NULL, default 'sandbox' | sandbox / live |
| status | text | NOT NULL, default 'active' | active / suspended |
| created_at | timestamptz | NOT NULL, default now() | |
| rotated_at | timestamptz | NULL | シークレット最終ローテーション日時 |

制約・索引:
- `CHECK (signing_algo IN ('hmac-sha256','hmac-sha512'))`
- `CHECK (postback_mode IN ('sandbox','live'))`, `CHECK (status IN ('active','suspended'))`

### 5.2 `missions`（参照: 既存テーブル想定の最小カラム）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ミッションID |
| partner_id | uuid | FK→ad_partners.id | 出稿元 |
| reward_points | integer | NOT NULL, CHECK > 0 | 付与ポイント |
| event_type | text | NOT NULL | install / purchase / level_reach 等 |
| max_conversions_per_user | integer | NOT NULL, default 1 | ユーザーあたり達成上限 |

### 5.3 `mission_clicks` — クリック計測 / attributionの起点
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| click_id | text | NOT NULL, UNIQUE | 発行クリックID（postbackで返ってくる照合キー） |
| user_id | uuid | NOT NULL, FK→auth.users | クリックしたユーザー |
| mission_id | uuid | NOT NULL, FK→missions.id | 対象ミッション |
| partner_id | uuid | NOT NULL, FK→ad_partners.id | |
| clicked_at | timestamptz | NOT NULL, default now() | クリック時刻 |
| expires_at | timestamptz | NOT NULL | clicked_at + attribution_window |
| ip | inet | NULL | クリック時IP |
| device_fp | text | NULL | デバイスフィンガープリント |
| user_agent | text | NULL | |
| is_converted | boolean | NOT NULL, default false | コンバージョン済みか |

索引: `UNIQUE(click_id)`, `INDEX(user_id, mission_id)`, `INDEX(expires_at)`

### 5.4 `postback_events` — 受信したS2S postbackの記録（生イベント）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| partner_id | uuid | NOT NULL, FK→ad_partners.id | |
| transaction_id | text | NOT NULL | パートナー側の一意ID（冪等キー） |
| click_id | text | NULL, FK→mission_clicks.click_id | attribution照合キー |
| user_id | uuid | NULL, FK→auth.users | 解決後のユーザー |
| mission_id | uuid | NULL, FK→missions.id | 解決後のミッション |
| event_type | text | NOT NULL | install / purchase 等 |
| payout_points | integer | NULL | 付与予定ポイント |
| status | text | NOT NULL, default 'pending' | pending/confirmed/rejected/reversed |
| risk_score | smallint | NOT NULL, default 0 | 0–100。高いほど高リスク |
| reason_code | text | NULL | 却下/取消理由コード |
| signature_valid | boolean | NOT NULL | 署名検証結果 |
| source_ip | inet | NULL | 送信元IP |
| raw_payload | jsonb | NOT NULL | 受信生データ（監査用） |
| received_at | timestamptz | NOT NULL, default now() | |
| decided_at | timestamptz | NULL | 確定/却下時刻 |
| decided_by | uuid | NULL | 手動判定者（NULL=自動） |

制約・索引（冪等性の要）:
- `UNIQUE (partner_id, transaction_id)` — **同一パートナーの同一トランザクションは1行のみ**（リプレイ/重複postback排除）。
- `CHECK (status IN ('pending','confirmed','rejected','reversed'))`
- `CHECK (risk_score BETWEEN 0 AND 100)`
- `INDEX(status, risk_score DESC)`（監査ビュー用）, `INDEX(user_id)`, `INDEX(received_at)`

### 5.5 `point_ledger` — 追記専用ポイント台帳（残高の真実）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK→auth.users | |
| postback_event_id | uuid | NULL, FK→postback_events.id | 付与の根拠 |
| entry_type | text | NOT NULL | grant / reversal / adjustment |
| points | integer | NOT NULL | grant: 正数 / reversal: 負数 |
| idempotency_key | text | NOT NULL, UNIQUE | 二重付与防止キー（後述） |
| reverses_entry_id | uuid | NULL, FK→point_ledger.id | 逆仕訳の対象 |
| balance_after | integer | NULL | 参考: 記帳後残高（任意・整合チェック用） |
| created_at | timestamptz | NOT NULL, default now() | |
| created_by | uuid | NULL | 手動調整者 |

制約・索引（二重支払い防止の要）:
- `UNIQUE (idempotency_key)` — 同一根拠の付与は台帳上1回のみ。
- `CHECK (entry_type IN ('grant','reversal','adjustment'))`
- `CHECK ((entry_type = 'grant' AND points > 0) OR (entry_type = 'reversal' AND points < 0) OR entry_type = 'adjustment')`
- 台帳は **UPDATE / DELETE 禁止**（RLS + トリガで拒否）。修正は新規行（adjustment / reversal）で表現。
- 残高 = `SELECT COALESCE(SUM(points),0) FROM point_ledger WHERE user_id = :u`（または集計テーブル/マテビューでキャッシュ）。

`idempotency_key` の生成規則: `'{partner_slug}:{transaction_id}:grant'`。reversalは `':reversal'` 接尾辞。これにより同一postbackからの付与は何度処理しても1行に収束する。

### 5.6 `fraud_flags` — 不正シグナル（イベント単位 / ユーザー単位）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| subject_type | text | NOT NULL | postback_event / user / device |
| subject_id | text | NOT NULL | 対象ID |
| flag_type | text | NOT NULL | same_ip_multi / same_device_multi / velocity_exceeded / emulator / vpn_proxy / replay / signature_mismatch |
| severity | text | NOT NULL | low / medium / high |
| score_delta | smallint | NOT NULL, default 0 | risk_scoreへの寄与 |
| details | jsonb | NULL | 根拠データ |
| created_at | timestamptz | NOT NULL, default now() | |

索引: `INDEX(subject_type, subject_id)`, `INDEX(flag_type)`

### 5.7 `account_markings` — アカウントマーキング（資料の「アカウントマーキング」と接続）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK→auth.users | |
| marking | text | NOT NULL | watch / hold / banned | 監視 / 付与保留 / 凍結 |
| reason | text | NOT NULL | |
| created_by | uuid | NULL | 自動=NULL / 手動=操作者 |
| created_at | timestamptz | NOT NULL, default now() | |
| expires_at | timestamptz | NULL | 自動解除時刻（任意） |

挙動: `marking='hold'/'banned'` のユーザーへのpostbackは confirmed にせず pending 保留（手動レビュー待ち）。

### 5.8 `audit_logs` — 監査操作ログ
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| actor_id | uuid | NOT NULL | 操作者 |
| action | text | NOT NULL | approve / reject / reverse / mark_account / rotate_secret |
| target_type | text | NOT NULL | |
| target_id | text | NOT NULL | |
| reason | text | NOT NULL | 操作理由（必須） |
| created_at | timestamptz | NOT NULL, default now() | |

### 5.9 RLS方針
- `postback_events`, `point_ledger`, `fraud_flags`, `ad_partners.signing_secret` はユーザーから**直接読めない**（service_roleのみ）。
- ユーザーは自分の `point_ledger` 残高サマリと、自分に紐づくミッション達成ステータス（限定ビュー）だけ閲覧可。
- 管理画面はロール（admin/reviewer）チェックを通したサーバー経由でアクセス。

---

## 6. API・連携仕様

### 6.1 クリック計測エンドポイント（attributionの起点）
ユーザーがアプリ内でミッションリンクを踏むと、サーバーが `click_id` を発行して `mission_clicks` に記録し、パートナーのランディング/ストアURLへ `click_id` を引き回してリダイレクトする。

```
GET /functions/v1/track-click?mission_id={uuid}
  （認証: ユーザーのSupabase JWT）
→ 302 Location: {partner_landing_url}?click_id={generated_click_id}&...
```
発行した `click_id` はパートナーがコンバージョン時にpostbackへ含めて返す（attribution照合キー）。

### 6.2 postback受信エンドポイント
URLはパートナー単位で固定。`slug` でパートナーを識別する。

```
POST /functions/v1/postback/{partner_slug}
Content-Type: application/json
X-Signature: {hex(hmac_sha256(secret, raw_body))}
X-Timestamp: {unix_seconds}   ← リプレイ対策（許容 skew ±300秒）

Body:
{
  "transaction_id": "tx_771",     // 必須・パートナー側で一意（冪等キー）
  "click_id":       "clk_aZ...",  // 推奨・attribution照合
  "event_type":     "install",    // 必須
  "user_ref":       "u_8821",     // 任意・click_id無い場合の補助照合
  "amount":         null,         // purchase時の金額等（payout算出用）
  "occurred_at":    "2026-05-31T10:02:00Z"
}
```

#### 6.2.1 署名検証（HMAC）
- 署名対象は **生のリクエストボディそのまま**（JSON再シリアライズ前）。
- `expected = HMAC_SHA256(partner.signing_secret, raw_body)`。`X-Signature` と**定数時間比較**（タイミング攻撃対策）。
- `X-Timestamp` を署名前提として検証し、±300秒を超えるものは拒否（リプレイウィンドウ縮小）。
- 署名不一致は `signature_valid=false` で記録し、`401` を返す（ただし `transaction_id` があれば監査用に postback_events へ rejected で残す）。

#### 6.2.2 IP許可リスト
- 送信元IPが `ad_partners.allowed_ips` に含まれない場合は `403`。live モードでは `allowed_ips` 未設定を不可とする（設定必須）。

#### 6.2.3 レスポンス（共通エンベロープ）
| HTTP | 意味 | body例 |
|---|---|---|
| 200 | 受理（pending/confirmed問わず正常受信） | `{ "success": true, "data": { "transaction_id":"tx_771", "status":"pending" }, "error": null }` |
| 200 | 冪等再送（既に処理済み） | `{ "success": true, "data": { "transaction_id":"tx_771", "status":"confirmed", "duplicate": true }, "error": null }` |
| 400 | 必須欠落 / 不正JSON | `{ "success": false, "data": null, "error": "missing transaction_id" }` |
| 401 | 署名不一致 / timestamp期限切れ | `{ "success": false, "data": null, "error": "invalid signature" }` |
| 403 | IP不許可 / partner suspended | `{ "success": false, "data": null, "error": "forbidden" }` |
| 409 | （任意）矛盾する再送 | `{ "success": false, "data": null, "error": "conflict" }` |
| 429 | レート制限 | `{ "success": false, "data": null, "error": "rate limited" }` |

設計上の重要点: **重複postbackは409ではなく200(duplicate:true)で返す**。パートナーのリトライを「エラー」と誤認させず、かつ二重付与もしないため。

#### 6.2.4 Edge Function 擬似コード（Deno / service_role）
```ts
// supabase/functions/postback/index.ts （擬似コード）
serve(async (req) => {
  const slug = pathParam(req, "partner_slug");
  const rawBody = await req.text();                // 署名は生ボディで検証
  const sig = req.headers.get("X-Signature") ?? "";
  const ts  = Number(req.headers.get("X-Timestamp") ?? 0);

  const partner = await getActivePartnerBySlug(slug);          // suspended/未存在→403
  if (!partner) return json(403, err("forbidden"));
  if (!ipAllowed(clientIp(req), partner.allowed_ips))          // IP許可
    return json(403, err("forbidden"));
  if (Math.abs(nowSec() - ts) > 300)                           // timestamp skew
    return json(401, err("stale timestamp"));

  const expected = hmacSha256Hex(partner.signing_secret, rawBody);
  const sigOk = timingSafeEqual(expected, sig);                // 定数時間比較

  let body; try { body = JSON.parse(rawBody); } catch { return json(400, err("bad json")); }
  if (!body.transaction_id || !body.event_type) return json(400, err("missing field"));

  // --- 冪等性: (partner_id, transaction_id) でUPSERT。既存なら現状態を返す ---
  const { row, isNew } = await upsertPostbackEvent({
    partner_id: partner.id, transaction_id: body.transaction_id,
    raw_payload: body, signature_valid: sigOk, source_ip: clientIp(req),
    status: "pending",
  });
  if (!isNew) return json(200, ok({ transaction_id: body.transaction_id,
                                    status: row.status, duplicate: true }));

  if (!sigOk) {                                                // 署名NGは記録して401
    await rejectEvent(row.id, "signature_mismatch");
    await raiseFlag("postback_event", row.id, "signature_mismatch", "high");
    return json(401, err("invalid signature"));
  }

  // --- attribution: click_id照合 + window判定 ---
  const click = await resolveClick(body.click_id, partner.id, partner.attribution_window);
  // click無し/期限切れは reason_code を付けて自動rejectまたはpending保留

  // --- 不正検知（同期できる軽量ルールのみここで。重い判定は非同期キュー） ---
  const risk = await scoreRisk(row, click);  // velocity / same_device / same_ip ...
  await applyRisk(row.id, risk);

  // --- 判定 ---
  const decision = decide({ sigOk, click, risk, marking: await marking(click?.user_id) });
  if (decision === "confirm") {
    await confirmAndGrantPoints(row, click);   // ↓6.3 トランザクション
  } else if (decision === "reject") {
    await rejectEvent(row.id, decision.reason);
  } // それ以外は pending のまま（手動レビュー待ち）

  return json(200, ok({ transaction_id: body.transaction_id, status: currentStatus }));
});
```

### 6.3 ポイント付与トランザクション（confirm時）
1つのDBトランザクション内で実行し、`point_ledger.idempotency_key` の UNIQUE で二重付与を最終防止する。
```sql
BEGIN;
  UPDATE postback_events SET status='confirmed', payout_points=:pts, decided_at=now()
    WHERE id=:event_id AND status='pending';   -- 既にconfirmedなら0行=何もしない
  INSERT INTO point_ledger (user_id, postback_event_id, entry_type, points, idempotency_key)
    VALUES (:user_id, :event_id, 'grant', :pts, :partner_slug || ':' || :txn_id || ':grant')
    ON CONFLICT (idempotency_key) DO NOTHING;   -- 二重付与をDBレベルで吸収
  UPDATE mission_clicks SET is_converted=true WHERE click_id=:click_id;
COMMIT;
```

### 6.4 取消（reversal / チャージバック）
パートナーが取消postback（`event_type:"reversal"`, 同 `transaction_id`）または管理者操作で取消。
```sql
BEGIN;
  UPDATE postback_events SET status='reversed', reason_code=:reason, decided_at=now()
    WHERE id=:event_id AND status='confirmed';
  INSERT INTO point_ledger (user_id, postback_event_id, entry_type, points,
                            idempotency_key, reverses_entry_id)
    VALUES (:user_id, :event_id, 'reversal', -:pts,
            :partner_slug || ':' || :txn_id || ':reversal', :grant_entry_id)
    ON CONFLICT (idempotency_key) DO NOTHING;
COMMIT;
```
残高が負になり得る場合（既に交換でポイント消費済み）の扱いは別途ポリシー（マイナス許容 or 回収）として運用で定義。

### 6.5 パートナー向け連携手順
1. MasterGame運営がパートナーを `ad_partners` に登録し、`signing_secret` と `slug` を安全な経路で共有。最初は `postback_mode='sandbox'`。
2. パートナーは MasterGame から渡る `click_id` を自社の計測に保持。
3. コンバージョン発生時、`POST /functions/v1/postback/{slug}` に `transaction_id`（自社一意）, `click_id`, `event_type` を含めHMAC署名して送信。
4. サンドボックスでテストトランザクションを送り、200応答と管理画面での受信を確認。
5. 運営が `allowed_ips` を確定し `postback_mode='live'` へ切替。本番開始。
6. シークレットは定期ローテーション（`rotated_at` 更新、旧シークレットは短期間並行受理）。

---

## 7. 主要ロジック・状態遷移

### 7.1 状態機械（postback_events.status）
```
                  受信・署名OK・attribution成立・低リスク
   [受信] ───────────────────────────────────────────────▶ (confirmed) ──┐
      │                                                                    │
      │ 署名NG / attribution不成立 / 高リスク自動却下                       │ reversal postback
      ├───────────────────────────────────────────────▶ (rejected)        │ or 管理者取消
      │                                                                    ▼
      │ 中リスク / hold中アカウント / 要確認                          (reversed)
      └───────────────────────────────────────────────▶ (pending)
                                                            │
                                  管理者承認 │ 自動再評価OK   │  管理者却下
                                            ▼               ▼
                                       (confirmed)      (rejected)

遷移規則:
  pending   → confirmed | rejected
  confirmed → reversed                 （付与後の取消のみ）
  rejected  → （終端。再審査は新規イベントまたは手動adjustmentで対応）
  reversed  → （終端）
不可遷移（拒否）: confirmed→pending, rejected→confirmed の自動遷移は不可（手動adjustmentのみ）
```

### 7.2 冪等性フロー
1. 受信時にまず `(partner_id, transaction_id)` で `postback_events` をUPSERT。
2. **既存行があれば**そこで処理を打ち切り、現在の `status` を `duplicate:true` で返す（リプレイ/再送を吸収）。
3. 付与は `point_ledger.idempotency_key` の UNIQUE + `ON CONFLICT DO NOTHING` で最終防御。
4. → アプリ層・DB層の二段で「同じ達成は一度だけ付与」を保証。

### 7.3 attribution フロー
1. postbackの `click_id` で `mission_clicks` を引く。
2. `now() <= expires_at`（= clicked_at + attribution_window）かを判定。期限切れ→ `reason_code='attribution_expired'`。
3. `mission_clicks.user_id / mission_id` を `postback_events` に解決・記録。
4. `click_id` 欠落時は `user_ref` 等の補助照合（精度低・要レビュー）にフォールバックし pending とする。
5. `max_conversions_per_user` を超える達成は重複として reject。

### 7.4 判定ロジック（decide）
- `signature_valid=false` → reject（signature_mismatch）。
- attribution不成立 → reject or pending（パートナー設定による）。
- `risk_score >= 高しきい値`（例: ≥80）→ reject（または hold）。
- `中しきい値 ≤ risk_score < 高しきい値`（例: 40–79）→ pending（手動レビュー）。
- 対象ユーザーが `account_markings` で hold/banned → pending（自動confirmしない）。
- 上記いずれにも該当せず低リスク → confirm（即時付与）。

---

## 8. 不正・エラー・エッジケース

| ケース | 検知/対処 |
|---|---|
| 重複postback（パートナー正常リトライ） | `(partner_id, transaction_id)` UNIQUEで吸収。200 + `duplicate:true`。二重付与なし。 |
| リプレイ攻撃（盗んだ正規ボディを再送） | `X-Timestamp` ±300秒検証 + 冪等キーで無効化。古いtimestampは401。 |
| 署名不一致 / 改ざん | HMAC定数時間比較でreject。401。`fraud_flags(signature_mismatch, high)`記録。 |
| timestamp欠落 / skew超過 | 401（stale timestamp）。 |
| attribution期限切れ / click_id無し | reject(`attribution_expired`) または pending（補助照合）。 |
| 同一IPからの多数達成 | `same_ip_multi`。score加算。しきい値超でpending/reject。 |
| 同一デバイス・複数アカウント | `same_device_multi`（device_fp照合）。high severity。`account_markings`へ自動watch/hold。 |
| 達成速度の異常（短時間に多数） | `velocity_exceeded`（例: 5分に3達成超）。pending化。 |
| エミュレータ / VPN / Proxy兆候 | `emulator` / `vpn_proxy`（MVP2〜3）。scoreに反映。 |
| チャージバック（課金取消） | reversal postback or 管理者操作 → confirmed→reversed + 逆仕訳。残高反映。 |
| 付与後にユーザーが交換済みで残高不足の取消 | 残高マイナス許容/回収ポリシーで処理（運用定義）。台帳には必ず逆仕訳を残す。 |
| パートナーsuspended中の受信 | 403。イベントは監査用に記録可。 |
| 大量送信 / DoS | レート制限（partner単位 + IP単位、例: 60 req/分/partnerでburst許容）。429。 |
| Edge Function タイムアウト / DB一時障害 | postbackは「最低1回受信記録」を優先。付与処理失敗時はpending据え置き＋非同期リトライ。パートナーには200を返しても付与は遅延確定可。 |
| 不正JSON / 必須欠落 | 400。raw_payloadは可能な範囲で監査保存。 |
| シークレット漏洩疑い | 即ローテーション（rotate_secret監査ログ）。旧シークレットを短期並行受理後に無効化。 |

セキュリティ補足:
- シークレットはコードに直書きしない（Supabase Vault / 環境変数 / 暗号化カラム）。
- 却下/取消理由はユーザーに一般化文言のみ提示（検知ロジック非開示）。
- すべての書き込みは service_role 経由（Edge Function）。クライアントから台帳・postback_eventsへ直接INSERT/UPDATE不可（RLSで遮断）。
- 監査操作（承認/却下/取消/マーキング/ローテーション）は理由必須でaudit_logsに記録。

---

## 9. 計測 / KPI

| 指標 | 定義 | 目的 / 目標例 |
|---|---|---|
| 承認率（approval rate） | confirmed / (confirmed + rejected) | パートナー品質・誤検知バランス把握 |
| 不正検知率 | reject(不正起因) / 受信総数 | 不正流入の規模把握 |
| 誤検知率（false positive） | 再審査でconfirmへ覆った件数 / reject件数 | 過剰ブロックの監視。低く保つ |
| pending滞留時間 | decided_at − received_at の中央値 / p95 | ユーザー体験（目安: 中央値30分以内 / p95 72時間以内） |
| 即時確定率 | 自動confirm / confirmed総数 | 手動レビュー負荷の把握 |
| attribution成立率 | click_id照合成功 / 受信総数 | 計測連携の健全性 |
| 重複postback率 | duplicate:true / 受信総数 | パートナー実装品質・リトライ過多検知 |
| チャージバック率 | reversed / confirmed | 精算（翌々月末）への影響把握 |
| マーキング件数 | watch/hold/banned 新規発行数 | 不正アカウント動向 |

ダッシュボード: パートナー別・ミッション別・日次でこれらを集計し、異常値（承認率急落、velocity多発）でアラート。

---

## 10. 受け入れ基準（チェックリスト）

### 10.1 受信・署名・冪等（MVP1必須）
- [ ] `POST /functions/v1/postback/{slug}` がHMAC-SHA256署名を生ボディで検証し、定数時間比較で照合する。
- [ ] `X-Timestamp` の±300秒検証があり、期限切れを401で拒否する。
- [ ] IP許可リスト外を403で拒否し、liveモードでは `allowed_ips` 未設定を許さない。
- [ ] `(partner_id, transaction_id)` UNIQUEにより、同一postbackの重複受信で行が増えない。
- [ ] 重複受信時は200 + `duplicate:true` を返し、ポイントが二重付与されない。
- [ ] 署名不一致イベントが `signature_valid=false` で監査記録され、`fraud_flags` が立つ。

### 10.2 attribution・状態遷移・台帳（MVP1必須）
- [ ] `click_id` 照合と attribution_window 判定が機能し、期限切れを `attribution_expired` でreject/pendingにする。
- [ ] 状態が pending→confirmed/rejected、confirmed→reversed のみ遷移し、不可遷移を拒否する。
- [ ] confirm時に `point_ledger` へ grant 1行のみ記録され、`idempotency_key` UNIQUEで二重付与されない。
- [ ] `point_ledger` がUPDATE/DELETE不可（追記専用）で、残高が SUM(points) で正しく導出される。
- [ ] reversal（チャージバック/管理者取消）で逆仕訳が記録され、残高に反映される。
- [ ] `max_conversions_per_user` 超過の達成がrejectされる。

### 10.3 不正検知（MVP1最小 / MVP2-3拡張）
- [ ] 同一IP多重・同一デバイス多重・velocity超過の基本ルールが `risk_score` と `fraud_flags` に反映される（MVP1最小）。
- [ ] 高リスクは自動reject/hold、中リスクはpending（手動レビュー）に振り分けられる。
- [ ] hold/banned マーキング済みアカウントへのpostbackが自動confirmされない。
- [ ] レート制限（partner/IP単位）が機能し、超過を429で返す。

### 10.4 管理画面・監査（MVP1必須）
- [ ] 監査ビューでpendingをリスクスコア降順に一覧・絞り込みできる。
- [ ] 詳細ドロワーで署名/IP/attribution/冪等/fraud_flagsの根拠が確認できる。
- [ ] 手動承認・却下・取消・マーキングが可能で、操作者ID・理由・時刻が `audit_logs` に必須記録される。
- [ ] 監査ビューへのアクセスがロール（admin/reviewer/閲覧専用）で制御される。

### 10.5 ユーザー体験・セキュリティ
- [ ] ユーザー側で「判定中→確定/却下/取消」がRealtimeで更新表示される。
- [ ] 却下/取消理由がユーザーには一般化文言でのみ提示される（検知ロジック非開示）。
- [ ] 台帳・postback_events・シークレットがクライアントから直接読めない（RLSで遮断）。
- [ ] シークレットがソースコードに直書きされておらず、ローテーション手順と監査ログがある。

### 10.6 信頼性
- [ ] Edge Functionタイムアウト/DB一時障害時もpostbackの受信記録を失わず、付与は非同期リトライで確定する。
- [ ] KPI（承認率・誤検知率・pending滞留p95・チャージバック率等）が日次で集計・可視化される。
