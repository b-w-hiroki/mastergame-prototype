import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Row = {
  user_id: string;
  status: 'pending' | 'cancelled' | 'completed';
  reason: string | null;
  requested_at: string;
  scheduled_at: string;
  completed_at: string | null;
  handle: string | null;
  username: string | null;
  balance: number;
};

const STATUS: Record<Row['status'], { label: string; cls: string }> = {
  pending: { label: '手続き中', cls: 'pill warn' },
  cancelled: { label: 'キャンセル', cls: 'pill mute' },
  completed: { label: '完了', cls: 'pill ok' },
};

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default async function Deletions() {
  await requireAdmin();
  const { data, error } = await getAdminClient()
    .from('admin_deletion_rows')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <>
        <h1>退会</h1>
        <p className="note">
          取得に失敗しました（{error.message}）。マイグレーション <code>0026_account_deletion.sql</code> の適用と
          SERVICE_ROLE_KEY を確認してください。
        </p>
      </>
    );
  }

  const rows = (data as unknown as Row[]) ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const pendingPoints = pending.reduce((a, r) => a + Number(r.balance ?? 0), 0);
  const reasons = rows.filter((r) => r.reason && r.reason.trim() !== '');

  return (
    <>
      <h1>退会（手続き中 {pending.length} / 直近 {rows.length}）</h1>
      <div className="sub">
        アプリ内のアカウント削除は<strong>ストアの必須要件</strong>です。猶予期間を過ぎた申請は
        <code>process_account_deletions(false)</code>（service_role・日次バッチ）で確定します。
        確定時に個人情報は匿名化され、<strong>会計記録（台帳）と同意記録は保持されます</strong>。
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="l">手続き中</div>
          <div className="v">{pending.length}<small> 件</small></div>
        </div>
        <div className="kpi">
          <div className="l">失効予定ポイント</div>
          <div className="v">{pendingPoints.toLocaleString()}<small> P</small></div>
        </div>
        <div className="kpi">
          <div className="l">完了</div>
          <div className="v">{rows.filter((r) => r.status === 'completed').length}<small> 件</small></div>
        </div>
        <div className="kpi">
          <div className="l">キャンセル（引き留め成功）</div>
          <div className="v">{rows.filter((r) => r.status === 'cancelled').length}<small> 件</small></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>状態</th><th>ユーザー</th><th className="right">残高</th>
            <th>申請</th><th>完了予定</th><th>完了</th><th>理由</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td><span className={STATUS[r.status].cls}>{STATUS[r.status].label}</span></td>
              <td className="mono">{r.handle ? `@${r.handle}` : r.user_id.slice(0, 8)}</td>
              <td className="right mono">{Number(r.balance ?? 0).toLocaleString()}</td>
              <td className="mono">{fmt(r.requested_at)}</td>
              <td className="mono">{r.status === 'pending' ? fmt(r.scheduled_at) : '—'}</td>
              <td className="mono muted">{fmt(r.completed_at)}</td>
              <td className="muted">{r.reason ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>退会申請はありません</td></tr>
          )}
        </tbody>
      </table>

      {reasons.length > 0 && (
        <p className="note">
          ※ 退会理由は解約要因の一次情報です。同じ理由が続く場合はプロダクト側の課題として扱ってください。
        </p>
      )}
    </>
  );
}
