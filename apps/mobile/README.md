# MasterGame Mobile (Expo)

React Native + Expo (expo-router, TypeScript) アプリの実装足場。
プロトタイプ `wireframes/core-flow.html` の画面・導線を、Supabase に接続した実装へ落とし込むベースです。

## セットアップ

```bash
cd apps/mobile
npm install
cp .env.example .env        # Supabase の URL / anon key を設定
npm start                   # Expo Dev Server（i: iOS / a: Android / w: Web）
```

## 構成

```
app/
  _layout.tsx     # 認証ゲート（未ログイン→/login）
  login.tsx       # メール / OAuth ログイン
  index.tsx       # ホーム（残高・ナッジ・デイリーミッション、claim_mission RPC）
src/lib/
  supabase.ts     # Supabase クライアント（AsyncStorage 永続化）
  types.ts        # ドメイン型（本番は supabase gen types で自動生成へ）
```

## バックエンド

スキーマ・RPC は `../../supabase/`。型は本番で自動生成を推奨：

```bash
supabase gen types typescript --project-id <id> > src/lib/database.types.ts
```

> ステータス：足場（scaffold）。主要フロー（認証・残高・ミッション付与）を最小実装。
> 残りの画面（交換 / コミュニティ / マイページ / オファー）は同パターンで拡張します。
