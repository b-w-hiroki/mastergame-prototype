import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Daily = { day: string; active_users: number; events: number; sessions: number };
type Funnel = {
  viewed: number; tapped: number; claimed: number;
  view_to_tap_pct: number; tap_to_claim_pct: number; overall_pct: number;
};
type EventRow = { name: string; events: number; users: number; last_seen: string };
type Cohort = {
  cohort_date: string; cohort_size: number;
  d1: number; d7: number; d30: number; d1_pct: number; d7_pct: number;
};

const jp = (n: number) => Number(n ?? 0).toLocaleString('ja-JP');
const mmdd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** DAU の推移。外部ライブラリを足さずインライン SVG で描く（②の方針と揃える）。 */
function DauChart({ rows }: { rows: Daily[] }) {
  const W = 960, H = 180;
  const PAD = { top: 12, right: 8, bottom: 22, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...rows.map((r) => Number(r.active_users ?? 0)));
  const slot = innerW / Math.max(1, rows.length);
  const barW = Math.max(2, slot * 0.7);

  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日次アクティブユーザーの推移" className="chart">
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#e4e7ec" strokeWidth={1} />
              <text x={PAD.left} y={y - 3} fontSize={9} fill="#9aa0ad">{jp(Math.round(max * t))}</text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const v = Number(r.active_users ?? 0);
          const h = (v / max) * innerH;
          const x = PAD.left + i * slot;
          return (
            <g key={r.day}>
              <rect x={x + (slot - barW) / 2} y={PAD.top + innerH - h} width={barW} height={h} fill="#4f46e5" rx={1.5}>
                <title>{`${mmdd(r.day)} ${jp(v)}人`}</title>
              </rect>
              {i % 5 === 0 && <text x={x} y={H - 7} fontSize={9} fill="#9aa0ad">{mmdd(r.day)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i style={{ background: '#4f46e5' }} />アクティブユーザー</span></div>
    </div>
  );
}

export default async function Analytics() {
  await requireAdmin();
  const db = getAdminClient();
  const [dailyRes, funnelRes, eventsRes, cohortRes] = await Promise.all([
    db.from('analytics_daily').select('*').order('day', { ascending: true }),
    db.from('mission_funnel').select('*').single(),
    db.from('event_funnel').select('*').order('events', { ascending: false }).limit(30),
    db.from('retention_cohorts').select('*').order('cohort_date', { ascending: false }).limit(14),
  ]);

  if (dailyRes.error) {
    return (
      <>
        <h1>行動分析</h1>
        <p className="note">
          取得に失敗しました（{dailyRes.error.message}）。マイグレーション
          <code>0028_analytics_events.sql</code> の適用と SERVICE_ROLE_KEY を確認してください。
        </p>
      </>
    );
  }

  const daily = ((dailyRes.data as unknown as Daily[]) ?? []).slice(-30);
  const funnel = (funnelRes.data as unknown as Funnel) ?? null;
  const events = (eventsRes.data as unknown as EventRow[]) ?? [];
  const cohorts = (cohortRes.data as unknown as Cohort[]) ?? [];

  const today = daily.at(-1);
  const totalEvents = daily.reduce((a, r) => a + Number(r.events ?? 0), 0);
  // 直近14日のうち、コホートサイズがある行だけで平均を取る
  const withSize = cohorts.filter((c) => Number(c.cohort_size ?? 0) > 0);
  const avgD1 = withSize.length
    ? Math.round((withSize.reduce((a, c) => a + Number(c.d1_pct ?? 0), 0) / withSize.length) * 10) / 10
    : 0;

  return (
    <>
      <h1>行動分析</h1>
      <div className="sub">
        ②の経済ダッシュボードが「配りすぎていないか」を見るのに対し、ここは
        <strong>「効いているか」</strong>を見る面です。ミッションのどこで落ちているか、
        登録した人が戻ってきているかを確認します。
      </div>

      <div className="kpis">
        <div className="kpi"><div className="l">本日のアクティブ</div><div className="v">{jp(Number(today?.active_users ?? 0))}<small> 人</small></div></div>
        <div className="kpi"><div className="l">イベント数（30日）</div><div className="v">{jp(totalEvents)}</div></div>
        <div className="kpi"><div className="l">D1 リテンション（平均）</div><div className="v">{avgD1}<small> %</small></div></div>
        <div className="kpi"><div className="l">ミッション到達率</div><div className="v">{funnel?.overall_pct ?? 0}<small> %</small></div></div>
      </div>

      <h2 style={{ fontSize: 15, marginTop: 24 }}>アクティブユーザー（直近30日）</h2>
      <DauChart rows={daily} />

      <h2 style={{ fontSize: 15, marginTop: 26 }}>ミッションのファネル（直近30日・ユーザー数ベース）</h2>
      <div className="sub">
        イベント数ではなく<strong>ユーザー数</strong>で見ています（連打で転換率が歪まないようにするため）。
      </div>
      {funnel ? (
        <table>
          <thead><tr><th>段階</th><th className="right">ユーザー</th><th className="right">前段からの転換</th></tr></thead>
          <tbody>
            <tr><td>ミッション一覧を表示</td><td className="right mono">{jp(funnel.viewed)}</td><td className="right mono">—</td></tr>
            <tr>
              <td>「達成」をタップ</td>
              <td className="right mono">{jp(funnel.tapped)}</td>
              <td className="right mono">
                <span className={funnel.view_to_tap_pct < 30 ? 'pill warn' : 'pill ok'}>{funnel.view_to_tap_pct}%</span>
              </td>
            </tr>
            <tr>
              <td>達成が確定</td>
              <td className="right mono">{jp(funnel.claimed)}</td>
              <td className="right mono">
                <span className={funnel.tap_to_claim_pct < 80 ? 'pill warn' : 'pill ok'}>{funnel.tap_to_claim_pct}%</span>
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="note">まだファネルを計算できるイベントがありません。</p>
      )}
      {funnel && funnel.tapped > 0 && funnel.tap_to_claim_pct < 80 && (
        <p className="note alert">
          ⚠ タップしたのに達成が確定しないユーザーが {100 - funnel.tap_to_claim_pct}% います。
          エラー（重複達成・期限切れ・検証待ち）が多い可能性があります。
        </p>
      )}

      <h2 style={{ fontSize: 15, marginTop: 26 }}>リテンション（登録日コホート）</h2>
      <table>
        <thead>
          <tr><th>登録日</th><th className="right">人数</th><th className="right">D1</th><th className="right">D7</th><th className="right">D30</th></tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort_date}>
              <td className="mono">{c.cohort_date}</td>
              <td className="right mono">{jp(c.cohort_size)}</td>
              <td className="right mono">{c.cohort_size > 0 ? `${c.d1_pct}%` : '—'}</td>
              <td className="right mono">{c.cohort_size > 0 ? `${c.d7_pct}%` : '—'}</td>
              <td className="right mono">{jp(c.d30)}</td>
            </tr>
          ))}
          {cohorts.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>コホートがまだありません</td></tr>
          )}
        </tbody>
      </table>

      <h2 style={{ fontSize: 15, marginTop: 26 }}>イベント一覧（直近30日）</h2>
      <table>
        <thead><tr><th>イベント</th><th className="right">発生数</th><th className="right">ユーザー</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.name}>
              <td className="mono">{e.name}</td>
              <td className="right mono">{jp(e.events)}</td>
              <td className="right mono">{jp(e.users)}</td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr><td colSpan={3} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>イベントがありません</td></tr>
          )}
        </tbody>
      </table>

      <p className="note">
        ※ 生ログは <code>app_config.event_retention_days</code>（既定90日）で保持し、
        <code>purge_app_events(false)</code> を日次バッチで実行して掃除します。
        長期の推移が必要な場合は、掃除の前に日次集計を別テーブルへ退避してください。
      </p>
    </>
  );
}
