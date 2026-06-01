# オファーウォール / 動画リワード広告 機能仕様書

- 対象プロダクト: MasterGame（ポイ活 × ゲームコミュニティ）
- 文書バージョン: v0.1（ドラフト）
- 想定読者: モバイル開発者、バックエンド開発者、PdM、データアナリスト
- 関連スタック: React Native + Expo (TypeScript) / Supabase (Postgres / Auth / Realtime / Storage / Edge Functions) / Next.js（管理画面） / Expo Notifications

---

## 1. 目的・提供価値

### 1.1 背景
MasterGame のコアループは「ミッションでポイントを貯める → 提携ゲームのアイテム/実物報酬と交換する」である。サービス初期は提携ゲームが少なく、アフィリエイト記事系ミッションだけでは **ミッション在庫が枯渇** しやすい（コールドスタート問題）。ユーザーは「やることがない」状態になり、リテンションが下がる。

### 1.2 本機能の狙い
外部の **オファーウォール**（Tapjoy / AppLovin / ironSource(Unity LevelPlay) 等）と **動画リワード広告**（AdMob / AppLovin MAX rewarded 等）を統合し、提携ゲームの数に依存せず **常にミッション在庫がある状態** を作る。

| 課題 | 本機能による解決 |
| --- | --- |
| コールドスタート（提携ゲーム不足でミッション在庫枯渇） | 外部広告在庫で常時ミッションを供給 |
| 収益源がアフィリエイト1本 | 動画リワード（eCPM課金）+ オファーCPA という第2の収益柱 |
| 非課金ユーザーのマネタイズ（ゲーム会社側の課題） | 広告視聴・オファー完了でユーザーに価値還元しつつ収益化 |
| ユーザーの「ポイントの貯めやすさ」体感 | 短時間で完了できる動画リワードで即時報酬体験を提供 |

### 1.3 提供価値（ステークホルダー別）
- **ユーザー**: いつでもポイントを稼げる手段がある。動画は数十秒で完了、オファーは高単価。
- **MasterGame運営**: 広告ネットワークからの収益（eCPM / CPA）。提携ゲーム獲得前から収益化開始。
- **広告主/ゲーム会社**: 質の高いユーザーの送客（インストール・登録・課金）。

### 1.4 用語定義
| 用語 | 定義 |
| --- | --- |
| オファーウォール (Offerwall) | 複数の高単価オファー（CPA案件）を一覧表示する広告フォーマット。アプリDL・会員登録・課金などの完了で報酬 |
| 動画リワード (Rewarded Video) | 数十秒の動画を最後まで視聴すると報酬が得られる広告フォーマット |
| S2S postback (Server-to-Server callback) | 広告ネットワークのサーバーから MasterGame のサーバーへ「報酬を付与してよい」と通知するHTTPコール。クライアントを介さないため改ざんに強い |
| eCPM | 広告1,000インプレッションあたりの収益（effective Cost Per Mille） |
| メディエーション | 複数の広告ネットワークを束ね、最も高い収益が見込めるものを出し分ける仕組み |
| アダプタ層 | 各広告ネットワークSDK/APIの差異を吸収し、内部で統一インターフェースとして扱うための抽象化レイヤ |
| ATT | App Tracking Transparency（iOSのトラッキング許諾。IDFA取得の可否を左右する） |

---

## 2. ユーザーストーリー

### 2.1 一般ユーザー
- US-01: ポイ活ユーザーとして、提携ゲームのミッションが無いときでも **動画を見てポイントを稼ぎたい**。なぜなら毎日コツコツ貯めたいから。
- US-02: ポイ活ユーザーとして、**高単価のオファー（アプリDL・登録・課金）を一覧から選びたい**。なぜなら効率よく大きくポイントを稼ぎたいから。
- US-03: ユーザーとして、**オファー完了が反映されない時に状況（保留中/完了/失敗）を確認したい**。なぜなら正しく報酬を受け取れているか不安だから。
- US-04: ユーザーとして、**動画視聴を最後まで見たら即座にポイントが付与されてほしい**。なぜなら待たされると離脱するから。
- US-05: ユーザーとして、**1日に視聴できる動画数の上限と残り回数を知りたい**。なぜなら計画的に貯めたいから。
- US-06: iOSユーザーとして、**トラッキング許諾を出していなくても最低限のミッションは使いたい**。なぜなら許諾しなくても利用したいから。

