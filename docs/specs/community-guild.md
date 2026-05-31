# コミュニティ（ギルド/トピック/通報） 機能仕様書

> プロジェクト: MasterGame（ポイ活 × ゲームコミュニティ）
> 運営: 株式会社クリティカルヒット
> 対象MVP: MVP2（コミュニティ）— 本機能はMVP2の前提（安全装置）
> 技術前提: React Native + Expo (TypeScript) / Supabase (Postgres + RLS + Realtime + Storage) / Expo Notifications / 管理画面 Next.js
> ステータス: Draft v1.0

---

## 1. 目的・提供価値

### 1.1 ねらい
MasterGameのコアループは「ミッションでポイントを貯め → 提携ゲームのアイテム/実物報酬と交換」である。コミュニティ機能はこのループに**ユーザー相互の互助**と**承認欲求の充足**を重ねることで、滞在時間・再訪率・口コミを生む**差別化の源泉**である。

- **ユーザー価値**: ゲーム攻略・効率的なポイ活・トレードの「依頼」を出し合い解決する。良回答は評価・ポイント報酬で報われ、承認欲求が満たされる。
- **BtoB価値**: 「ゲーム別フォーラム（ギルド）」を**期間限定で開催**できるため、提携ゲーム会社にとっての送客・コミュニティ醸成の理由付けになる。
- **運営価値**: ゲーム特化のYahoo知恵袋型マーケット。一次情報（攻略・相場・トレンド）が蓄積し、検索流入・コンテンツ資産になる。

### 1.2 提供価値の核
1. **依頼を出す/受ける文化**（RPGギルドのクエスト掲示板の比喩）。
2. **ポイント賭け質問**で「答える動機」を強化（ベストアンサーに賭けポイントを移転）。
3. **安全なコミュニティ**: 通報・自動フィルタ・モデレーションがあって初めて公開できる。本機能は**コミュニティ公開の前提（ゲート）**。

### 1.3 非ゴール（本仕様の対象外）
- ポイントの取得/交換そのものの仕様（ミッション・交換所は別仕様）。
- 提携・広告枠の販売管理（BtoB管理は別仕様）。
- 高度なAI内容判定（MVP2では辞書ベース＋しきい値。AI判定はPhase2以降）。

---

## 2. 用語・概念モデル

### 2.1 RPGギルド比喩 ↔ 機能 対応表

| 比喩 | 機能名 | 実体 | 説明 |
|---|---|---|---|
| 箱 / ギルド | **フォーラム (Forum / Guild)** | `forums` | コミュニティの器。公開フォーラム or ゲーム別フォーラム（期間限定開催あり）。 |
| クエスト掲示板の依頼 | **トピック (Topic)** | `topics` | フォーラム内の1スレッド。「依頼/質問/雑談」種別。ポイント賭け可。 |
| 依頼への返答 | **投稿/返信 (Post)** | `posts` | トピックへの本文または返信（ツリー1段）。テキスト/画像/動画。 |
| 反応 | **リアクション (Reaction)** | `reactions` | いいね/注目。投稿・トピックへの軽量評価。 |
| 賭け依頼 | **ポイント賭け質問 (Bounty)** | `bounty_questions` | トピックに付与する賞金。ベストアンサーに移転。 |
| 会話 | **チャット (Chat / DM)** | `chat_channels` / `chat_messages` | フォーラム内会話 & 1:1 DM（Realtime, 段階実装）。 |

### 2.2 階層構造
```
Forum (ギルド/チャンネル) … 公開 or ゲーム別 / 期間限定開催
  └─ Topic (依頼/質問/雑談) … ポイント賭け可
        ├─ Post (本文)
        │     └─ Post (返信: 親=本文 or 他返信、ツリー深さ1段に正規化)
        ├─ Reaction (いいね/注目)
        └─ Bounty (賭けポイント) → BestAnswer(post) へ移転
Chat
  ├─ Forum Chat (フォーラム会話)
  └─ DM (1:1)
```

### 2.3 用語定義
- **ベストアンサー**: トピック作成者（または賭け主）が選定した最良の返信。賭けがある場合は賞金を移転。
- **モデレーター**: フォーラム単位で任命される運営補助者。当該フォーラム内の通報対応・削除・警告が可能。
- **スーパーユーザー / 管理者**: 全フォーラム横断でモデレーション・凍結・BANを実行できる運営者。
- **マーキング**: 「要注意ユーザー」として内部フラグを立てる行為（凍結/BANの前段）。

---

## 3. ユーザーストーリー

### 3.1 一般ユーザー
- **US-01**: ゲーム名でフォーラムを探し、参加して攻略情報を読みたい。
- **US-02**: 困りごと（例: ボス攻略、相場、ポイ活の効率）をトピックとして投稿し、回答を得たい。
- **US-03**: 確実に回答が欲しいので、保有ポイントを賭けて質問したい。
- **US-04**: 他人の質問に回答し、ベストアンサーに選ばれて賭けポイント・評価を得たい。
- **US-05**: 良い回答に「いいね/注目」を付け、評価したい。
- **US-06**: 自分の投稿を編集・削除したい。
- **US-07**: 返信・ベストアンサー選定・リアクション・通報結果を通知で知りたい。
- **US-08**: 不適切な投稿・ユーザーを通報したい。
- **US-09**: 特定ユーザーとDMでやり取りしたい（段階実装）。
- **US-10**: 嫌なユーザーをブロックして表示・DMを止めたい。

