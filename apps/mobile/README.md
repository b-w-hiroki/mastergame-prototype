# MasterGame Mobile (Expo)

React Native + Expo (expo-router, TypeScript) の本番モバイルアプリ。
プロトタイプ `wireframes/core-flow.html` の画面・導線を、Supabase に接続した実装へ落とし込んでいます。

## セットアップ

```bash
cd apps/mobile
npm install
cp .env.example .env        # Supabase の URL / anon key を設定
npm start                   # Expo Dev Server（i: iOS / a: Android / w: Web）
npm run typecheck           # tsc --noEmit
```

## 構成

```
app/
  _layout.tsx           # 認証＋オンボーディングのゲート
  login.tsx             # メール / OAuth ログイン
  signup.tsx            # 新規登録
  forgot.tsx            # パスワード再設定（リセットメール）
  onboarding.tsx        # オンボーディング（4枚）
  genres.tsx            # 好きなジャンル選択（user_genres）
  exchange.tsx          # ポイント交換（request_exchange RPC）
  topic/[id].tsx        # トピック詳細（投稿閲覧・通報）
  (tabs)/
    _layout.tsx         # 下部タブ（ホーム/ミッション/ポイント/コミュニティ/マイページ）
    index.tsx           # ホーム（残高・VIP・ナッジ・お知らせ・デイリー）
    missions.tsx        # ミッション（種別タブ・オファー・postback検証ステータス）
    points.tsx          # ポイント（推移グラフ・ステーキング・履歴）
    community.tsx       # コミュニティ（ギルド・トピック一覧）
    mypage.tsx          # マイページ（VIPランク・ジャンル・設定）
src/lib/
  supabase.ts           # Supabase クライアント（AsyncStorage 永続化・PKCE）
  auth.ts               # OAuth（ディープリンク）
  theme.ts              # 共通カラーパレット
  types.ts              # ドメイン型（本番は supabase gen types で自動生成へ）
```

## 実装済みの主なフロー

- 認証：メール / OAuth（Google・Apple）/ 新規登録 / パスワード再設定
- 初回：オンボーディング → ジャンル選択（パーソナライズ）
- ホーム：残高・VIPランク・スマートナッジ・お知らせ・デイリーミッション受取
- ミッション：デイリー/ウィークリー/実績/期間限定の切替、提携オファー、**postback検証（検証中→確定）**
- ポイント：残高（円換算）・推移グラフ・ステーキング（保有ボーナス）・履歴
- コミュニティ：ギルド/トピック閲覧・通報
- マイページ：VIPランク（次ランクまでの進捗）・ジャンル編集・設定・ログアウト

## Web / PWA 書き出し

ネイティブ配信（App Store / Google Play）に加えて、**Web/PWA** として書き出せます
（`react-native-web` 経由。`app.json` の `web` 設定でマニフェスト項目を定義）。

```bash
# 環境変数（EXPO_PUBLIC_SUPABASE_URL / ANON_KEY）を設定したうえで
npm run export:web        # = expo export -p web && node scripts/inject-pwa.mjs
# → dist/ に静的サイトを生成。HTTPS で配信すると「ホーム画面に追加 / インストール」可能
```

- `output: "single"`（SPA）で書き出し、`scripts/inject-pwa.mjs` が `dist/index.html` に
  manifest リンク・apple メタ・Service Worker 登録を後付けします。
- PWA 資産は `public/`（`manifest.webmanifest` / `sw.js` / `offline.html` / アイコン）に置き、
  書き出し時に `dist/` ルートへコピーされます。
- `metro.config.js`：`@supabase/supabase-js` が optional に参照する `@opentelemetry/api` を
  空モジュールにフォールバック（バンドル解決のため）。
- 実際にインストール可能になるのは **HTTPS で配信した後**です（`localhost` でも確認可）。

> ネイティブ配信と Web/PWA は併存できます。Web/PWA は社外公開・即時アクセス用の補助ラインです。

## バックエンド

スキーマ・RPC は `../../supabase/`。型は本番で自動生成を推奨：

```bash
supabase gen types typescript --project-id <id> > src/lib/database.types.ts
```

## コミュニティ書き込み

- トピック作成（`/topic/new`）・返信・リアクション・ベストアンサー・ポイント賭け質問に対応。
- 書き込みはすべて SECURITY DEFINER RPC 経由（`supabase/migrations/0012_community_rpc.sql`）：
  `create_topic` / `add_reply` / `toggle_reaction` / `set_best_answer`。
  通報のみ `reports` へ直接 insert（RLS で許可）。
- 賭け質問：作成時にポイントをエスクロー、ベストアンサー選定で回答者へ進呈。

## 次フェーズ（未実装）

- プッシュ通知（Expo Notifications）、交換履歴の詳細表示
- 投稿への画像/動画添付（Storage + サムネ）
