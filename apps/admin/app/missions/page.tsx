import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Mission = {
  id: string;
  type: 'daily' | 'weekly' | 'achievement' | 'event' | 'offer';
  title: string;
  reward_points: number;
  max_progress: number;
  requires_verification: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

const TYPE: Record<Mission['type'], [string, string]> = {
  daily: ['blue', 'デイリー'],
  weekly: ['blue', 'ウィークリー'],
  achievement: ['ok', '実績'],
  event: ['warn', '期間限定'],
  offer: ['mute', '提携オファー'],
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default async function Missions() {
  const { data, error } = await supabaseAdmin
    .from('missions')
    .select('id,type,title,reward_points,max_progress,requires_verification,is_active,starts_at,ends_at,created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <>
        <h1>ミッション管理</h1>
        <p className="note">取得に失敗しました（{error.message}）。<code>missions</code> テーブルと SERVICE_ROLE_KEY を確認してください。</p>
      </>
    );
  }
  const rows = (data as Mission[]) ?? [];
  const active = rows.filter((m) => m.is_active).length;

  return (
    <>
      <h1>ミッション管理（{rows.length} 件 / 稼働 {active}）</h1>
      <div className="sub">配信中のミッション一覧（マスタ）。提携オファーは達成のサーバー検証（postback）後に付与されます。</div>
      <table>
        <thead>
          <tr>
            <th>タイプ</th><th>タイトル</th><th className="right">報酬P</th><th className="right">進捗</th>
            <th>検証</th><th>状態</th><th>期間</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const t = TYPE[m.type] ?? TYPE.daily;
            return (
              <tr key={m.id}>
                <td><span className={`pill ${t[0]}`}>{t[1]}</span></td>
                <td>{m.title}</td>
                <td className="right"><b>{m.reward_points.toLocaleString()}</b> P</td>
                <td className="right">{m.max_progress}</td>
                <td>{m.requires_verification ? <span className="pill blue">postback</span> : <span className="muted">—</span>}</td>
                <td>{m.is_active ? <span className="pill ok">● 稼働</span> : <span className="pill mute">停止</span>}</td>
                <td className="mono">{fmtDate(m.starts_at)} 〜 {fmtDate(m.ends_at)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>ミッションがまだ登録されていません</td></tr>
          )}
        </tbody>
      </table>
      <p className="note">※ 読み取り専用の一覧です。作成・編集（マスタ更新）は運営RPCを介して順次対応します。</p>
    </>
  );
}