### 3.2 モデレーター
- **MS-01**: 担当フォーラムの通報キューを確認し、削除/警告で対応したい。
- **MS-02**: 自動フィルタに引っかかった投稿を確認し、承認/却下したい。
- **MS-03**: 悪質ユーザーを管理者へエスカレーションしたい。

### 3.3 管理者 / スーパーユーザー
- **AS-01**: 全フォーラムの通報を横断管理し、凍結/BANを実行したい。
- **AS-02**: 要注意ユーザーをマーキングし、行動履歴を確認したい。
- **AS-03**: NGワード辞書・しきい値・自動アクションを設定したい。
- **AS-04**: ゲーム別フォーラムを期間限定で作成/開催/終了したい。
- **AS-05**: 賭けポイントの異常（返還漏れ等）を監査ログで追跡したい。

---

## 4. スコープ / MVP配置

### 4.1 機能スコープ一覧

| # | 機能 | MVP配置 | 備考 |
|---|---|---|---|
| F-01 | フォーラム（公開/ゲーム別、参加） | MVP2前半 | 期間限定開催フラグ含む |
| F-02 | トピック作成（依頼/質問/雑談） | MVP2前半 | |
| F-03 | 投稿/返信（テキスト/画像/動画） | MVP2前半 | 動画はStorage+サムネ |
| F-04 | リアクション（いいね/注目） | MVP2前半 | |
| F-05 | 投稿の編集・削除（投稿者のみ） | MVP2前半 | |
| F-06 | 通報（投稿/ユーザー） | MVP2前半 | **公開の前提** |
| F-07 | NGワード自動フィルタ | MVP2前半 | **公開の前提** |
| F-08 | モデレーション管理画面（キュー/対応） | MVP2前半 | **公開の前提** |
| F-09 | 権限（一般/モデレーター/管理者） | MVP2前半 | RLS+ロール |
| F-10 | 通知（返信/BA/リアクション/通報結果） | MVP2前半 | Expo Push |
| F-11 | ポイント賭け質問（Bounty） | MVP2後半 | ポイント基盤連携 |
| F-12 | 回答評価（投票）システム | MVP2後半 | ベストアンサー支援 |
| F-13 | フォーラム内チャット | MVP2後半 | Realtime |
| F-14 | DM（1:1リアルタイム） | 段階実装（MVP2後半〜） | 重要度低の注記あり |
| F-15 | ユーザーブロック | MVP2前半 | 安全装置 |

### 4.2 段階方針
- **公開ゲート**: F-06/F-07/F-08 が稼働しない限りコミュニティ（F-01〜F-05）を一般公開しない。
- **リアルタイム**: チャット/DMはRealtime重要度が高くない注記を踏まえ、まずポーリング/手動更新でも可とし、Realtime購読は後追いで段階導入。

---

## 5. 画面・UI仕様

> モバイル（React Native + Expo）を主、管理画面は Next.js。簡易ワイヤーは概略。

### 5.1 ギルド（フォーラム）一覧 — `GuildListScreen`
- 公開タブ / ゲーム別タブ。ゲーム別は「開催中」バッジ・残り日数表示。
- 検索（ゲーム名・タグ）。参加中フォーラムを上部にピン留め。

```
┌─────────────────────────────┐
│ [検索: ゲーム名/タグ        🔍] │
│ ─ 公開 ─ | ─ ゲーム別 ─        │
│ ★参加中                       │
│  ┌─────────────────────────┐ │
│  │ 🎮 〇〇RPG  [開催中 残5日] │ │
│  │ トピック 128 / 参加 1.2k   │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │ 💬 雑談・ポイ活全般         │ │
│  └─────────────────────────┘ │
│              [＋ フォーラム作成]※管理 │
└─────────────────────────────┘
```

### 5.2 トピック一覧 — `TopicListScreen`
- 並び替え: 新着 / 未解決 / 賞金高 / 注目。
- 各カードに種別バッジ（依頼/質問/雑談）、賞金（💰pt）、返信数、解決済✓。

```
┌─────────────────────────────┐
│ 〇〇RPG  [新着▼][未解決][賞金] │
│ ┌─────────────────────────┐ │
│ │[質問]💰500 ボスXの倒し方？  │ │
│ │ 返信12 ・ 👍8 ・ 2時間前     │ │
│ ├─────────────────────────┤ │
│ │[依頼]✓解決 レア素材トレード   │ │
│ │ 返信5 ・ 注目3              │ │
│ └─────────────────────────┘ │
│                     [＋ 投稿] │
└─────────────────────────────┘
```

