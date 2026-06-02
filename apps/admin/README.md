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
  layout.tsx          # サイドバー付きレイアウト
  nav.tsx             # サイドバーナビ（現在地をハイライト：client）
  page.tsx            # ダッシュボード（admin_overview ビューを service_role で参照）
  users/page.tsx      # ユーザー管理（admin_user_rows・保有P降順）
  missions/page.tsx   # ミッション管理（missions マスタ一覧）
  items/page.tsx      # 交換アイテム管理（exchange_items マスタ一覧）
  moderation/page.tsx # 通報・モデレーション（reports 一覧＋対応：削除/警告/却下）
  postback/page.tsx   # postback監視（状態集計・承認率＋検証中の却下）
  globals.css
lib/supabase/
  server.ts      # 認証セッション連動のサーバークライアント（RLS有効）
  admin.ts       # service_role クライアント（集計参照・運営操作。サーバー専用）
```

## バックエンド

- 集計ビュー：`supabase/migrations/0007_admin.sql`（`admin_overview` / `admin_user_rows`）
- 参照テーブル：`missions` / `exchange_items` / `reports` / `moderation_actions` / `postback_events`
- `SUPABASE_SERVICE_ROLE_KEY` は **サーバー専用**。クライアントへ露出させないこと。

## 実装状況

プロトタイプ `wireframes/admin.html` の主要画面を実データに接続：

- ✅ ダッシュボード（KPI 集計）
- ✅ ユーザー管理（集計・保有P降順）
- ✅ ミッション管理 / 交換アイテム管理（マスタ一覧・読み取り専用）
- ✅ 通報・モデレーション（Server Actions で `moderation_actions` 記録＋`reports` 状態更新）
- ✅ postback監視（状態別集計・承認率、検証中イベントの手動却下）

### PWA（インストール可能・オフライン対応）

運営コンソールは PWA としてブラウザからインストールできます。

- `public/manifest.webmanifest` … アプリ名・アイコン・`display:standalone`（テーマ #12152a）
- `public/sw.js` … **運営データは機微なため HTML はキャッシュせず** network-first＋`offline.html` フォールバック。静的アセット（`/_next/static/`・アイコン）のみ stale-while-revalidate
- `app/pwa.tsx` … Service Worker 登録（client）。`layout.tsx` の `metadata.manifest` / `appleWebApp` / `viewport.themeColor` で各メタを付与
- インストール可能になるのは **HTTPS デプロイ後**（`localhost` でも確認可）

> サーバー操作は **Server Actions × service_role**（サーバー専用）で実装。
> ポイント付与を伴う処理（postback の承認＝確定、交換の付与、BAN/凍結）は安全のため
> 署名検証つきの自動パイプライン／専用 RPC に委ね、本画面は監視・記録に徹しています
> （マスタの作成・編集 UI は次段で追加予定）。