### 2.2 運営/管理者（Next.js管理画面）
- US-07: 運営者として、**どのネットワークがどれだけ収益を出しているか（eCPM/収益/完了率）を見たい**。なぜなら配信比率や交渉を最適化したいから。
- US-08: 運営者として、**特定オファーや特定ネットワークを即時にON/OFFしたい**。なぜなら不正・苦情・低品質案件を止めたいから。
- US-09: 運営者として、**postbackで報酬付与に失敗したケースを再処理（リカバリ）したい**。なぜなら取りこぼしを防ぎたいから。
- US-10: 運営者として、**地域・年齢・ATT状態でオファーをフィルタしたい**。なぜならコンプライアンスと品質を守りたいから。

---

## 3. スコープ / MVP配置

### 3.1 含むもの
- 動画リワード広告の表示・視聴完了検知・S2S postbackによるポイント付与
- オファーウォールの表示（埋め込み or SDKオーバーレイ）・オファー一覧取得・完了postback・ポイント付与
- 複数ネットワークを抽象化する **アダプタ層 / メディエーション**（収益最大化の出し分け）
- postback受信エンドポイント（idempotency / 署名検証 / リトライ耐性）
- 計測（imp / click / 完了 / eCPM / 収益 / ARPDAU）と管理画面の集計
- フォールバック挙動（在庫枯渇・ネットワーク障害）
- 地域・年齢・iOS ATT（IDFA）許諾に応じた出し分け

### 3.2 含まないもの（Out of Scope）
- 自社直販広告枠（ハウス広告）の入稿管理システム（別仕様）
- バナー/インタースティシャル等の非リワード広告（収益最適化はするが報酬付与は対象外）
- 換金（現金化）機能そのもの（ポイント→報酬交換は既存「交換」機能側の仕様。本機能はポイント付与までを担う）
- 広告クリエイティブ自体の審査・モデレーション（ネットワーク側責務）

### 3.3 MVP配置
| 区分 | 内容 | 配置MVP | 補足 |
| --- | --- | --- | --- |
| 動画リワード（単一ネットワーク, 例: AdMob） | 視聴→postback→付与の最小構成 | **MVP1 後半 〜 MVP1.5** | 比較的軽量。コアサイクルの「ポイントを貯める」手段として早期投入 |
| 動画リワード メディエーション | AppLovin MAX等で複数ネットワーク束ね | MVP2 | eCPM最適化 |
| オファーウォール本格統合 | Tapjoy / ironSource 等のCPAオファー | **MVP2 〜 MVP3** | 高単価=収益インパクト大 |
| 計測ダッシュボード | eCPM/ARPDAU等の集計 | MVP3（簡易版はMVP2） | 管理画面(Next.js) |

> 前倒し検討メモ: オファーウォールは **収益インパクトが最も大きい** ため、提携ゲーム獲得が遅れる場合は MVP1.5 への前倒しを検討する。アダプタ層を最初から噛ませておけば、ネットワーク追加コストは小さい。

---

## 4. 画面・UI仕様

### 4.1 ミッション一覧内「広告ミッション」セクション
既存のミッション一覧画面に「動画を見る」「提携オファー」のエントリーを統合表示する。

```
┌──────────────────────────────┐
│  ミッション                    ⟳ │
│ ───────────────────────────── │
│ [おすすめ] [記事] [動画] [オファー] │  ← フィルタタブ
│ ───────────────────────────── │
│ ┌──────────────────────────┐ │
│ │ ▶ 動画を見る               │ │
│ │ 30秒の動画で +5pt           │ │
│ │ 本日 残り 8/10 回   [見る]  │ │  ← 上限と残数を表示
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ 🎮 提携オファーを見る        │ │
│ │ アプリDL・登録で 最大+2000pt │ │
│ │                    [開く]   │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```
挙動:
- 「動画」タブ: 在庫があれば「見る」を活性。`offers.daily_cap` 到達時は非活性＋残数0表示。
- ネットワークから広告がロードできない場合はカードを **非表示**（空表示にせずフォールバック=4.5参照）。