### 5.3 トピック詳細（返信） — `TopicDetailScreen`
- 本文（作成者・賞金・種別） → 返信ツリー（1段）。各返信に投票（▲票数）・リアクション・⋯メニュー（編集/削除/通報）。
- 賭けあり & 未解決の場合、作成者にのみ各返信へ「ベストアンサーに選ぶ」ボタン。

```
┌─────────────────────────────┐
│ [質問] ボスXの倒し方？ 💰500pt │
│ by ユーザA ・ 2時間前   [⋯通報]│
│ 本文……（画像/動画添付）        │
│ 👍8  ⭐注目3                  │
│ ─────── 返信 12 ───────       │
│ ▲5 ユーザB: 弱点は氷…   [⋯]    │
│      └ ▲1 ユーザC: 補足…       │
│ ▲2 ユーザD: …          [⋯]    │
│ [このユーザをBAに選ぶ]※作成者    │
│ ─────────────────────────    │
│ [返信を書く… 📷🎥]      [送信] │
└─────────────────────────────┘
```

### 5.4 投稿作成 — `PostComposerScreen`
- 種別選択（依頼/質問/雑談）、タイトル（トピック新規時）、本文、添付（画像/動画, 上限・サイズ表示）。
- 投稿前にクライアント側NG簡易チェック（送信時にサーバ側で確定判定）。

### 5.5 ポイント賭け質問 — `BountyComposer`（トピック作成の拡張）
- 「賞金をかける」トグル → スライダー/入力（残高内・最小/最大）。
- 確認ダイアログ「500ptを賭けます。投稿時に残高から差し引かれます（エスクロー）。解決でBAへ移転、未解決のまま期限切れで返還」。

```
┌─────────────────────────────┐
│ ☑ 賞金をかける                │
│ 賭けポイント [   500 ] pt      │
│ 残高 1,200pt / 最小50 最大2000 │
│ 期限 [ 7日 ▼]                 │
│ ⚠ 投稿時にエスクローへ移動します │
│              [賭けて投稿する]   │
└─────────────────────────────┘
```

### 5.6 通報モーダル — `ReportModal`
- 対象（投稿/ユーザー）、理由カテゴリ（スパム/誹謗中傷/わいせつ/詐欺・RMT/個人情報/その他）、自由記述（任意, 上限500字）。
- 送信後トースト「通報を受け付けました。結果は通知でお知らせします」。**同一対象の重複通報はAPI側で1人1件に集約**。

```
┌─────────────────────────────┐
│ 通報する                      │
│ 理由: ( )スパム ( )誹謗中傷    │
│       ( )わいせつ ( )詐欺/RMT  │
│       ( )個人情報 ( )その他    │
│ 詳細: [____________________]   │
│            [キャンセル] [送信]  │
└─────────────────────────────┘
```

### 5.7 モデレーション管理画面（Next.js） — `/admin/moderation`
- 左: フィルタ（ステータス: 未対応/対応中/解決/却下、理由、フォーラム、自動/手動）。
- 中央: 通報キュー（テーブル: 対象種別・抜粋・理由・通報数・自動スコア・経過時間）。
- 右: 詳細ペイン（対象本文・通報者一覧・対象ユーザー履歴/マーキング・アクションボタン）。

```
┌───────────┬───────────────────────┬──────────────────┐
│ フィルタ    │ 通報キュー              │ 詳細 / 対応        │
│ 未対応 12  │ # 種別 抜粋 理由 通報 経過 │ 本文プレビュー     │
│ 対応中 3   │ 1 投稿 "…RMT…" 詐欺 5 10m│ 通報者: 5名        │
│ 自動検知 7 │ 2 ユーザ "暴言" 中傷 2 1h │ 対象履歴: BAN前科0  │
│ 理由別 …   │ 3 投稿 "宣伝URL" スパム…  │ [削除][警告][凍結]  │
│            │                        │ [BAN][却下][上位送]  │
└───────────┴───────────────────────┴──────────────────┘
```

---

## 6. データモデル

> Postgres（Supabase）。すべて `id uuid default gen_random_uuid()`、`created_at timestamptz default now()`、論理削除は `deleted_at timestamptz`（NULL=有効）を基本とする。金額/ポイントは `integer`（最小単位）。`updated_at` は更新トリガで自動更新。

### 6.1 `user_roles` — 横断ロール
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK→auth.users, NOT NULL | |
| role | text | NOT NULL, CHECK in ('user','moderator','admin','superuser') | 既定はuserとして不在を扱う |
| forum_id | uuid | FK→forums, NULL可 | moderator用（NULL=全体, 値あり=当該フォーラム限定） |
| granted_by | uuid | FK→auth.users | |
| created_at | timestamptz | | |
| UNIQUE | (user_id, role, forum_id) | | |

### 6.2 `forums`（ギルド）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| slug | text | UNIQUE, NOT NULL | URL/識別子 |
| name | text | NOT NULL | |
| description | text | | |
| type | text | CHECK in ('public','game') NOT NULL | 公開/ゲーム別 |
| game_id | uuid | FK→games, NULL可 | type='game'時に必須(アプリ層検証) |
| visibility | text | CHECK in ('listed','unlisted','archived') default 'listed' | |
| is_open | boolean | default true | 投稿受付中か |
| opens_at | timestamptz | NULL可 | 期間限定開催の開始 |
| closes_at | timestamptz | NULL可 | 期間限定開催の終了（過ぎたら読み取り専用） |
| created_by | uuid | FK→auth.users | |
| deleted_at | timestamptz | NULL可 | |

