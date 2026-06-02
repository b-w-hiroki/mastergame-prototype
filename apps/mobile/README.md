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

## バックエンド

スキーマ・RPC は `../../supabase/`。型は本番で自動生成を推奨：

```bash
supabase gen types typescript --project-id <id> > src/lib/database.types.ts
```

## 次フェーズ（未実装）

- コミュニティの**書き込み**（トピック作成・返信・リアクション・ベストアンサー/賭け質問）
  → バックエンドの insert RLS / RPC 整備が必要
- プッシュ通知（Expo Notifications）、交換履歴の詳細表示
