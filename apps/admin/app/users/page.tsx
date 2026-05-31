import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; username: string | null; handle: string | null; xp: number;
  earned: number; exchanged: number; balance: number;
  moderation_state: string; created_at: string;
};

const ST: Record<string, [string, string]> = {
  active: ['ok', '● アクティブ'], frozen: ['warn', '❄ 凍結'],
  banned: ['danger', '⛔ BAN'], marked: ['blue', '🔎 マーキング'],
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default async function Users() {
  const { data, error } = await supabaseAdmin
    .from('admin_user_rows').select('*')
    .order('balance', { ascending: false }).limit(100);

  if (error) {
    return (<><h1>ユーザー管理</h1>
      <p className="note">取得に失敗しました（{error.message}）。<code>admin_user_rows</code> ビューと SERVICE_ROLE_KEY を確認してください。</p></>);
  }
  const rows = (data as Row[]) ?? [];

  return (
    <>
      <h1>ユーザー管理（{rows.length} 人）</h1>
      <table>
        <thead><tr>
          <th>No</th><th>ユーザー</th><th>ID</th><th>累計獲得P</th><th>交換済みP</th>
          <th>保有P</th><th>状態</th><th>登録日時</th>
        </tr></thead>
        <tbody>
          {rows.map((u, i) => {
            const st = ST[u.moderation_state] ?? ST.active;
            return (
              <tr key={u.id}>
                <td>{i + 1}</td>
                <td>{u.username ?? '—'} <span style={{ color: '#9aa0ad' }}>{u.handle ?? ''}</span></td>
                <td style={{ fontFamily: 'monospace', color: '#565c6a' }}>#{u.id.slice(0, 8)}</td>
                <td>{u.earned.toLocaleString()} P</td>
                <td>{u.exchanged.toLocaleString()} P</td>
                <td><b>{u.balance.toLocaleString()}</b> P</td>
                <td><span className={`pill ${st[0]}`}>{st[1]}</span></td>
                <td style={{ fontFamily: 'monospace' }}>{fmt(u.created_at)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>ユーザーがまだいません（サインアップで作成）</td></tr>
          )}
        </tbody>
      </table>
      <p className="note">※ 保有P 降順。配布交換金額はダッシュボードの集計を参照（1,000P = 1円）。BAN/凍結の操作RPCは順次実装。</p>
    </>
  );
}
