# スマートナッジ（あと◯P） 機能仕様書

- プロダクト: MasterGame（ポイ活 × ゲームコミュニティ）
- 運営: 株式会社クリティカルヒット
- 対象MVP: MVP1（基本ナッジ） / MVP1.5〜2（パーソナライズ・Push連携）
- 関連技術: React Native + Expo (TS) / Supabase (Postgres, Realtime, Edge Functions) / Expo Notifications
- ステータス: Draft

---

## 1. 目的・提供価値

### 1.1 概要
ユーザーの現在ポイント残高と交換アイテム一覧を突き合わせ、「**あと◯Pで『◯◯』と交換できます**」というメッセージを適切な場所・タイミングで提示する軽量施策。あわせて不足分を埋める「おすすめミッション」への動線を提供し、交換・回遊・継続を後押しする。

### 1.2 行動経済学的根拠
- **ゴール勾配効果 (Goal-Gradient Effect)**: ゴールに近づくほど行動が加速する。「あと◯P」と残距離を可視化することで、最後の一押しを引き出す。
- **損失回避 (Loss Aversion)**: 「あと少しで手に入る」状態を提示すると、達成しないことが損失に感じられ、行動が促される。
- **目標の具体化 (Goal Setting)**: 抽象的な「ポイントを貯めよう」より、「ガチャチケットまであと50P」のように対象と距離が具体化されるほど着手率が上がる。
- **エンダウト・プログレス効果 (Endowed Progress)**: 既に一定の進捗がある状態を示すと完遂意欲が高まる（進捗バー併用）。

### 1.3 提供価値
| 観点 | 価値 |
| --- | --- |
| ユーザー | 次に何をすれば良いかが明確になり、達成感を得やすい |
| 提携ゲーム | アイテム交換が増え、送客・エンゲージメントが向上 |
| 運営 | 実装が軽量でありながら交換率・継続率の改善が見込める。A/Bで効果測定可能 |

### 1.4 設計原則
- **軽量第一**: 既存データ（残高・アイテム・ミッション）から計算で導出。新規の重いインフラを増やさない。
- **押し付けない**: 頻度制御・クールダウンで出し過ぎを防ぐ。
- **正確性**: 在庫切れ・既交換可能などの状態を必ず反映し、空振りナッジを出さない。

---

## 2. ユーザーストーリー

- **US-01**: ポイ活ユーザーとして、ホームを開いたとき「あと◯Pで欲しいアイテムに届く」とわかると、ミッションを続けるモチベーションが上がる。
- **US-02**: ユーザーとして、交換画面で各アイテムに「あと◯Pで交換可」と出ていると、どれを目標にすべきか判断しやすい。
- **US-03**: ユーザーとして、ミッション達成の演出後に「あと◯Pで◯◯」と次の目標が提示されると、続けてもう1つこなしたくなる。
- **US-04**: ゲーム好きユーザーとして、自分が遊ぶゲームのアイテムが優先的に提示されると、自分ごととして感じられる。
- **US-05**: ユーザーとして、「あと50Pでガチャチケット」というPush通知が来ると、アプリに戻るきっかけになる（ただし頻繁すぎないこと）。
- **US-06**: 運営として、ナッジの表示・クリック・交換到達をログで追えると、効果を定量評価し改善できる。

---

## 3. スコープ / MVP配置

### 3.1 機能スコープ
| # | 機能 | MVP配置 | 備考 |
| --- | --- | --- | --- |
| F-01 | ホーム上部ナッジバナー（あと◯P） | MVP1 | コア導線 |
| F-02 | 交換画面アイテムカードの「あと◯Pで交換可」表示 | MVP1 | カード単位の差分表示 |
| F-03 | ポイント画面のナッジ表示 | MVP1 | 進捗バー併用 |
| F-04 | 不足分を埋める「おすすめミッション」サジェスト | MVP1 | 候補ミッションへ遷移 |
| F-05 | ミッション達成演出後のサジェスト | MVP1 | 達成直後の二次行動喚起 |
| F-06 | パーソナライズ重み付け（遊ぶゲーム/交換履歴） | MVP1.5〜2 | スコアリング強化 |
| F-07 | Push通知連携（行動喚起） | MVP1.5〜2 | 頻度ガード必須 |
| F-08 | A/Bテスト枠・表示制御の高度化 | MVP1.5〜2 | バリアント配信 |
| F-09 | ナッジ表示ログ・KPIダッシュボード | MVP1（ログ）/ MVP3（分析） | nudge_events |