### 6.3 `forum_members` — 参加
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| forum_id | uuid | FK→forums, NOT NULL | |
| user_id | uuid | FK→auth.users, NOT NULL | |
| joined_at | timestamptz | | |
| PK | (forum_id, user_id) | | |

### 6.4 `topics`
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| forum_id | uuid | FK→forums, NOT NULL | |
| author_id | uuid | FK→auth.users, NOT NULL | |
| kind | text | CHECK in ('request','question','chat') NOT NULL | 依頼/質問/雑談 |
| title | text | NOT NULL, length<=120 | |
| status | text | CHECK in ('open','resolved','closed','removed') default 'open' | |
| best_answer_post_id | uuid | FK→posts, NULL可 | 設定は1回のみ（§9） |
| has_bounty | boolean | default false | `bounty_questions`存在の冗長フラグ |
| reply_count | integer | default 0 | 集計キャッシュ |
| last_activity_at | timestamptz | default now() | 並び替え用 |
| moderation_state | text | CHECK in ('visible','pending','hidden') default 'visible' | 自動フィルタ連動 |
| deleted_at | timestamptz | NULL可 | |

### 6.5 `posts`（本文/返信）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| topic_id | uuid | FK→topics, NOT NULL | |
| parent_post_id | uuid | FK→posts, NULL可 | NULL=トピック本文。返信は親本文を指す（ツリー1段に正規化） |
| author_id | uuid | FK→auth.users, NOT NULL | |
| body | text | NOT NULL, length<=5000 | |
| media | jsonb | default '[]' | [{type:'image'|'video', path, thumb, w,h, bytes}] (Storage参照) |
| is_op | boolean | default false | トピック本文か |
| vote_score | integer | default 0 | 回答評価の集計（§6.7） |
| moderation_state | text | CHECK in ('visible','pending','hidden') default 'visible' | |
| edited_at | timestamptz | NULL可 | |
| deleted_at | timestamptz | NULL可 | |

### 6.6 `reactions`（いいね/注目）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| target_type | text | CHECK in ('topic','post') NOT NULL | |
| target_id | uuid | NOT NULL | |
| user_id | uuid | FK→auth.users, NOT NULL | |
| kind | text | CHECK in ('like','spotlight') NOT NULL | いいね/注目 |
| created_at | timestamptz | | |
| UNIQUE | (target_type, target_id, user_id, kind) | | 二重防止 |

### 6.7 `answer_votes`（回答評価/投票）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| post_id | uuid | FK→posts, NOT NULL | 返信のみ対象（アプリ検証） |
| user_id | uuid | FK→auth.users, NOT NULL | |
| value | smallint | CHECK in (-1, 1) | 下げ/上げ |
| created_at | timestamptz | | |
| PK | (post_id, user_id) | | 1人1票。`posts.vote_score`へ反映 |

### 6.8 `bounty_questions`（ポイント賭け）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| topic_id | uuid | FK→topics, UNIQUE, NOT NULL | 1トピック1賭け |
| backer_id | uuid | FK→auth.users, NOT NULL | 賭け主（=作成者） |
| amount | integer | NOT NULL, CHECK amount BETWEEN 50 AND 2000 | エスクロー額 |
| status | text | CHECK in ('escrowed','awarded','refunded','cancelled') default 'escrowed' | |
| expires_at | timestamptz | NOT NULL | 期限。超過で返還バッチ |
| awarded_post_id | uuid | FK→posts, NULL可 | BA確定時 |
| escrow_ledger_id | uuid | FK→point_ledger | 差引取引参照 |
| settled_at | timestamptz | NULL可 | |

> ポイント残高/取引は既存のポイント基盤（`point_wallets` / `point_ledger`）を参照。本仕様は移転の整合性のみ規定（§7.4）。

### 6.9 `reports`（通報）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| target_type | text | CHECK in ('post','topic','user') NOT NULL | |
| target_id | uuid | NOT NULL | |
| reporter_id | uuid | FK→auth.users, NOT NULL | |
| reason | text | CHECK in ('spam','abuse','obscene','fraud_rmt','privacy','other') NOT NULL | |
| detail | text | length<=500 | |
| status | text | CHECK in ('open','triaging','actioned','dismissed') default 'open' | |
| auto_flag | boolean | default false | 自動フィルタ起因か |
| created_at | timestamptz | | |
| UNIQUE | (target_type, target_id, reporter_id) | | 1人1件集約 |