### 4.2 動画リワード再生フロー
ボタンは状態を持つ（Idle → Loading → Ready → Playing → Rewarding → Done/Error）。
```
[見る] 押下
  └→ (Loading) ローディングスピナー / 「広告を準備中…」
       └→ Ready: 全画面で動画再生（SDKオーバーレイ）
            └→ 視聴完了: 「報酬を確認中…」（postback待ち）
                 └→ Done: トースト「+5pt 獲得！」＋残数を更新
                 └→ 保留: 「まもなく反映されます」（pending表示）
            └→ 中断（途中閉じ）: 報酬なし。「最後まで視聴で +5pt」案内
```
要素:
- 全画面再生中はアプリ側UIを操作不可（SDKに委譲）。
- 完了直後はクライアント側で楽観表示せず **postback確定後にポイント残高を更新** するのが原則。ただしUX上、SDKの`onUserEarnedReward`コールバック受領時に「報酬を確認中」表示（pending）→ postback確定で確定表示へ。

### 4.3 オファーウォール画面
```
┌──────────────────────────────┐
│ ← 提携オファー                  │
│ ───────────────────────────── │
│ [すべて] [アプリ] [登録] [課金]  │  ← カテゴリフィルタ
│ ───────────────────────────── │
│ ┌──────────────────────────┐ │
│ │ [icon] ゲームAをインストール  │ │
│ │ インストール+起動 で +800pt  │ │
│ │ ⏱ 目安: 即日   [挑戦する]    │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ [icon] サービスB 新規登録     │ │
│ │ 会員登録完了 で +1500pt      │ │
│ │ ⚠ 反映まで最大72時間         │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```
挙動:
- 実装方式は2系統を許容: (a) ネットワークSDKのオファーウォールUIをそのまま全画面表示、(b) APIでオファー一覧を取得し自前UIで描画。MVP2は(a)優先、(b)はオファー横断比較が必要になった段階で。
- 「挑戦する」押下で `offer_completions` に `pending` レコードを作成し、外部リンク/ストアへ遷移（`click` 計測）。

### 4.4 報酬ステータス画面（履歴）
```
┌──────────────────────────────┐
│ ← 広告ミッション履歴            │
│ ───────────────────────────── │
│ ✅ 動画視聴            +5pt 完了 │
│ ⏳ ゲームAインストール  +800pt 保留│  ← pending（反映待ち）
│ ❌ サービスB登録      期限切れ   │  ← expired/failed
└──────────────────────────────┘
```
- ステータス: `pending` / `credited`（完了） / `rejected`（却下） / `expired`（期限切れ）。
- pending は「反映まで最大◯時間」をオファーごとに表示（`offers.eta_hours`）。

### 4.5 フォールバック / 空状態
- 動画在庫なし: カード非表示にし、代わりに「記事ミッション」「フォーラム」へのCTAを表示。
- オファー在庫なし: 「現在ご利用いただける提携オファーはありません」＋再読込ボタン。
- ネットワーク障害: 「広告の読み込みに失敗しました。時間をおいて再度お試しください」＋再試行。

---

## 5. データモデル（Postgres / Supabase）

すべて `public` スキーマ。主キーは `uuid`（`gen_random_uuid()`）。タイムスタンプは `timestamptz`。RLSは原則「本人のみ参照可、書き込みはサーバ(Edge Function/Service Role)経由」。