### 3.2 非スコープ（本仕様外）
- 課金導線・ポイント購入の提案
- 機械学習ベースのレコメンド（将来拡張。本仕様はルールベース）
- アイテム在庫管理そのものの設計（在庫値の参照のみ行う）

---

## 4. 画面・UI仕様

### 4.1 共通要素
- **文言テンプレート**: `あと{gap}Pで「{itemName}」と交換できます`
- **進捗表現**: `progress = balance / itemCost`（0.0〜1.0）。進捗バーまたは「{balance} / {cost} P」表記。
- **CTA**: 「ミッションでためる」→おすすめミッション、または「交換する」（既に交換可能な場合）。
- **対象が無い場合**: ナッジ自体を非表示（後述エッジケース参照）。

### 4.2 ホーム上部ナッジバナー（F-01）
表示位置: ホーム最上部、残高表示の直下。

```
┌────────────────────────────────────────────┐
│  あと 50P で「ガチャチケット」と交換できます   │
│  [■■■■■■■■░░]  450 / 500 P                  │
│  → おすすめミッション「記事を読む(+30P)」     │
│                              [ ためる ]      │
└────────────────────────────────────────────┘
```
挙動:
- バナータップ→対象アイテム詳細 or おすすめミッション（タップ領域で分岐。CTAボタンはミッション、本文はアイテム詳細）。
- 表示は頻度制御に従う（§7）。
- 交換可能になったら文言を `「ガチャチケット」と交換できます！` に切替（gap=0）。

### 4.3 交換画面アイテムカード（F-02）
表示位置: 各交換アイテムカードのフッター部。

```
┌──────────────┐   ┌──────────────┐
│  ガチャチケット │   │  限定スキン    │
│   500P       │   │   1200P      │
│ あと50Pで交換可 │   │ あと750Pで交換可│
└──────────────┘   └──────────────┘
```
挙動:
- `gap > 0`: `あと{gap}Pで交換可`（控えめなアクセントカラー）。
- `gap <= 0`（交換可能）: `交換できます`（強調色）+ 交換ボタン活性。
- 在庫切れ: `品切れ`（グレーアウト、ナッジ文言は非表示）。

### 4.4 ポイント画面（F-03）
表示位置: 残高カードの下。最も近いアイテム1件をハイライト。

```
あなたの残高: 450P
─────────────────────────────
🎯 次の目標: 「ガチャチケット」(500P)
   あと 50P  [■■■■■■■■░░] 90%
   [ おすすめミッションを見る ]
```

### 4.5 ミッション達成演出後サジェスト（F-05）
表示タイミング: ミッション達成→ポイント付与アニメーション完了直後のモーダル/トースト。

```
┌────────────────────────┐
│   +30P 獲得！🎉          │
│  あと20Pで「ガチャチケット」│
│      に届きます           │
│   [ もう1つミッション ]   │
└────────────────────────┘
```
挙動:
- 付与後の**新残高**で再計算して表示。
- gap が 0 以下になった場合は `交換できるようになりました！[交換する]` に切替。
- このサジェストはクールダウンの対象外（達成直後の文脈が強いため）だが、1達成につき最大1回。

### 4.6 Push通知（F-07, MVP1.5〜2）
- 文言例: `あと50Pでガチャチケットと交換できます。ミッションでためよう！`
- 送信条件: §7 のPush頻度ガードを満たす場合のみ。
- ディープリンク: タップ→ホーム or 対象アイテム/おすすめミッション。

---

## 5. データモデル / 入力データ