### 6.10 `moderation_queue`（集約キュー）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| target_type | text | NOT NULL | post/topic/user |
| target_id | uuid | NOT NULL | |
| forum_id | uuid | FK→forums, NULL可 | 担当割当用 |
| report_count | integer | default 0 | 集約数 |
| auto_score | numeric | default 0 | フィルタ合計スコア |
| state | text | CHECK in ('pending','in_review','resolved','rejected') default 'pending' | |
| assigned_to | uuid | FK→auth.users, NULL可 | |
| first_reported_at | timestamptz | | SLA計測起点 |
| resolved_at | timestamptz | NULL可 | |
| UNIQUE | (target_type, target_id) | | 1対象1キュー行（通報は集約） |

### 6.11 `moderation_actions`（対応ログ）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| queue_id | uuid | FK→moderation_queue, NULL可 | |
| actor_id | uuid | FK→auth.users, NOT NULL | 対応者 |
| target_type | text | NOT NULL | post/topic/user |
| target_id | uuid | NOT NULL | |
| action | text | CHECK in ('delete_content','warn','suspend','ban','mark','dismiss','escalate','restore') NOT NULL | |
| reason | text | | 内部メモ |
| duration_hours | integer | NULL可 | suspend時の凍結時間 |
| created_at | timestamptz | | 監査ログ（変更不可） |

### 6.12 `user_moderation_state`（凍結/BAN/マーキング状態）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| user_id | uuid | PK, FK→auth.users | |
| status | text | CHECK in ('active','marked','suspended','banned') default 'active' | |
| suspended_until | timestamptz | NULL可 | suspend期限 |
| marked | boolean | default false | 要注意フラグ |
| updated_by | uuid | FK→auth.users | |
| updated_at | timestamptz | | |

### 6.13 `ng_words`（辞書）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| pattern | text | NOT NULL | 単語 or 正規表現 |
| is_regex | boolean | default false | |
| severity | smallint | CHECK in (1,2,3) | 1=警告/2=保留/3=自動非表示 |
| action | text | CHECK in ('flag','hold','block') NOT NULL | |
| enabled | boolean | default true | |

### 6.14 チャット（段階実装）
**`chat_channels`**

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| kind | text | CHECK in ('forum','dm') NOT NULL | |
| forum_id | uuid | FK→forums, NULL可 | kind='forum'時 |
| dm_key | text | UNIQUE, NULL可 | DMは正規化キー `min(uid):max(uid)` で重複防止 |
| created_at | timestamptz | | |

**`chat_members`**: (channel_id, user_id) PK, `last_read_at`。
**`chat_messages`**: id, channel_id FK, sender_id FK, body text(<=2000), media jsonb, moderation_state, created_at, deleted_at。

### 6.15 `user_blocks`（ブロック）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| blocker_id | uuid | FK→auth.users | |
| blocked_id | uuid | FK→auth.users | |
| created_at | timestamptz | | |
| PK | (blocker_id, blocked_id) | | DM/表示の抑止に使用 |

### 6.16 `notifications`
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK→auth.users, NOT NULL | 受信者 |
| type | text | CHECK in ('reply','best_answer','reaction','report_result','moderation','dm') NOT NULL | |
| payload | jsonb | NOT NULL | {topic_id, post_id, actor_id, ...} |
| read_at | timestamptz | NULL可 | |
| created_at | timestamptz | | |

### 6.17 RLS方針（要点）

| テーブル | SELECT | INSERT | UPDATE/DELETE |
|---|---|---|---|
| forums | 全員（visibility='listed' or member）。archived/closedは読取のみ | admin/superuserのみ | admin/superuserのみ |
| topics/posts | `moderation_state='visible'` かつ未削除を全員。pending/hiddenは作者・モデレーター・admin | 認証済 & ban/suspend中でない & フォーラムが`is_open`/開催期間内 | 本文は**author_id=auth.uid()のみ**（編集/論理削除）。モデレーターは当該forum、adminは全体で `moderation_state`/削除可 |
| reactions / answer_votes | 全員 | 認証済 & not banned & 自分の行のみ（user_id=auth.uid()） | 自分の行のみ |
| bounty_questions | 全員（読） | RPC経由のみ（直接INSERT不可） | RPC/サービスロールのみ（クライアント更新禁止） |
| reports | reporter本人 + モデレーター/admin | 認証済 & reporter_id=auth.uid() & not banned | 本人取消不可、状態更新はモデレーター/adminのみ |
| moderation_queue / actions / user_moderation_state / ng_words | モデレーター/admin（forum限定はforum一致） | service_role / admin RPC | service_role / admin RPC |
| chat_messages | チャンネルmember & 相手を未ブロック | member & not banned | 送信者本人の論理削除のみ |
| notifications | user_id=auth.uid() | service_roleのみ（DB側生成） | 本人がread_at更新のみ |

- 監査系（`moderation_actions`, `point_ledger`）は**追記のみ**。UPDATE/DELETE を全ロールで拒否。
- ポイント移転・賭け確定・モデレーション一括反映は **`SECURITY DEFINER` のRPC**に閉じ、クライアントから個別テーブルを直接書かせない。

---

## 7. API・リアルタイム仕様

> 原則: 読み取りは PostgREST（Supabase client）の直接クエリ＋RLS。**金銭/状態遷移を伴う操作はDB関数（RPC, SECURITY DEFINER）**で原子性を担保。

