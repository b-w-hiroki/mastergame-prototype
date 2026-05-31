# MasterGame Admin (Next.js)

運営コンソール（Next.js App Router, TypeScript）の実装足場。
プロトタイプ `wireframes/admin.html` を、Supabase の集計ビューに接続した実装へ落とし込むベースです。

## セットアップ

```bash
cd apps/admin
npm install
cp .env.example .env.local    # Supabase URL / anon / service_role を設定
npm run dev                    # http://localhost:3000
```

## 構成

```
app/
  layout.tsx     # サイドバー付きレイアウト
  page.tsx       # ダッシュボード（admin_overview ビューを service_role で参照）
  globals.css
lib/supabase/
  server.ts      # 認証セッション連動のサーバークライアント（RLS有効）
  admin.ts       # service_role クライアント（集計参照・運営操作。サーバー専用）
```

## バックエンド

- 集計ビュー：`supabase/migrations/0007_admin.sql`（`admin_overview` / `admin_user_rows`）
- `SUPABASE_SERVICE_ROLE_KEY` は **サーバー専用**。クライアントへ露出させないこと。

> ステータス：足場（scaffold）。ダッシュボードの集計を実データで表示。
> ユーザー管理（ソート/BAN/凍結）・通報対応・postback承認は運営RPCを介して順次実装します。