### 5.1 `ad_networks`（広告ネットワーク定義）
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | |
| code | text | NOT NULL, UNIQUE | 内部識別子（例: `admob`, `applovin_max`, `tapjoy`, `ironsource`） |
| display_name | text | NOT NULL | 表示名 |
| network_type | text | NOT NULL, CHECK in ('rewarded_video','offerwall','both') | フォーマット種別 |
| adapter_key | text | NOT NULL | アダプタ層で使う実装キー |
| is_enabled | boolean | NOT NULL, default true | 配信ON/OFF |
| priority | int | NOT NULL, default 100 | メディエーション優先度（小さいほど優先、ただしeCPM動的調整あり） |
| config | jsonb | NOT NULL, default '{}' | app_id/placement等の非機密設定 |
| postback_secret_ref | text | NULL | postback署名検証用シークレットの参照名（Supabase Vault/環境変数キー名。値はDBに保存しない） |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### 5.2 `offers`（オファー/広告ミッション定義）
動画リワードもオファーウォールも本テーブルで「ミッション在庫」として正規化する。
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| network_id | uuid | NOT NULL, FK→ad_networks(id) | |
| offer_type | text | NOT NULL, CHECK in ('rewarded_video','offerwall_cpa') | |
| external_offer_id | text | NULL | ネットワーク側のオファーID（動画はNULL可） |
| title | text | NOT NULL | 表示タイトル |
| description | text | NULL | 説明 |
| icon_url | text | NULL | アイコン |
| reward_points | int | NOT NULL, CHECK (reward_points >= 0) | 付与ポイント（payout_revenueとは別、ユーザー還元分） |
| payout_revenue_micros | bigint | NULL | 当社が受け取る想定収益（マイクロ通貨単位, 通貨はcurrency） |
| currency | text | NOT NULL, default 'JPY' | |
| eta_hours | int | NULL | 反映目安時間（pending表示用） |
| daily_cap | int | NULL | 1ユーザー/日の上限回数（動画リワード用, NULL=無制限） |
| target_countries | text[] | NULL | 配信対象国（ISO 3166-1 alpha-2, NULL=全件） |
| min_age | int | NULL | 最低年齢制限 |
| requires_idfa | boolean | NOT NULL, default false | trueの場合ATT非許諾ユーザーには非表示 |
| is_enabled | boolean | NOT NULL, default true | |
| starts_at | timestamptz | NULL | 配信開始 |
| ends_at | timestamptz | NULL | 配信終了 |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

インデックス: `(offer_type, is_enabled)`, `(network_id)`, GIN `(target_countries)`。

### 5.3 `ad_impressions`（表示/視聴イベント。計測用）
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK→auth.users(id) | |
| offer_id | uuid | NULL, FK→offers(id) | 動画は紐付く。オファーウォール一覧表示はNULL可 |
| network_id | uuid | NOT NULL, FK→ad_networks(id) | |
| event_type | text | NOT NULL, CHECK in ('request','fill','impression','click','video_complete','no_fill','error') | |
| placement | text | NULL | 表示面（例: `mission_list`, `offerwall_main`） |
| revenue_micros | bigint | NULL | impression収益（メディエーションSDKのimpression-level revenueがある場合） |
| ad_network_ext | jsonb | NOT NULL, default '{}' | SDK由来メタ（mediation network名, ad unit等） |
| device_country | text | NULL | |
| att_status | text | NULL, CHECK in ('authorized','denied','restricted','not_determined') | iOSのATT状態 |
| created_at | timestamptz | NOT NULL, default now() | |

インデックス: `(user_id, created_at)`, `(network_id, event_type, created_at)`, `(offer_id)`。
パーティション: 件数増大に備え `created_at` 月次パーティション化を将来検討。

### 5.4 `offer_completions`（オファー/動画の完了・報酬トランザクション）
ユーザーへのポイント付与の **真実の源（source of truth）**。postbackで状態遷移する。
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK→auth.users(id) | |
| offer_id | uuid | NOT NULL, FK→offers(id) | |
| network_id | uuid | NOT NULL, FK→ad_networks(id) | |
| status | text | NOT NULL, default 'pending', CHECK in ('pending','credited','rejected','expired','reversed') | |
| reward_points | int | NOT NULL | 付与（予定）ポイント。offers.reward_pointsのスナップショット |
| network_txn_id | text | NULL | ネットワーク側の取引ID（postback冪等性キーの一部） |
| idempotency_key | text | NOT NULL, UNIQUE | 冪等キー（`network_code` + `:` + `network_txn_id` 等で生成） |
| revenue_micros | bigint | NULL | 当社受領収益 |
| postback_received_at | timestamptz | NULL | postback到達時刻 |
| credited_at | timestamptz | NULL | ポイント確定付与時刻 |
| point_ledger_id | uuid | NULL, FK→point_ledger(id) | 付与した台帳行への参照（二重付与防止） |
| reject_reason | text | NULL | 却下理由 |
| signature_verified | boolean | NOT NULL, default false | postback署名/IP検証通過フラグ |
| raw_payload | jsonb | NULL | 受信生データ（監査用） |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

制約・インデックス:
- `UNIQUE(idempotency_key)` … 重複postbackの二重付与を **DBレベルで** 防止。
- 部分インデックス `WHERE status='pending'`（リカバリ/期限切れバッチ用）。
- `(user_id, status)`。

