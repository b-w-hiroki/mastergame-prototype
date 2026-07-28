import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, assertUuid, assertEnum } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

type FraudRow = {
  id: string;
  user_id: string | null;
  flag_type: string;
  severity: 'low' | 'medium' | 'high';
  detail: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
  handle: string | null;
  username: string | null;
  moderation_state: string;
  balance: number;
  linked_accounts: number;
};

const TYPE_LABEL: Record<string, string> = {
  multi_account: '多重アカウント',
  velocity: '獲得速度の異常',
  emulator: 'エミュレータ',
  vpn: 'VPN',
  postback_reversed: 'postback取消',
};
const SEVERITY_LABEL: Record<FraudRow['severity'], string> = { low: '低', medium: '中', high: '高' };
const STATE_LABEL: Record<string, string> = {
  active: '正常', marked: '要確認', frozen: '凍結中', banned: 'BAN',
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 検知の要点だけを1行に要約する（生JSONは運営には読みにくいため）
function summarize(row: FraudRow): string {
  const d = row.detail ?? {};
  switch (row.flag_type) {
    case 'multi_account':
      return `同一端末に ${d.accounts ?? '?'} アカウント（device ${String(d.device_id ?? '').slice(0, 8)}…）`;
    case 'velocity':
      return `直近${d.window ?? '1h'}に ${d.count ?? '?'} 回 / ${Number(d.points ?? 0).toLocaleString()} P 獲得`;
    case 'emulator':
      return `エミュレータ判定（${d.platform ?? '?'} / ${d.model ?? '不明'}）`;
    case 'postback_reversed':
      return `取消: ${d.reason ?? '—'}（${d.reward ?? '?'} P）`;
    default:
      return JSON.stringify(d);
  }
}

// 検知への運営対応。resolve_fraud_flag RPC がフラグ解決と状態変更を1トランザクションで行う。
async function resolve(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const action = assertEnum(formData.get('action'), ['dismiss', 'freeze', 'ban'] as const, 'action');

  const { error } = await getAdminClient().rpc('resolve_fraud_flag', {
    p_flag_id: id,
    p_action: action,
  });
  if (error) throw new Error(`resolve_fraud_flag failed: ${error.message}`);

  revalidatePath('/fraud');
}

export default async function Fraud() {
  await requireAdmin();
  const { data, error } = await getAdminClient()
    .from('admin_fraud_rows')
    .select('*')
    .order('resolved_at', { ascending: true, nullsFirst: true }) // 未対応を先頭に
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <>
        <h1>不正検知</h1>
        <p className="note">
          取得に失敗しました（{error.message}）。マイグレーション <code>0021_fraud_detection.sql</code> の適用と
          SERVICE_ROLE_KEY を確認してください。
        </p>
      </>
    );
  }

  const rows = (data as unknown as FraudRow[]) ?? [];
  const open = rows.filter((r) => !r.resolved_at).length;
  const high = rows.filter((r) => !r.resolved_at && r.severity === 'high').length;

  return (
    <>
      <h1>不正検知（未対応 {open}{high > 0 ? ` / うち重大 ${high}` : ''} / 直近 {rows.length}）</h1>
      <div className="sub">
        多重アカウント・獲得速度・エミュレータを自動検知した一覧です。
        <strong>凍結・BAN を行うと以降のポイント付与が止まります</strong>（postback / オファー確定の両方でブロック）。
        誤検知は「却下」で解決してください。
      </div>

      <table>
        <thead>
          <tr>
            <th>状態</th><th>種別</th><th>重大度</th><th>ユーザー</th><th>検知内容</th>
            <th className="right">残高</th><th>検知日時</th><th className="right">対応</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.resolved_at
                  ? <span className="pill mute">対応済</span>
                  : <span className="pill warn">未対応</span>}
              </td>
              <td>{TYPE_LABEL[r.flag_type] ?? r.flag_type}</td>
              <td>
                <span className={r.severity === 'high' ? 'pill danger' : r.severity === 'medium' ? 'pill warn' : 'pill mute'}>
                  {SEVERITY_LABEL[r.severity] ?? r.severity}
                </span>
              </td>
              <td>
                {r.handle ? <span className="mono">@{r.handle}</span> : <span className="muted">—</span>}
                <div className="muted" style={{ fontSize: 11 }}>
                  {STATE_LABEL[r.moderation_state] ?? r.moderation_state}
                  {r.linked_accounts > 1 ? ` ・ 同端末 ${r.linked_accounts} アカウント` : ''}
                </div>
              </td>
              <td className="muted">{summarize(r)}</td>
              <td className="right mono">{Number(r.balance ?? 0).toLocaleString()}</td>
              <td className="mono">{fmt(r.created_at)}</td>
              <td className="right">
                {r.resolved_at ? (
                  <span className="muted mono">{fmt(r.resolved_at)}</span>
                ) : (
                  <div className="actions" style={{ justifyContent: 'flex-end' }}>
                    <form action={resolve}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="action" value="ban" />
                      <button className="btn danger" type="submit">BAN</button>
                    </form>
                    <form action={resolve}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="action" value="freeze" />
                      <button className="btn warn" type="submit">凍結</button>
                    </form>
                    <form action={resolve}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="action" value="dismiss" />
                      <button className="btn" type="submit">却下</button>
                    </form>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>検知はありません</td></tr>
          )}
        </tbody>
      </table>

      <p className="note">
        ※ 閾値は <code>fraud_settings</code> テーブルで調整できます（多重アカウント判定数・1時間あたりの獲得回数/ポイント・再起票の抑制時間）。
        端末IDはクライアント申告値のため「シグナル」であり証拠ではありません。厳密な端末真正性には
        DeviceCheck(iOS) / Play Integrity(Android) のアテステーション導入が必要です。
      </p>
    </>
  );
}
