import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 画面のデータ取得を統一的に扱うフック。
 * - loading: 初回ロード中
 * - error: 取得失敗時のメッセージ（null=正常）
 * - refreshing / onRefresh: Pull-to-refresh 用
 * - reload: 手動再取得（エラー時の「再読み込み」ボタン等）
 * load 関数は例外を投げてよい（ここで捕捉して error に変換する）。
 * opts.auto=false にすると初回自動ロードを行わない（useFocusEffect 等で自前に reload する画面向け。
 * 自動ロードと useFocusEffect を併用すると初回マウントで二重フェッチになるため）。
 */
export function useLoader(load: (isCurrent: () => boolean) => Promise<void>, opts?: { auto?: boolean }) {
  const auto = opts?.auto ?? true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  const run = useCallback(async (refresh: boolean) => {
    if (!mounted.current) return;
    const version = ++generation.current;
    const isCurrent = () => mounted.current && version === generation.current;
    setRefreshing(refresh);
    try {
      setError(null);
      await load(isCurrent);
    } catch {
      if (isCurrent()) setError('データの取得に失敗しました。通信環境を確認してください。');
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [load]);

  const reload = useCallback(() => run(false), [run]);
  const onRefresh = useCallback(() => run(true), [run]);
  const cancel = useCallback(() => { generation.current += 1; }, []);

  useEffect(() => { if (auto) void reload(); }, [reload, auto]);

  return { loading, error, refreshing, reload, onRefresh, cancel };
}
