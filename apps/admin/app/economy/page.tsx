import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Summary = {
  issued_30d: number;
  spent_30d: number;
  exchanged_30d: number;
  earning_users_30d: number;
  issued_7d: number;
  issued_yen_30d: number;
  exchanged_yen_30d: number;
  real_cost_yen_30d: number;
  redemption_rate_pct: number;
  issued_yen_per_user_30d: number;
  outstanding_points: number;
  outstanding_yen: number;
  outstanding_real_cost_yen: number;
  holders: number;
  effective_cost_rate_pct: number;
  payout_ratio_pct: number;
};

type Daily = {
  day: string;
  issued_points: number;
  spent_points: number;
  exchanged_points: number;
  earning_users: number;
  earn_events: number;
};

type ByReason = {
  reason: string;
  issued_points: number;
  spent_points: number;
  events: number;
  users: number;
};

const REASON_LABEL: Record<string, string> = {
  mission: 'ミッション',
  offer: '提携オファー',
  postback: 'postback確定',
  postback_reversal: 'postback取消',
  staking: 'ステーキング',
  exchange: '交換（消費）',
  exchange_refund: '交換返金',
  bounty_escrow: '報酬預り',
  bounty_award: 'ベストアンサー報酬',
  topic: 'トピック投稿',
};

const jp = (n: number) => Number(n ?? 0).toLocaleString('ja-JP');
const mmdd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 日次の発行/交換を並べた棒グラフ。外部ライブラリを足さずインライン SVG で描く
 * （CSP を緩めず、admin のバンドルも太らせないため）。
 */
function DailyChart({ rows }: { rows: Daily[] }) {
  const W = 960;
  const H = 220;
  const PAD = { top: 12, right: 8, bottom: 22, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.issued_points, r.exchanged_points)));
  const slot = innerW / Math.max(1, rows.length);
  const barW = Math.max(2, slot * 0.36);

  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日次の発行ポイントと交換ポイントの推移" className="chart">
        {/* 目盛り（0 / 50% / 100%） */}
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
          const x = PAD.left + i * slot;
          const hIssued = (r.issued_points / max) * innerH;
          const hExch = (r.exchanged_points / max) * innerH;
          return (
            <g key={r.day}>
              <rect x={x + slot * 0.1} y={PAD.top + innerH - hIssued} width={barW} height={hIssued} fill="#4f46e5" rx={1.5}>
                <title>{`${mmdd(r.day)} 発行 ${jp(r.issued_points)}P（${jp(r.earning_users)}人）`}</title>
              </rect>
              <rect x={x + slot * 0.1 + barW} y={PAD.top + innerH - hExch} width={barW} height={hExch} fill="#b88a2e" rx={1.5}>
                <title>{`${mmdd(r.day)} 交換 ${jp(r.exchanged_points)}P`}</title>
              </rect>
              {/* ラベルは5日おき（潰れ防止） */}
              {i % 5 === 0 && (
                <text x={x + slot * 0.1} y={H - 7} fontSize={9} fill="#9aa0ad">{mmdd(r.day)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: '#4f46e5' }} />発行ポイント</span>
        <span><i style={{ background: '#b88a2e' }} />交換ポイント</span>
      </div>
    </div>
  );
}