### 5.1 入力データ（既存テーブルから取得）
| データ | 取得元（想定） | 用途 |
| --- | --- | --- |
| ポイント残高 `balance` | `user_points` / 残高ビュー | gap算出の基準 |
| 交換アイテム一覧 | `exchange_items` | 候補抽出（cost, 在庫, 提携ゲーム, 種別） |
| ミッション一覧 | `missions` | おすすめミッション（報酬P, 種別, 状態） |
| ユーザー交換履歴 | `exchange_history` | パーソナライズ重み付け |
| ユーザーの遊ぶゲーム | `user_games` / プロフィール | パーソナライズ重み付け |

想定カラム（既存定義に合わせて読み替え）:
- `exchange_items(id, name, cost_points, stock, partner_game_id, reward_type /* 'game_item' | 'physical' */, is_active)`
- `missions(id, title, reward_points, mission_type /* daily|weekly|achievement|limited */, status, expires_at)`

### 5.2 新規テーブル: `nudge_events`（表示・計測ログ）
```sql
create table nudge_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  placement     text not null,            -- 'home_banner' | 'exchange_card' | 'points_screen' | 'post_achievement' | 'push'
  item_id       uuid,                     -- 対象交換アイテム（候補が無ければ null）
  gap_points    integer,                  -- 表示時点の不足ポイント
  balance       integer,                  -- 表示時点の残高
  recommended_mission_id uuid,            -- 同時提示したおすすめミッション
  variant       text default 'control',   -- A/Bバリアント
  event_type    text not null,            -- 'impression' | 'click' | 'reached' | 'exchanged' | 'dismissed'
  created_at    timestamptz not null default now()
);

create index nudge_events_user_created_idx on nudge_events (user_id, created_at desc);
create index nudge_events_placement_idx on nudge_events (placement, event_type);
```
- RLS: `user_id = auth.uid()` で本人のみ insert/select。集計は管理側（service role）で実施。
- `impression` はナッジ表示時、`click` はCTAタップ、`reached` は gap が 0 以下になった瞬間、`exchanged` は対象アイテム交換成立、`dismissed` は明示的に閉じた時に記録。

### 5.3 任意テーブル: `nudge_cooldowns`（頻度制御の永続化、軽量版は端末保持でも可）
```sql
create table nudge_cooldowns (
  user_id       uuid not null references auth.users(id),
  placement     text not null,
  last_shown_at timestamptz not null default now(),
  last_variant  text,
  primary key (user_id, placement)
);
```
- MVP1の最小実装では端末ローカル（AsyncStorage）で代替可。サーバー側に置くと複数端末で一貫。

---

## 6. レコメンドロジック

### 6.1 全体フロー
```
入力: balance, items[], missions[], userGames[], history[]
1) 候補抽出: 交換“未到達 or 僅差”かつ在庫ありの items を抽出
2) スコアリング: 近さ・価値・パーソナライズで各候補を採点
3) 選定: 最高スコアの item を採用し、不足分を埋める mission を1つ選ぶ
出力: { item, gap, progress, recommendedMission }
```

### 6.2 候補抽出（フィルタ）
- `is_active = true` かつ `stock > 0`。
- `gap = cost_points - balance` を計算。
- 候補対象: `0 < gap <= REACHABLE_THRESHOLD`（例: 直近で届きうる範囲。閾値は残高比でも可）。
  - 補足: gap <= 0（既に交換可能）のアイテムは「ナッジ対象」ではなく「交換可能バッジ」で扱う（§8参照）。
- `REACHABLE_THRESHOLD` の決め方（両論）:
  - 固定値版: `gap <= 500`（運用設定）。シンプル。
  - 相対版: `gap <= max(balance * 0.5, dailyEarnableEstimate * 3)`（数日で届く範囲）。動的で自然。

