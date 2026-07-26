# モバイル E2E（Maestro）

主要フローの受け入れシナリオを [Maestro](https://maestro.mobile.dev/) の flow として定義しています。
端末/エミュレータ上のビルド済みアプリに対して実行します（CI/この開発環境では実機が無いため未実行）。

## 前提

- Maestro CLI（`curl -Ls "https://get.maestro.mobile.dev" | bash`）
- 実機 or エミュレータに開発ビルドをインストール（`npx expo run:ios` / `run:android` など）
- Supabase に接続でき、テスト用アカウントが存在すること

## 実行

```bash
maestro test apps/mobile/.maestro/login.yaml
maestro test apps/mobile/.maestro/claim-mission.yaml
```

## フロー

| ファイル | シナリオ |
|---|---|
| `login.yaml` | 未ログイン→ログイン→ホーム着地 |
| `claim-mission.yaml` | デイリーミッション達成→獲得演出→残高表示 |

> ロジックの回帰は DB テスト（`supabase/tests`）と各アプリのユニット/コンポーネントテストで担保し、
> Maestro は「実機で主要導線が通る」ことの最終確認に使います。