### 5.5 既存連携: `point_ledger`（ポイント台帳・既存想定）
本機能は付与時に既存のポイント台帳へ追記する。参考スキーマ（既存に合わせる）:
| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid | |
| amount | int | 正=付与 / 負=減算 |
| reason | text | 例: `offer_completion` |
| ref_type | text | `offer_completion` |
| ref_id | uuid | `offer_completions.id` |
| created_at | timestamptz | |

> `offer_completions.point_ledger_id` ←→ `point_ledger.ref_id` の双方向参照で、付与済みか否かをトランザクション内で一意に判定する。

### 5.6 `user_daily_offer_counts`（日次キャップ管理・任意）
動画リワードの`daily_cap`を高速判定するための集計（無くてもcount(*)で代替可）。
| カラム | 型 | 制約 |
| --- | --- | --- |
| user_id | uuid | PK(複合) |
| offer_id | uuid | PK(複合) |
| ymd | date | PK(複合)（ユーザーのタイムゾーン基準） |
| count | int | NOT NULL default 0 |

---

## 6. API・連携仕様

### 6.1 構成概要
```
[RN/Expo アプリ]
   │  (1) 広告SDK直叩き（ロード/表示/onUserEarnedReward）
   ├─────────────► 各広告ネットワークSDK
   │  (2) 一覧取得/履歴/開始記録
   ├─────────────► Supabase Edge Functions (REST) ──► Postgres(RLS)
   │
[各広告ネットワーク サーバ]
   │  (3) S2S postback（報酬確定通知）
   └─────────────► Supabase Edge Function: /ad-postback/:network ──► Postgres
```
原則:
- **報酬確定は (3) のS2S postbackのみ**。クライアントのコールバック(1)は「pending作成 / UX表示」までで、ポイント確定はしない。
- アダプタ層で各ネットワークのpostback仕様（パラメータ名・署名方式）を吸収し、共通の`NormalizedPostback`に変換する。