### 6.3 スコアリング式
各候補アイテムにスコアを付与（高いほど優先）:
```
score(item) =
    w_near        * nearness(item)          // 近さ（gapが小さいほど高い）
  + w_value       * valueScore(item)        // 価値（cost_pointsを正規化）
  + w_personal    * personalBoost(item)     // パーソナライズ（MVP1.5〜）
  - w_seen        * recentlyShownPenalty(item) // 直近提示のペナルティ（ローテーション）

nearness(item)      = 1 - (gap / REACHABLE_THRESHOLD)           // 0〜1
valueScore(item)    = normalize(cost_points)                    // 高価値ほど達成感大、0〜1
personalBoost(item) =
      (userGames.includes(item.partner_game_id) ? 1 : 0) * b_game
    + (history.exchanged(item.partner_game_id)   ? 1 : 0) * b_history
    + (item.reward_type == preferredType        ? 1 : 0) * b_type
recentlyShownPenalty(item) = shownCountLast24h(item) / SHOWN_CAP // 0〜1
```
推奨初期ウェイト（運用で調整）:
- `w_near = 0.5`, `w_value = 0.2`, `w_personal = 0.3`, `w_seen = 0.2`
- `b_game = 0.6`, `b_history = 0.3`, `b_type = 0.1`

設計意図: 「近さ」を最重視（ゴール勾配を最大化）しつつ、価値とパーソナライズで自分ごと化、直近提示ペナルティで単調さを回避。

### 6.4 おすすめミッション選定
不足分 `gap` を埋めるミッションを1つ選ぶ:
```
candidates = missions.filter(m => m.status == 'available')
// 1) gap を1つで埋められる最小報酬のミッション（オーバーキル最小）
single = candidates.filter(m => m.reward_points >= gap)
                   .sortBy(m => m.reward_points).first()
if (single) return single
// 2) 単発で届かない場合は、報酬効率の良い手近なミッション（daily/簡単優先）
return candidates.sortBy(m => [typePriority(m), -m.reward_points]).first()
// typePriority: daily < weekly < achievement < limited（着手しやすさ順）
```
- 期間限定（limited）で `expires_at` が近いものは軽くブースト（取り逃し回避）。

### 6.5 クライアント版 vs サーバー版（両論併記）

| 観点 | クライアント版（RN内で計算） | サーバー版（Supabase Edge Function） |
| --- | --- | --- |
| 計算場所 | アプリ起動時/残高更新時に端末で算出 | API/Edge Functionで算出して返す |
| 入力取得 | items/missions を取得済みキャッシュから利用 | サーバー側でDB直参照 |
| メリット | レイテンシ最小・オフライン耐性・サーバーコストゼロ | ロジック一元管理・A/B制御容易・重み更新が即時反映・端末非依存 |
| デメリット | ロジック更新にアプリ更新が必要・端末ごとに差が出うる | ネットワーク必須・関数の運用コスト |
| 推奨適用 | **MVP1の基本ナッジ**（軽量・即効） | **MVP1.5〜のパーソナライズ/Push/A/B**（一元制御が効く） |

ハイブリッド推奨: 表示自体はクライアント計算で即時化し、A/Bバリアントやウェイトはサーバー設定（リモートコンフィグ/テーブル）から取得して反映。

### 6.6 擬似コード（クライアント軽量版）
```ts
function buildNudge(ctx: { balance: number; items: Item[]; missions: Mission[]; userGames: string[]; history: History }): Nudge | null {
  const candidates = ctx.items
    .filter(i => i.is_active && i.stock > 0)
    .map(i => ({ item: i, gap: i.cost_points - ctx.balance }))
    .filter(c => c.gap > 0 && c.gap <= REACHABLE_THRESHOLD);

  if (candidates.length === 0) return null;

  const scored = candidates
    .map(c => ({ ...c, score: scoreItem(c.item, c.gap, ctx) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const mission = pickMission(best.gap, ctx.missions);

  return {
    item: best.item,
    gap: best.gap,
    progress: ctx.balance / best.item.cost_points,
    recommendedMission: mission,
  };
}
```

---

## 7. 表示制御・状態遷移