### 7.1 主要RPC（PostgreSQL関数）

| RPC | 入力 | 振る舞い | 整合性 |
|---|---|---|---|
| `create_topic(forum_id, kind, title, body, media, bounty_amount?, expires_at?)` | | トピック+本文postを作成。bounty指定時は同一Tx内で§7.4のエスクローを実行 | 単一トランザクション |
| `add_post(topic_id, parent_post_id?, body, media)` | | 返信作成。NGフィルタ判定→`moderation_state`決定。`reply_count`/`last_activity_at`更新。返信通知enqueue | Tx + トリガ |
| `toggle_reaction(target_type, target_id, kind)` | | 付与/取消（UNIQUE衝突をupsert/delete） | 冪等 |
| `cast_answer_vote(post_id, value)` | | 投票upsert→`vote_score`再集計 | 1人1票 |
| `select_best_answer(topic_id, post_id)` | | 作成者のみ。`topics.status='resolved'`・`best_answer_post_id`設定。bountyあれば§7.4で移転 | **未設定時のみ成功（二重防止）** |
| `report_target(target_type, target_id, reason, detail)` | | report upsert（1人1件）→`moderation_queue`をupsertし`report_count++`。BA通知/結果は後段 | 集約 |
| `moderate(target, action, params)` | | モデレーター/admin権限検証→`moderation_actions`追記＋対象の`moderation_state`/`user_moderation_state`更新。通報結果通知 | 監査追記 |
| `refund_expired_bounties()` | （バッチ/cron） | `expires_at`超過 & `status='escrowed'` を返還 | べき等・行ロック |

### 7.2 読み取りクエリ（例）
- トピック一覧: `from('topics').select('*, bounty_questions(amount,status), author:profiles(...)').eq('forum_id',id).is('deleted_at',null).eq('moderation_state','visible').order('last_activity_at',{ascending:false})`（並び替えはサーバ側ビュー/インデックスで対応）。
- 並び替え用に `idx_topics_forum_activity (forum_id, last_activity_at desc)`、`idx_topics_forum_bounty` などを用意。

### 7.3 Realtimeチャンネル

| 用途 | チャンネル/購読 | 配信内容 | 備考 |
|---|---|---|---|
| トピック詳細の新着返信 | `postgres_changes` on `posts` filter `topic_id=eq.X` | INSERT/UPDATE(visible) | hidden/pendingはクライアントで除外 |
| 反応/投票のライブ更新 | `postgres_changes` on `reactions`/`answer_votes` | 集計はサーバ値を再取得 | 高頻度はデバウンス |
| フォーラムチャット | Realtime channel `chat:forum:{forumId}` | broadcast + `chat_messages`変更 | メンバーのみ（RLS） |
| DM | `chat:dm:{dmKey}` | broadcast/presence | ブロック相手は購読拒否 |
| 通知 | `postgres_changes` on `notifications` filter `user_id=eq.me` | INSERT | フォアグラウンド即時反映 |

- **段階方針**: 初期はトピック詳細の `posts` 購読と通知のみRealtime化。フォーラムチャット/DMは後追い（重要度低の注記）。Push（Expo Notifications）はRealtimeと独立に常時動作。

### 7.4 ポイント賭けのトランザクション整合性（最重要）

**エスクロー（賭け作成）** — `create_topic`内で同一Txに含める:
1. `point_wallets` の残高を `SELECT ... FOR UPDATE` で行ロック。
2. `balance >= amount` を検証（不足なら例外→トピックごとロールバック）。
3. `point_ledger` に `-amount`（種別 `bounty_escrow`）を追記、`bounty_questions(status='escrowed', escrow_ledger_id)` を作成。
4. すべて成功時のみコミット。失敗時は全件ロールバック（トピックも作られない）。

**移転（ベストアンサー確定）** — `select_best_answer`内:
1. `bounty_questions` を `FOR UPDATE`。`status='escrowed'` のみ続行（既に awarded/refunded ならno-op）。
2. 受賞者 = 当該postの`author_id`。**自分のbountyを自分の回答へは移転不可**（検証）。
3. `point_ledger` に受賞者 `+amount`（種別 `bounty_award`）を追記。
4. `bounty_questions(status='awarded', awarded_post_id, settled_at=now())`、`topics(status='resolved', best_answer_post_id)`。
5. 1〜4を単一Tx。`status`の遷移チェックで**二重支払い防止**（楽観ロック相当）。

**返還（期限切れ/取消）** — `refund_expired_bounties` / 取消RPC:
1. `status='escrowed'` & (`expires_at<now()` または明示取消) を `FOR UPDATE`。
2. `point_ledger` に賭け主へ `+amount`（種別 `bounty_refund`）追記、`status='refunded'`。
3. べき等: 既に確定済みはスキップ。バッチは行単位ロックで多重実行に安全。

> 不変条件: 任意時点で各bountyは「エスクローに1回入り、awarded か refunded のどちらか一度だけ確定」。`point_ledger`合計の保存則を監査クエリで検証可能にする。

---

## 8. 通報・モデレーション フロー

