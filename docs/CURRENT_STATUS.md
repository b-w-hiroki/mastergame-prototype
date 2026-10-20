# MasterGame 現状基準

更新日: 2026-09-19

この文書は、MVP の縦フロー実装を始める前の基準点を記録する。未コミットの UI 変更は既存作業として保護し、この文書作成時点では変更しない。

## リポジトリ状態

- ブランチ: `main`
- リモートとの差分: `origin/main` と同期済み
- 作業ツリー: モバイル UI を中心に未コミット変更あり
- Node.js: `v24.11.1`
- npm: `11.6.2`
- Docker: 未導入（クラウド Supabase を使うため現時点では不要）
- Supabase CLI: npm の開発依存として導入済み（`2.117.0`）
- Supabase: クラウドの `mastergame` に接続済み（東京から近い Singapore リージョン）
- migrations: `0001`〜`0015` を適用済み、リモート履歴と同期済み
- Edge Functions: `postback` / `test-offer-complete` をデプロイ済み
- 環境変数: モバイルと管理画面に URL / 公開キーを設定済み。管理画面の service role はファイルへ保存せず、認証済み Supabase CLI から起動プロセスへ注入
- 主要依存: Expo `51.0.39` / React Native `0.74.5` / Next.js `14.2.35`

## 検証結果

| 対象 | コマンド | 結果 |
|---|---|---|
| モバイル | `npm run typecheck` | 成功 |
| 管理画面 | `npm run typecheck` | 成功 |
| 管理画面 | `npm run build` | 成功（全11ページ生成） |
| Expo整合性 | `npx expo-doctor` | 17/17 成功 |
| モバイルWeb | `npm run export:web` | 成功、PWAタグ注入済み |
| Supabase | `npx supabase db push --linked --dry-run` | 差分なし |
| Edge Functions | `npx supabase functions list` | 2本とも `ACTIVE` |
| 公開REST API | offers / missions を取得 | テストオファー1件、有効ミッション7件 |
| MVP縦フロー | オファー開始 → test postback → 残高確認 | 成功（80,000P付与） |
| クラウド一括検証 | `npm run verify:mvp:cloud` | 15項目成功（正常付与・重複・期限切れ・凍結・残高不足・一時データ削除を含む） |
| モバイル依存 | `npm audit --omit=dev` | 44件（low 1 / moderate 29 / high 13 / critical 1） |
| 管理画面依存 | `npm audit` | 2件（high 1 / critical 1） |
| ルート依存 | `npm audit` | 2件（high 2、資料生成用 `pptxgenjs` の推移依存） |

管理画面の公開接続情報と管理者認証は設定済み。サーバー専用 `SUPABASE_SERVICE_ROLE_KEY` はリポジトリや `.env` に保存せず、`npm run admin:dev:cloud` でローカル起動時だけ注入する。

## 現在動く範囲

### モバイル

- メール登録、ログイン、パスワード再設定
- Google / Apple OAuth の実装
- オンボーディングとジャンル選択
- ホーム、ミッション、ポイント、コミュニティ、マイページ
- 通常ミッションのポイント受け取り
- ポイント交換申請
- トピック作成、返信、リアクション、ベストアンサー、通報
- Supabase 未設定時のデモ表示
- Web / PWA 書き出し設定

### 管理画面

- KPI ダッシュボード
- ユーザー一覧
- ミッションの作成、編集、稼働切替、削除
- 交換アイテムの作成、編集、稼働切替、削除
- 通報対応
- postback 監視と手動却下
- 管理者ログインと管理者ロール検証
- 交換申請一覧、受け渡し完了、取消時のポイント・在庫返還

### バックエンド

- ポイント台帳と残高
- ミッション付与 RPC
- 交換申請 RPC
- スマートナッジ RPC
- `track_click` と署名付き postback
- transaction ID と click ID による二重付与防止
- コミュニティ書き込み RPC
- RLS

## MVP 縦フローに対する不足

1. 管理画面への実アカウントログイン後の最終目視確認は手動操作待ち。
2. service role はファイル保存せず、認証済みSupabase CLIからローカル起動時に注入する運用。
3. Expo SDK 51とNext.js 14系には、解消にメジャー更新が必要な既知脆弱性が残る。外部公開前にExpo 57系・Next.js 16系への移行と回帰検証が必要。
4. HTTPS公開環境の設定と5〜10名のクローズドテストは未実施。

## 保護対象の既存変更

次の領域は、MVP 作業開始前から存在する UI 改修として扱う。

- `apps/mobile/app/(tabs)/*`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/exchange.tsx`
- `apps/mobile/src/lib/supabase.ts`
- `apps/mobile/src/lib/types.ts`
- `apps/mobile/src/components/VisualSlot.tsx`
- `apps/mobile/src/lib/generatedAssets.ts`
- `apps/mobile/assets/generated/`
- `docs/IMAGE2_ASSET_PLAN.md`
- `.gitignore`

これらに変更が必要な場合は、既存差分を確認してから最小限の追記を行う。

## 開始時の判断

- 画像生成と UI の追加改善は一時停止する。
- 最優先は「オファー開始 → postback → ポイント付与 → 交換」の縦フローとする。
- 最初は広告会社へ接続せず、ローカルまたは検証環境の疑似オファーで確認する。
- 実商品は配送せず、検証用交換申請までを対象にする。
- 管理画面は認証を追加するまで外部公開しない。