### 7.1 頻度制御 / クールダウン
| placement | クールダウン（推奨初期値） | 上限 |
| --- | --- | --- |
| home_banner | 同一アイテムは6時間に1回まで再表示 | 1日 最大3 impression |
| points_screen | 画面表示ごと（クールダウンなし、画面内は1件） | — |
| exchange_card | 常時表示（カードの一部、頻度制御対象外） | — |
| post_achievement | 1達成につき最大1回 | 連続表示でも達成都度 |
| push | 24時間に1通まで、かつ静音時間帯(22:00-08:00)は送らない | 週 最大3通 |

- 定数（運用設定）: `HOME_COOLDOWN_HOURS = 6`, `HOME_DAILY_CAP = 3`, `PUSH_MIN_INTERVAL_HOURS = 24`, `PUSH_WEEKLY_CAP = 3`, `QUIET_HOURS = [22, 8]`。

### 7.2 ローテーション
- 直近24hに提示済みのアイテムは `recentlyShownPenalty` でスコアを下げ、同じものを繰り返し出さない。
- 候補が複数あるとき、トップ固定ではなく上位N件から重み付きで選ぶ（バナーの単調さ回避）。

### 7.3 A/Bテスト枠
- `variant` を `nudge_events` に記録。割当はユーザーID hash で安定割当（例: `hash(user_id) % 100 < ratio`）。
- バリアント例:
  - `control`: ナッジ非表示（または現行表示）
  - `near_only`: 近さ重視
  - `personalized`: パーソナライズ重み有効
- 効果は §9 のKPIで比較。

### 7.4 状態遷移
```
[非表示] --候補あり&クールダウンOK--> [表示(impression)]
[表示] --CTAタップ--> [click] --> ミッション/アイテム画面
[表示] --閉じる--> [dismissed] --> クールダウン延長
[表示中に残高がcost到達] --> [reached] --文言切替--> 「交換できます」
[reached] --交換成立--> [exchanged] --> 次候補へ再計算
```

---

## 8. エッジケース

| ケース | 挙動 |
| --- | --- |
| 既に交換可能なアイテムがある（gap<=0） | ナッジは「あと◯P」ではなく「**交換できます**」に切替。CTAは「交換する」。複数あれば最も価値の高い1件を強調 |
| 残高ゼロ / 履歴なし新規ユーザー | 最も低コストの在庫ありアイテムを目標に提示。`あと◯Pで最初の交換ができます` のオンボーディング文言 |
| 候補が全く無い（全アイテムが閾値外 or 在庫切れ） | ナッジ非表示。バナー領域を詰める（空バナーを出さない） |
| 対象アイテムが在庫切れ（stock<=0） | 候補から除外。表示中に在庫切れになったら次候補へ自動差し替え |
| 対象ゲーム未設定（userGames空） | パーソナライズは無効化し、近さ・価値のみでスコアリング。プロフィール設定を促す軽い導線を併設可 |
| おすすめミッションが見つからない | アイテムナッジは表示しつつ、CTAを「ミッション一覧へ」に変更 |
| ミッション達成で複数アイテムが同時に交換可能化 | post_achievement では最も近かった/価値の高い1件のみ祝福表示し、残りは交換画面のバッジで表現 |
| 残高がリアルタイム更新（Realtime） | 残高変化イベントで再計算。表示中バナーは差分のみ更新しチラつかせない（デバウンス推奨） |
| 閾値ギリギリで候補が頻繁に入れ替わる | ヒステリシス（表示中アイテムは多少閾値を超えても一定時間保持）で安定化 |

---

## 9. 計測 / KPI

### 9.1 ファネル
```
impression（表示）
  → click（CTAタップ）
    → reached（gapが0以下に到達）
      → exchanged（対象アイテム交換成立）
```