### 8.1 全体フロー
```
[ユーザー投稿/編集]
      │
      ▼
[NGワード自動フィルタ]──block(severity3)──▶ moderation_state=hidden（即時非表示）＋自動report(auto_flag)
      │ hold(severity2)
      ├───────────────▶ moderation_state=pending（投稿者には見える/他者非表示）＋キュー投入
      │ flag(severity1) / clean
      ▼
[公開 visible]
      │
   [通報] report_target() ─ 1人1件集約 ─▶ moderation_queue.report_count++
      │                                         │ しきい値(例:報告3 or auto_score>=X)で自動pending化
      ▼                                         ▼
                                       [モデレーションキュー: pending]
                                                 │ assign
                                                 ▼
                                       [in_review] モデレーター/admin
                                                 │
             ┌──────────┬──────────┬──────────┬──────────┬──────────┐
             ▼          ▼          ▼          ▼          ▼          ▼
          dismiss   delete_content  warn     suspend     ban      escalate
         (却下/復帰)  (内容削除)   (警告通知) (一時凍結)  (恒久)   (上位へ)
             │          │          │          │          │          │
             └──────────┴────── moderation_actions 追記（監査） ──────┘
                                                 │
                                                 ▼
                                  [resolved/rejected] ＋ 通報者へ report_result 通知
```

### 8.2 状態遷移

**`reports.status`**: `open → triaging → actioned | dismissed`（一方向）。
**`moderation_queue.state`**: `pending → in_review → resolved | rejected`。`rejected`（=問題なし）時、対象が`hidden/pending`なら`restore`で`visible`へ。
**`user_moderation_state.status`**: `active ⇄ marked`、`active/marked → suspended`（`suspended_until`経過で自動`active`）、`→ banned`（恒久、解除はsuperuserのみ）。

### 8.3 権限マトリクス

| 操作 | 一般 | モデレーター(自forum) | 管理者 | スーパーユーザー |
|---|---|---|---|---|
| 通報する | ✓ | ✓ | ✓ | ✓ |
| キュー閲覧 | ✗ | 自forumのみ | ✓ | ✓ |
| 内容削除/警告 | 自分の投稿削除のみ | ✓ | ✓ | ✓ |
| 一時凍結(suspend) | ✗ | ✓(上限時間あり) | ✓ | ✓ |
| BAN(恒久) | ✗ | ✗（escalate） | ✓ | ✓ |
| マーキング | ✗ | ✓ | ✓ | ✓ |
| NG辞書/しきい値設定 | ✗ | ✗ | ✓ | ✓ |
| BAN解除 | ✗ | ✗ | ✗ | ✓ |

### 8.4 エスカレーション
- モデレーターは `escalate` で `moderation_queue.assigned_to` を解除し `state=pending`＋adminロールへ通知。
- 自動フィルタ `auto_score` が高（例 ≥ しきい値）or 短時間に同一ユーザー複数通報 → 自動エスカレーション（admin宛通知）。

### 8.5 通報結果通知
- 対応確定時、通報者全員へ `report_result` 通知（「対応済み/問題なしと判断」程度の抽象表現。**対象の個人情報や具体的処分内容は通知しない**＝報復・晒し防止）。

---

## 9. 不正・エラー・エッジケース

| ケース | 挙動・対策 |
|---|---|
| **連投/フラッディング** | レート制限: 同一ユーザーの`add_post`を時間窓で制限（例 10秒に1件 / 1分に5件、RPC内でカウント）。超過は429相当エラー。 |
| **スパム（宣伝URL/RMT）** | NG辞書`fraud_rmt`/URL過多をheuristicで`auto_score`加点→pending。短時間多投稿ユーザーは自動マーキング。 |
| **賭け残高不足** | `create_topic`のエスクローでFOR UPDATE→残高検証。不足なら例外でトピックごとロールバック（部分作成しない）。 |
| **二重ベストアンサー** | `select_best_answer`は`status='escrowed'`かつ`best_answer_post_id IS NULL`の時のみ成功。同時実行は行ロックで一方のみ成立、他方no-op。 |
| **自分の賭けを自分の回答に** | backer_id == 受賞post.author_id を拒否。 |
| **回答ゼロで期限切れ** | `refund_expired_bounties`が賭け主へ全額返還（`bounty_refund`）。BA未選定のまま手動closeも返還。 |
| **BA選定後の対象削除** | 受賞postが後にモデレーションで削除されても移転は確定済（取消はsuperuser手動＋逆仕訳`bounty_clawback`）。 |
| **荒らし（編集すり替え）** | 編集で`edited_at`記録＋差分を内部監査ログに保持。編集後も再度NGフィルタ通過必須。一定回数以上の編集連打は制限。 |
| **削除済みへの返信競合** | `add_post`時に親topic/postの`deleted_at`/`status='closed'`を検証し拒否。 |
| **重複通報** | UNIQUE(target,reporter)で1件に集約。多重送信はupsertで冪等。 |
| **自己通報/自リアクション乱用** | 自分の投稿への通報は無効化、リアクションは許容するが`vote_score`に自票は加算しない（自票禁止: answer_votesで自post投票を拒否）。 |
| **ブロック回避DM** | `user_blocks`に該当があればRPC/RLSでメッセージ送信・チャンネル購読を拒否。 |
| **凍結/BANユーザーの書込** | すべての書込RPCで`user_moderation_state.status`を先頭検証（banned/suspended中は拒否、読取は可）。 |
| **メディア悪用** | Storageアップロードはサイズ/MIME/拡張子検証、署名付きURL、動画はサムネ生成。NSFW疑いは将来AIフック（MVP2は手動通報依存）。 |
| **Realtime取りこぼし** | クライアントは購読＋一定間隔で再フェッチ（reconciliation）。最終的真実はDB値。 |
| **ポイント台帳の不整合** | 移転は単一Tx＋追記専用台帳。定期監査クエリで `sum(ledger)==wallet.balance` を検証、乖離検知でアラート。 |