### 6.2 クライアント向け Edge Functions（要認証: Supabase JWT）
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/offers?type=rewarded_video｜offerwall_cpa` | 配信可能なオファー一覧。サーバ側で 国/年齢/ATT/期間/キャップ/is_enabled をフィルタ |
| POST | `/offers/:id/start` | 「挑戦する/見る」押下時。`offer_completions`に`pending`作成、`idempotency_key`の前提となるclient一時IDを払い出し、`ad_impressions(click)`記録 |
| POST | `/ad-events` | クライアント計測イベントのバッチ送信（request/fill/impression/no_fill/error/video_complete）。署名なし計測用、報酬には影響しない |
| GET | `/offers/completions?status=` | 自分の完了/保留履歴 |
| GET | `/offers/quota` | 当日の動画残数等（`daily_cap - count`） |

レスポンス封筒は共通フォーマット（`{ success, data, error, meta }`）に従う。

### 6.3 postback受信エンドポイント（最重要）
`POST | /functions/v1/ad-postback/:network`（**無認証エンドポイント。ただし署名 + IP許可リスト + シークレットで保護**）

処理シーケンス:
1. `:network` から `ad_networks` を引き、`adapter_key` に対応するアダプタを選択。
2. **署名検証**: 各ネットワーク方式（例: Tapjoy=MD5ハッシュ, AppLovin/ironSource=共有シークレットでのHMAC/値検証, AdMob SSV=Googleの公開鍵でRSA-SHA256署名検証）。失敗時は `401` を返し、`signature_verified=false`で監査ログのみ残す。
3. アダプタが生パラメータを `NormalizedPostback` に正規化:
   ```ts
   type NormalizedPostback = {
     networkCode: string;
     networkTxnId: string;      // 取引ID
     userId: string;            // 起動時に渡したcustom_id（=auth.users.id）
     offerExternalId?: string;
     rewardPoints?: number;     // ネットワーク指定 or offers側を信頼
     revenueMicros?: number;
     eventStatus: 'completed' | 'reversed' | 'rejected';
     raw: Record<string, unknown>;
   };
   ```
4. `idempotency_key = networkCode + ':' + networkTxnId` を生成。
5. **冪等トランザクション**（SERIALIZABLE もしくは `INSERT ... ON CONFLICT DO NOTHING`）:
   - `offer_completions` に `idempotency_key` で UPSERT。既存が `credited` なら **何もせず 200** を返す（重複postback）。
   - 新規/`pending`→`credited` 遷移時のみ `point_ledger` に付与行を作成し、`point_ledger_id` を書き戻す。
   - `eventStatus='reversed'` の場合は逆仕訳（負のledger）を作成し `status='reversed'`。
6. 常に **200 OK を高速に返す**（ネットワーク側のリトライ抑制）。検証失敗のみ 4xx。

冪等性の要点: 「`point_ledger`への付与」と「`offer_completions`の状態更新」を **同一DBトランザクション** で行い、`UNIQUE(idempotency_key)` 制約で二重付与を物理的に阻止する。

### 6.4 アダプタ層（メディエーション抽象化）
```
interface AdNetworkAdapter {
  code: string;
  verifyPostback(req: Request, secret: string): Promise<boolean>;   // 署名/IP検証
  normalizePostback(payload: unknown): NormalizedPostback;          // パラメータ正規化
  // 任意: APIでオファー一覧を引くネットワーク向け
  fetchOffers?(ctx: TargetingContext): Promise<RawOffer[]>;
}
```
- ネットワーク追加 = 新アダプタ1ファイル追加のみ（オープン/クローズド原則）。
- クライアント側はメディエーションSDK（AppLovin MAX等）を1つ入れ、配下に複数ネットワークをぶら下げる構成を基本とする（表示の出し分けはSDKに委譲）。

### 6.5 クライアントSDK連携（React Native + Expo）
- Expo Dev Client / Config Plugin 経由でネイティブ広告SDKを組み込む（Expo Goでは不可。EAS Buildを使用）。
- 候補ライブラリ: `react-native-google-mobile-ads`（AdMob/メディエーション）、AppLovin MAX RN プラグイン、各社RNアダプタ。
- 起動/初期化時に **ユーザーID（auth.users.id）を custom_id / user identifier としてSDKへ設定**（postbackで誰の報酬か特定するため。最重要）。
- iOSは `expo-tracking-transparency` でATTを要求し、結果を初期化前後でSDKへ反映。

---

## 7. 主要ロジック・状態遷移

### 7.1 全体フロー（オファーウォール CPA）
```
[表示] offers取得・ターゲティング通過
   │ user: 「挑戦する」
   ▼
[clicked] /offers/:id/start → offer_completions(status=pending)作成 + click計測
   │ 外部アプリDL/登録/課金 など完了
   ▼  (ネットワークが完了検知)
[network_confirmed] 広告ネットワークが S2S postback送信
   │ /ad-postback/:network 受信 → 署名検証 → idempotency
   ▼
[credited] point_ledgerへ付与 + status=credited + 通知Push
```
失敗分岐:
- 期限超過（`ends_at` / 一定期間postback無し）→ バッチで `status=expired`。
- ネットワークが reversal を送信 → `status=reversed`（逆仕訳）。
- 署名検証NG → 付与せず監査ログのみ。

### 7.2 動画リワードの状態機械（クライアント＋サーバ）
```
Idle ──load──► Loading ──onLoaded──► Ready ──show──► Playing
  ▲                  │onError                          │onUserEarnedReward
  │                  ▼                                  ▼
  └──────────────  Error                          Rewarding(pending作成)
                                                       │ S2S SSV postback
                                                       ▼
                                                   Credited（残高更新/トースト）
   Playing ──ユーザーが途中で閉じる──► Closed(報酬なし)
