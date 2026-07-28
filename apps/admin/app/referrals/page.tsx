import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  status: 'pending' | 'confirmed' | 'rejected';
  code: string;
  created_at: string;
  confirmed_at: string | null;
  referrer_id: string;
  referrer_handle: string | null;
  referee_id: string;
  referee_handle: string | null;
  referrer_state: string;
  referee_state: string;
  referrer_linked_accounts: number;
};

const STATUS: Record<Row['status'], { label: string; cls: string }> = {
  pending: { label: '確定待ち', cls: 'pill warn' },
  confirmed: { label: '成立', cls: 'pill ok' },
  rejected: { label: '不成立', cls: 'pill mute' },
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default async function Referrals() {
  await requireAdmin();
  const { data, error } = await getAdminClient()
    .from('admin_referral_rows')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <>
        <h1>招待</h1>
        <p className="note">
          取得に失敗しました（{error.message}）。マイグレーション <code>0023_referral.sql</code> の適用と
          SERVICE_ROLE_KEY を確認してください。
        </p>
      </>
    );
  }

  const rows = (data as unknown as Row[]) ?? [];
  const confirmed = rows.filter((r) => r.status === 'confirmed').length;
  const pending = rows.filter((r) => r.status === 'pending').length;

  // 同一招待者が短時間に大量の招待を集めている＝ファーミングの兆候
  const byReferrer = new Map<string, number>();
  rows.forEach((r) => byReferrer.set(r.referrer_id, (byReferrer.get(r.referrer_id) ?? 0) + 1));
  const topReferrers = Array.from(byReferrer.entries())
    .map(([id, count]) => ({
      id,
      count,
      handle: rows.find((r) => r.referrer_id === id)?.referrer_handle ?? null,
      linked: rows.find((r) => r.referrer_id === id)?.referrer_linked_accounts ?? 0,
    }))
    .filter((x) => x.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <>
      <h1>招待（成立 {confirmed} / 確定待ち {pending} / 直近 {rows.length}）</h1>
      <div className="sub">
        招待は成長の主要導線であると同時に、最も荒らされやすい導線でもあります。
        自己招待・同一端末・古いアカウントの被招待は<strong>DB側で拒否済み</strong>ですが、
        「多数の端末を使い分けた組織的なファーミング」は自動では止まらないため、ここで人が見ます。
      </div>

      {topReferrers.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, marginTop: 8 }}>招待数が多いユーザー</h2>
          <table style={{ marginBottom: 20 }}>
            <thead>
              <tr><th>ユーザー</th><th className="right">招待数</th><th className="right">同端末アカウント数</th></tr>
            </thead>
            <tbody>
              {topReferrers.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.handle ? `@${t.handle}` : t.id.slice(0, 8)}</td>
                  <td className="right mono">{t.count}</td>
                  <td className="right mono">
                    {t.linked > 1 ? <span className="pill warn">{t.linked}</span> : t.linked}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <table>
        <thead>
          <tr>
            <th>状態</th><th>招待者</th><th>被招待者</th><th>コード</th><th>申込</th><th>確定</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><span className={STATUS[r.status].cls}>{STATUS[r.status].label}</span></td>
              <td>
                <span className="mono">{r.referrer_handle ? `@${r.referrer_handle}` : r.referrer_id.slice(0, 8)}</span>
                {r.referrer_state !== 'active' && <span className="pill danger" style={{ marginLeft: 6 }}>{r.referrer_state}</span>}
              </td>
              <td>
                <span className="mono">{r.referee_handle ? `@${r.referee_handle}` : r.referee_id.slice(0, 8)}</span>
                {r.referee_state !== 'active' && <span className="pill danger" style={{ marginLeft: 6 }}>{r.referee_state}</span>}
              </td>
              <td className="mono">{r.code}</td>
              <td className="mono">{fmt(r.created_at)}</td>
              <td className="mono muted">{r.confirmed_at ? fmt(r.confirmed_at) : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>招待はまだありません</td></tr>
          )}
        </tbody>
      </table>

      <p className="note">
        ※ 招待者への報酬は<strong>被招待者がミッションを進めた時点</strong>で確定します（捨てアカウントでは報酬が発生しません）。
        報酬額・日次上限・被招待可能な登録後日数は <code>app_config</code> で調整できます。
        不正が疑われる場合は「不正検知」画面から凍結/BAN してください（保留中の招待は確定時に弾かれます）。
      </p>
    </>
  );
}
