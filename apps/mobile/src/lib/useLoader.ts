import { useCallback, useEffect, useState } from 'react';

/**
 * 画面のデータ取得を統一的に扱うフック。
 * - loading: 初回ロード中
 * - error: 取得失敗時のメッセージ（null=正常）
 * - refreshing / onRefresh: Pull-to-refresh 用
 * - reload: 手動再取得（エラー時の「再読み込み」ボタン等）
 * load 関数は例外を投げてよい（ここで捕捉して error に変換する）。
 */
export function useLoader(load: () => Promise<void>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    try {
      setError(null);
      await load();
    } catch {
      setError('データの取得に失敗しました。通信環境を確認してください。');
    } finally {
      setLoading(false);
    }
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await run();
    setRefreshing(false);
  }, [run]);

  useEffect(() => { run().catch(() => {}); }, [run]);

  return { loading, error, refreshing, reload: run, onRefresh };
}
