import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, assertUuid } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

type Status = 'received' | 'accepted' | 'rejected' | 'duplicate' | 'reversed';
type Event = {
  id: string;
  partner_id: string;
  transaction_id: string;
  user_id: string | null;
  mission_id: string | null;
  status: Status;
  signature_valid: boolean | null;
  reward_points: number | null;
  received_at: string;
  processed_at: string | null;
};

const ST: Record<Status, [string, string]> = {
  received: ['warn', '検証中'],
  accepted: ['ok', '確定'],
  rejected: ['danger', '却下'],
  duplicate: ['mute', '重複'],
  reversed: ['blue', '取消'],
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const countBy = async (status: Status) => {
  const { count } = await getAdminClient()
    .from('postback_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', status);
  return count ?? 0;
};

// 検証中（received）の postback を手動で却下する。ポイント付与は伴わない（＝安全）。
// 承認＝ポイント確定は Edge Function / confirm_postback の自動パイプラインが担う。
async function reject(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  await getAdminClient()
    .from('postback_events')
    .update({ status: 'rejected', processed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'received');
  revalidatePath('/postback');
}

export default async function Postback() {
  await requireAdmin();
  const [received, accepted, rejected, duplicate, reversed] = await Promise.all([
    countBy('received'), countBy('accepted'), countBy('rejected'), countBy('duplicate'), countBy('reversed'),
  ]);
  const decided = accepted + rejected;
  const rate = decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : null;

  const { data, error } = await getAdminClient()
    .from('postback_events')
    .select('id,partner_id,transaction_id,user_id,mission_id,status,signature_valid,reward_points,received_at,processed_at')
    .order('received_at', { ascending: false })
    .limit(100);

  const rows = (data as Event[]) ?? [];

  return (
    <>
      <h1>postback監視</h1>
      <div className="sub">提携オファーの達成サーバー検証（postback）の受信状況。承認・ポイント付与は自動パイプライン（<code>confirm_postback</code>）が処理します。</div>

      <div className="kpis">
        <div className="kpi"><div className="l">検証中</div><div className="v">{received.toLocaleString()}</div></div>
        <div className="kpi"><div className="l">確定</div><div className="v">{accepted.toLocaleString()}</div></div>
        <div className="kpi"><div className="l">却下</div><div className="v">{rejected.toLocaleString()}</div></div>
        <div className="kpi"><div className="l">重複</div><div className="v">{duplicate.toLocaleString()}</div></div>
        <div className="kpi"><div className="l">承認率</div><div className="v">{rate === null ? '—' : <>{rate}<small> %</small></>}</div></div>
      </div>

      {error ? (
        <p className="note">一覧の取得に失敗しました（{error.message}）。<code>postback_events</code> と SERVICE_ROLE_KEY を確認してください。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>状態</th><th>取引ID</th><th>署名</th><th className="right">報酬P</th>
              <th>受信</th><th>処理</th><th className="right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const st = ST[e.status] ?? ST.received;
              return (
                <tr key={e.id}>
                  <td><span className={`pill ${st[0]}`}>{st[1]}</span></td>
                  <td className="mono">{e.transaction_id.slice(0, 16)}</td>
                  <td>{e.signature_valid === null ? <span className="muted">—</span> : e.signature_valid ? <span className="pill ok">有効</span> : <span className="pill danger">無効</span>}</td>
                  <td className="right">{e.reward_points != null ? `${e.reward_points.toLocaleString()} P` : '—'}</td>
                  <td className="mono">{fmt(e.received_at)}</td>
                  <td className="mono">{e.processed_at ? fmt(e.processed_at) : <span className="muted">—</span>}</td>
                  <td className="right">
                    {e.status === 'received' ? (
                      <form action={reject}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="btn danger" type="submit">却下</button>
                      </form>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>postback の受信はまだありません</td></tr>
            )}
          </tbody>
        </table>
      )}
      <p className="note">※ 「却下」は検証中イベントの手動却下のみ（ポイント付与なし）。承認＝確定とポイント付与は HMAC 署名検証つきの自動処理に委ねます。</p>
    </>
  );
}