### 9.2 主要KPI
| KPI | 定義 | 目的 |
| --- | --- | --- |
| ナッジCTR | `click / impression` | 訴求力の評価 |
| ナッジ経由交換率 | `exchanged(ナッジ起点) / impression` | 最重要。施策の直接効果 |
| 到達率 | `reached / click` | 目標到達まで導けているか |
| 交換転換率 | `exchanged / reached` | 到達後に実際に交換したか |
| placement別効果 | 上記をplacement軸で分解 | どの設置面が効くか |
| variant別効果 | A/B比較（control vs 各variant） | 統計的に効果検証 |
| ナッジ起点ミッション着手率 | おすすめミッションのclick→達成率 | 動線の有効性 |
| dismiss率 | `dismissed / impression` | 出し過ぎ・不快度の監視 |

### 9.3 計測実装
- 全イベントを `nudge_events` に記録（§5.2）。`variant` を必ず付与。
- ナッジ起点の交換は、交換成立時に直近の `click`/`impression` と `item_id` で紐付け（アトリビューション窓: 例 24h）。
- 管理画面（Next.js）でファネル・KPIを可視化（MVP3）。MVP1ではrawログ蓄積を担保すれば足りる。

---

## 10. 受け入れ基準

### 機能（MVP1）
- [ ] ホーム上部に「あと◯Pで『◯◯』と交換できます」バナーが、候補がある場合のみ表示される
- [ ] 交換画面の各アイテムカードに `あと◯Pで交換可` / `交換できます` / `品切れ` が正しく出し分けされる
- [ ] ポイント画面に最も近いアイテム1件と進捗バーが表示される
- [ ] おすすめミッションのCTAから、不足分を埋められるミッションへ遷移できる
- [ ] ミッション達成演出後に、新残高で再計算したサジェストが最大1回表示される
- [ ] gap が 0 以下のとき文言が「交換できます」に切り替わり、交換CTAが活性化する

### ロジック
- [ ] 候補抽出が「在庫あり・有効・gap が閾値内」のアイテムのみを対象にする
- [ ] スコアリングで「近さ」が最優先され、最高スコアの1件が選定される
- [ ] おすすめミッションが、gap を満たす最小報酬のミッションを優先選定する
- [ ] パーソナライズ無効時（ゲーム未設定）でも近さ・価値のみで正しく動作する

### 表示制御
- [ ] ホームバナーのクールダウン（同一アイテム6h/日次上限3）が機能する
- [ ] 直近提示アイテムにペナルティがかかり、同一アイテムが連続提示されにくい
- [ ] A/Bバリアントがユーザー単位で安定割当され、`nudge_events.variant` に記録される

### エッジケース
- [ ] 候補ゼロ・在庫切れのとき空バナーを表示しない
- [ ] 残高ゼロの新規ユーザーに最低コストアイテムのオンボーディング文言が出る
- [ ] 既に交換可能なアイテムがあるとき「交換できます」表示に切り替わる
- [ ] 残高のリアルタイム更新でチラつかず再計算される（デバウンス）

### 計測
- [ ] impression / click / reached / exchanged / dismissed が `nudge_events` に記録される
- [ ] ナッジ経由交換がアトリビューション窓内で正しく紐付けられる
- [ ] placement・variant 別にファネルが集計できる

### Push（MVP1.5〜2、該当時）
- [ ] Push頻度ガード（24h最小間隔・週上限・静音時間帯）が守られる
- [ ] Pushタップで対象アイテム/おすすめミッションへディープリンク遷移する

---

### 付録: 主要定数（運用設定の初期値）
| 定数 | 初期値 | 説明 |
| --- | --- | --- |
| REACHABLE_THRESHOLD | 500P（または相対式） | 候補とみなす最大gap |
| HOME_COOLDOWN_HOURS | 6 | 同一アイテム再表示間隔 |
| HOME_DAILY_CAP | 3 | ホームバナー日次impression上限 |
| PUSH_MIN_INTERVAL_HOURS | 24 | Push最小送信間隔 |
| PUSH_WEEKLY_CAP | 3 | Push週次上限 |
| QUIET_HOURS | 22:00–08:00 | Push静音時間帯 |
| w_near / w_value / w_personal / w_seen | 0.5 / 0.2 / 0.3 / 0.2 | スコアウェイト |
| ATTRIBUTION_WINDOW_HOURS | 24 | ナッジ→交換の紐付け窓 |