```
- `onUserEarnedReward`（SDKコールバック）受領で **pending** を作る。確定はSSV(Server-Side Verification) postback。
- AdMob SSV: GoogleがリワードSSVコールバックを送る。`custom_data`にuserId、署名はGoogle公開鍵で検証。

### 7.3 ステータス遷移表（`offer_completions.status`）
| from → to | 契機 | 副作用 |
| --- | --- | --- |
| (none) → pending | `/offers/:id/start` または `onUserEarnedReward` | レコード作成、capカウント+1 |
| pending → credited | 有効なpostback受信 | point_ledger付与、Push通知 |
| pending → expired | 期限バッチ | なし（履歴表示） |
| pending → rejected | postbackが拒否ステータス/不正 | reject_reason記録 |
| credited → reversed | reversal postback | 逆仕訳ledger、残高減算 |

---

## 8. 不正・エラー・エッジケース

### 8.1 重複postback / 冪等性（CRITICAL）
- 同一 `network_txn_id` の再送は日常的に発生（ネットワークはACK未達でリトライする）。
- 対策: `offer_completions.idempotency_key` の `UNIQUE` 制約 + `INSERT ... ON CONFLICT DO NOTHING`。付与は **既存が未creditの時のみ** 行い、トランザクション内で `point_ledger_id` 有無を判定。
- 受信は **常に200を返す**（4xx/5xxを返すとネットワークが延々リトライする）。検証失敗のみ明示的に4xx。

### 8.2 署名・なりすまし
- postbackは公開URL。**必ず署名/シークレット/IP許可リストで検証**。
- userId（custom_id）はクライアントからSDKに渡すため、postbackのuserIdが実在ユーザーかつアクティブか検証。存在しない場合は `rejected`。
- シークレットはDBに平文保存しない（`postback_secret_ref`は参照名。実値はSupabase Vault/環境変数）。

### 8.3 在庫枯渇 / no-fill
- `no_fill` を計測（`ad_impressions.event_type='no_fill'`）。UIはカード非表示にし他導線へ誘導（4.5）。
- メディエーション全段no-fillが継続するネットワークは管理画面アラート。

### 8.4 ネットワーク/サーバ障害
- Edge Function側でpostback処理失敗（DB一時障害等）→ **5xxを返す**ことでネットワークの自動リトライに乗せる（idempotentなので安全）。
- それでも取りこぼした場合: 各ネットワークの **Reporting API でreconciliation（日次照合）** バッチを用意し、postback未着の完了を補填（US-09）。
- `raw_payload` を保存しておき、手動/再処理を可能にする。

### 8.5 iOS ATT 非許諾 / IDFAなし
- ATT `denied`/`not_determined` のユーザーには `offers.requires_idfa=true` のオファーを **配信しない**（多くのCPAは計測にIDFA必要）。
- 動画リワードはIDFA無しでも配信可能なネットワークを優先（コンテキスト配信）。
- ATT状態は `ad_impressions.att_status` に記録し、許諾率と収益差を分析。

### 8.6 不正利用（ユーザー側）
- 同一デバイス/IPでの大量完了、エミュレータ、リワード乞食（インストール直後アンインストール）→ ネットワーク側のアンチフラウドに一次依存しつつ、`daily_cap`・連続完了レート制限・既知不正IDFAブロックを自前でも実施。
- reversal postback受領時は速やかに残高減算（`reversed`）。残高がマイナスになり得る場合の扱い（負残高許容 or 次回付与で相殺）は既存ポイント仕様に合わせる。

### 8.7 年齢・地域・前払式支払手段の留意
- `min_age`/`target_countries` でターゲティング。子どもへの配信（COPPA/ファミリーポリシー）に該当する場合はパーソナライズ広告を無効化。
- ポイントに換金性が生じる設計の場合は **前払式支払手段該当性** に注意（法務確認。本機能はポイント付与までだが、交換側仕様と整合を取る）。

### 8.8 二重起動 / レースコンディション
- `/offers/:id/start` と postback が前後する（postbackが先着）ケースを許容: postback側も `offer_completions` を `idempotency_key` でUPSERT作成できるようにし、start未実行でも付与可能にする。

---

## 9. 計測 / KPI

### 9.1 収益・配信指標
| 指標 | 定義 | 算出元 |
| --- | --- | --- |
| eCPM | 収益 / impression × 1000 | `ad_impressions.revenue_micros` 集計 |
| Fill Rate | fill / request | `ad_impressions` event別 |
| 動画完了率 | video_complete / impression | 同上 |
| オファー完了率 (CVR) | credited / click | `offer_completions` + click |
| 収益（広告） | Σ revenue_micros | impressions + completions |
| ARPDAU | 広告収益 / DAU | 収益 ÷ DAU |
| 取りこぼし率 | reconciliationで補填した件数 / 総completed | バッチ照合結果 |

### 9.2 ユーザー価値・健全性指標
| 指標 | 定義 |
| --- | --- |
| 還元率 | Σ reward_points相当額 / Σ広告収益（ユーザー還元のバランス管理） |
| pending滞留率 | pending件数 / 完了件数（多いと体験悪化のサイン） |
| 1DAUあたり付与pt | 広告ミッション由来の付与pt合計 / DAU |
| ATT許諾率 | authorized / 全iOS imp |

### 9.3 管理画面（Next.js）
- ネットワーク別・オファー別・日次の eCPM/収益/完了率テーブル。
- pending滞留・reject・reversal の監視ビュー（US-09の再処理導線）。
- ネットワーク/オファーの即時ON/OFFトグル（`is_enabled`）。

---

## 10. 受け入れ基準（チェックリスト）

### 10.1 機能（動画リワード）
- [ ] ミッション一覧に「動画を見る」が在庫連動で表示され、残数（`daily_cap`連動）が正しい。
- [ ] 動画を最後まで視聴すると `onUserEarnedReward` を受領し pending を作成する。
- [ ] SSV postback 受信後にポイント残高が増え、トースト「+Npt」が出る。
- [ ] 途中で動画を閉じた場合はポイントが付与されない。
- [ ] `daily_cap` 到達時は「見る」が非活性になる。

### 10.2 機能（オファーウォール）
- [ ] 「提携オファー」一覧が国/年齢/ATT/期間/有効でフィルタされて表示される。
- [ ] 「挑戦する」で `offer_completions(pending)` が作成され外部遷移する。
- [ ] 完了postbackでステータスが `credited` になり通知が届く。
- [ ] 履歴画面で pending / credited / rejected / expired が正しく表示される。

### 10.3 postback / 冪等性（CRITICAL）
- [ ] 同一 `network_txn_id` の重複postbackで **二重付与されない**（`UNIQUE(idempotency_key)`で防止）。
- [ ] 署名検証に失敗したpostbackで **付与されず** 監査ログが残る。
- [ ] postback処理は正常時200を返し、DB障害時は5xxでネットワーク再送に乗る。
- [ ] reversal postbackで残高が正しく減算される（`reversed`）。
- [ ] start未実行でpostback先着のケースでも付与できる。

### 10.4 アダプタ / メディエーション
- [ ] 新ネットワーク追加がアダプタ1実装の追加で完結する（既存改修不要）。
- [ ] 各ネットワークの生パラメータが `NormalizedPostback` に正規化される。
- [ ] ネットワーク/オファーを管理画面から即時ON/OFFできる。

### 10.5 コンプライアンス / エッジ
- [ ] ATT非許諾ユーザーに `requires_idfa=true` のオファーが表示されない。
- [ ] `min_age` / `target_countries` のフィルタが効いている。
- [ ] 在庫なし/ネットワーク障害時にフォールバックUIが表示される。
- [ ] postbackシークレットがソース/DBに平文で存在しない（Vault/環境変数参照）。

### 10.6 計測
- [ ] request/fill/impression/click/video_complete/no_fill/error が `ad_impressions` に記録される。
- [ ] 管理画面で eCPM / 完了率 / 収益 / ARPDAU がネットワーク別・日次で確認できる。
- [ ] reconciliationバッチが postback未着の完了を検出・補填できる。

---

## 付録A: セキュリティ・RLS要点
- `offer_completions` / `point_ledger` への **書き込みは Service Role（Edge Function）のみ**。クライアントからの直接INSERT/UPDATEはRLSで全面禁止。
- `offers`（公開定義）と `ad_networks.config`（非機密のみ）はクライアント参照可。`postback_secret_ref` 等の機密列はビュー/列レベルで遮断。
- postbackエンドポイントは無認証だが、署名検証 + IP許可リスト + レート制限を必須とする。

## 付録B: 実装順序（推奨）
1. テーブル & RLS（`ad_networks`/`offers`/`offer_completions`/`ad_impressions`）。
2. postback Edge Function + 冪等トランザクション + 1ネットワーク（AdMob SSV）。
3. RNクライアント: AdMob rewarded 統合（custom_id設定、ATT対応）。
4. 計測イベント送信 + 管理画面の最小集計。
5. オファーウォール（Tapjoy/ironSource）アダプタ追加 + 一覧UI。
6. メディエーション（AppLovin MAX）+ reconciliationバッチ + ダッシュボード拡充。