---

## 10. 計測 / KPI

### 10.1 エンゲージメント
- 日次/週次 トピック作成数、投稿（返信）数、アクティブ投稿者数（DAU/WAUに対する比率）。
- フォーラム別 参加者数・投稿密度（ゲーム別開催の効果測定）。

### 10.2 互助の質
- **回答率** = 1件以上返信が付いたトピック / 全トピック。
- **解決率** = `status='resolved'` トピック / 質問・依頼トピック。
- 平均初回返信時間（質問投稿→最初の返信）。
- ベストアンサー選定率、平均`vote_score`。

### 10.3 ポイント賭け
- 賭け付与率（bounty付き質問比率）、平均賭け額、移転成立率、返還率。
- 賭けあり vs なしの解決率・初回返信時間の差分。

### 10.4 安全性・モデレーション運用
- 通報数（理由別）、自動フィルタ捕捉率、自動/手動比率。
- **通報対応時間（SLA）**: `first_reported_at → resolved_at` の中央値/95p。
- 再犯率（warn→suspend→banの遷移率）、誤検知率（hidden→restore割合）。

### 10.5 計測実装
- 主要イベントを `analytics_events`（別基盤）にも送出、または上記テーブルから日次集計ビュー（`mv_community_kpis`）を生成。管理画面ダッシュボードで可視化。

---

## 11. 受け入れ基準（チェックリスト）

### コミュニティ基盤（MVP2前半）
- [ ] 公開/ゲーム別フォーラムを作成・一覧・参加でき、ゲーム別は`opens_at/closes_at`で開催期間が制御される。
- [ ] 期間外（closed/archived）フォーラムは読み取り専用となり、投稿RPCが拒否される。
- [ ] トピック（依頼/質問/雑談）を作成でき、本文・返信（ツリー1段）・画像/動画添付が表示される。
- [ ] 投稿者のみが自分の投稿を編集・削除でき、他者は不可（RLSで拒否）。
- [ ] いいね/注目が1人1回で付与・取消でき、二重付与がUNIQUEで防止される。
- [ ] 通知（返信/リアクション）がExpo Pushとアプリ内で届く。

### 安全装置（公開ゲート, MVP2前半）
- [ ] NGワード辞書で `block/hold/flag` が機能し、severity3は即時hidden＋自動通報される。
- [ ] 通報モーダルから通報でき、同一対象×同一通報者は1件に集約される。
- [ ] モデレーション管理画面でキューを閲覧し、削除/警告/凍結/BAN/却下/エスカレーションを実行できる。
- [ ] 各対応が `moderation_actions` に監査追記（変更不可）される。
- [ ] 権限マトリクス（一般/モデレーター(自forum)/管理者/スーパーユーザー）どおりに操作が制限される。
- [ ] banned/suspendedユーザーはすべての書込RPCで拒否され、読取は可能。
- [ ] 通報者へ `report_result` 通知が届き、対象の個人情報・具体的処分は通知に含まれない。
- [ ] ユーザーブロックでDM送信・チャンネル購読・表示が抑止される。

### ポイント賭け / 回答評価（MVP2後半）
- [ ] 賭け付き質問でエスクローが同一Txで成立し、残高不足時はトピックごとロールバックされる。
- [ ] ベストアンサー選定で賭けポイントが受賞者へ移転し、**二重支払いが構造上発生しない**（status遷移＋行ロックで検証）。
- [ ] 自分の賭けを自分の回答へ移転しようとすると拒否される。
- [ ] 期限切れ/取消で賭け主へ全額返還され、`refund_expired_bounties`がべき等に動作する。
- [ ] 回答投票が1人1票で集計され、自post自票が拒否される。
- [ ] 監査クエリで `sum(point_ledger)` と wallet 残高が一致する。

### リアルタイム（段階実装）
- [ ] トピック詳細で新着返信がRealtime（または再フェッチreconciliation）で反映される。
- [ ] 通知がRealtimeでフォアグラウンド即時反映される。
- [ ] フォーラムチャット/DMは後追い実装でも、未実装時にコア機能が破綻しない。

### 計測
- [ ] 回答率・解決率・通報対応時間（中央値/95p）が集計・ダッシュボード表示できる。