export default async function Economy() {
  await requireAdmin();
  const db = getAdminClient();
  const [summaryRes, dailyRes, reasonRes] = await Promise.all([
    db.from('admin_economy_summary').select('*').single(),
    db.from('economy_daily').select('*').order('day', { ascending: true }),
    db.from('economy_by_reason').select('*'),
  ]);

  if (summaryRes.error || !summaryRes.data) {
    return (
      <>
        <h1>ポイント経済</h1>
        <p className="note">
          集計を取得できませんでした（{summaryRes.error?.message}）。マイグレーション
          <code>0022_economy_analytics.sql</code> の適用と SERVICE_ROLE_KEY を確認してください。
        </p>
      </>
    );
  }

  const s = summaryRes.data as unknown as Summary;
  const daily = ((dailyRes.data as unknown as Daily[]) ?? []).slice(-30);
  const reasons = ((reasonRes.data as unknown as ByReason[]) ?? [])
    .sort((a, b) => (b.issued_points ?? 0) - (a.issued_points ?? 0));

  // 発行に対する交換の比率が低い＝未交換（breakage）が積み上がっている状態
  const issuedTrend = s.issued_7d * (30 / 7); // 直近7日ペースを30日換算
  const accelerating = issuedTrend > s.issued_30d * 1.2;

  return (
    <>
      <h1>ポイント経済</h1>
      <div className="sub">
        直近30日の発行・交換と、<strong>未交換残高（＝将来の支払債務）</strong>を可視化します。
        ポイ活は配布過多が即赤字になるため、発行ペースと債務の伸びを合わせて見てください。
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="l">発行ポイント（30日）</div>
          <div className="v">{jp(s.issued_30d)}<small> P</small></div>
          <div className="muted" style={{ fontSize: 11 }}>額面 ¥{jp(s.issued_yen_30d)}</div>
        </div>
        <div className="kpi">
          <div className="l">交換ポイント（30日）</div>
          <div className="v">{jp(s.exchanged_30d)}<small> P</small></div>
          <div className="muted" style={{ fontSize: 11 }}>額面 ¥{jp(s.exchanged_yen_30d)}</div>
        </div>
        <div className="kpi">
          <div className="l">実コスト（30日）</div>
          <div className="v">¥{jp(s.real_cost_yen_30d)}</div>
          <div className="muted" style={{ fontSize: 11 }}>実効原価率 {s.effective_cost_rate_pct}%</div>
        </div>
        <div className="kpi">
          <div className="l">交換率（発行に対する）</div>
          <div className="v">{s.redemption_rate_pct}<small> %</small></div>
          <div className="muted" style={{ fontSize: 11 }}>残りは未交換（breakage）</div>
        </div>
        <div className="kpi">
          <div className="l">獲得ユーザー（30日）</div>
          <div className="v">{jp(s.earning_users_30d)}<small> 人</small></div>
          <div className="muted" style={{ fontSize: 11 }}>1人あたり ¥{jp(s.issued_yen_per_user_30d)}</div>
        </div>
        <div className="kpi">
          <div className="l">還元率設定</div>
          <div className="v">{s.payout_ratio_pct}<small> %</small></div>
          <div className="muted" style={{ fontSize: 11 }}>広告収益→ユーザー</div>
        </div>
      </div>

      {/* 未交換残高は会計上の負債。最も見落とされやすいので独立して強調する。 */}
      <div className="liability">
        <div>
          <div className="l">未交換残高（将来の支払債務）</div>
          <div className="v">{jp(s.outstanding_points)}<small> P</small></div>
        </div>
        <div>
          <div className="l">額面</div>
          <div className="v">¥{jp(s.outstanding_yen)}</div>
        </div>
        <div>
          <div className="l">実コスト見込み</div>
          <div className="v">¥{jp(s.outstanding_real_cost_yen)}</div>
        </div>
        <div>
          <div className="l">保有ユーザー</div>
          <div className="v">{jp(s.holders)}<small> 人</small></div>
        </div>
      </div>
      <p className="note">
        ※ 未交換残高は<strong>いつでも交換され得る債務</strong>です。ポイントが資金決済法の前払式支払手段に
        該当する場合、基準日の未使用残高に応じて供託等の義務が生じ得ます（要法務確認）。
      </p>

      {accelerating && (
        <p className="note alert">
          ⚠ 直近7日の発行ペース（30日換算 {jp(Math.round(issuedTrend))} P）が
          30日実績（{jp(s.issued_30d)} P）を2割以上上回っています。配布設定と不正検知を確認してください。
        </p>
      )}

      <h2 style={{ fontSize: 15, marginTop: 26 }}>日次推移（直近30日）</h2>
      <DailyChart rows={daily} />

      <h2 style={{ fontSize: 15, marginTop: 26 }}>経路別の内訳（直近30日）</h2>
      <div className="sub">想定外の経路が急に伸びていたら、設定ミスか不正を疑う入口になります。</div>
      <table>
        <thead>
          <tr>
            <th>経路</th><th className="right">発行 P</th><th className="right">消費 P</th>
            <th className="right">件数</th><th className="right">ユーザー</th><th className="right">発行比</th>
          </tr>
        </thead>
        <tbody>
          {reasons.map((r) => (
            <tr key={r.reason}>
              <td>{REASON_LABEL[r.reason] ?? r.reason} <span className="mono muted" style={{ fontSize: 11 }}>{r.reason}</span></td>
              <td className="right mono">{jp(r.issued_points)}</td>
              <td className="right mono">{jp(r.spent_points)}</td>
              <td className="right mono">{jp(r.events)}</td>
              <td className="right mono">{jp(r.users)}</td>
              <td className="right mono">
                {s.issued_30d > 0 ? `${Math.round((r.issued_points / s.issued_30d) * 100)}%` : '—'}
              </td>
            </tr>
          ))}
          {reasons.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>直近30日の取引はありません</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
