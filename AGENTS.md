# MasterGame の作業ルール

アプリ、管理画面、DB、Edge Function、プロトタイプを変更する前に `docs/PRODUCT_SPEC.md`、`docs/ARCHITECTURE.md`、`docs/DOCS_WORKFLOW.md` の関連箇所を確認する。

- 利用者・運営者から見える動作やエラーを変えたら `docs/PRODUCT_SPEC.md` を同じ作業で更新する。
- 構成、データ、RPC、権限、外部連携、失敗時の境界を変えたら `docs/ARCHITECTURE.md` を同じ作業で更新する。両方に影響すれば両方を更新する。
- 既存の `docs/specs/` は企画・詳細案を含む。未実装の内容を現行仕様へ昇格させない。
- 実装とテスト、文書の内容を照合する。`npm run check:docs` と関連テストを実行し、実 DB・実機・外部サービスの未検証を明示する。
- コードだけ変えて文書を更新しない場合は、文書への影響がない根拠を作業報告に記す。PR の CI は画面変更に現行仕様、内部処理・DB・Edge Function 変更に現行設計の差分がないと失敗する。テストだけの変更は対象外。

詳細な更新判断・文書の役割は `docs/DOCS_WORKFLOW.md` を参照する。
