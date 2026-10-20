import { useCallback, useEffect, useRef, useState } from 'react';
import { AppAlert } from '@/components/AppAlert';

/** 画面内の変更操作を直列化し、例外後も操作できる状態へ戻す。自動再送はしない。 */
export function useAction() {
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (task: () => Promise<void>, title = '処理できませんでした') => {
    if (!active.current || locked.current) return;
    locked.current = true;
    setBusy(true);
    try { await task(); }
    catch {
      if (active.current) AppAlert.alert(title, '通信に失敗しました。変更が反映されているか確認してから再試行してください。');
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }, []);
  return { busy, run };
}
