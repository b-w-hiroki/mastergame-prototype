import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, assertUuid, assertEnum } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  status: 'open' | 'answered' | 'resolved' | 'closed';
  created_at: string;
  last_message_at: string;
  handle: string | null;
  balance: number;
  message_count: number;
  last_message: string | null;
  last_from_staff: boolean | null;
};

type Message = { id: string; is_staff: boolean; body: string; created_at: string };

// 「ポイントが反映されない」への回答に必要な材料（support_user_context の戻り値）
type Context = {
  balance: number;
  lifetime_earned: number;
  moderation_state: string;
  deletion_status: string | null;
  recent_ledger: { delta: number; reason: string; status: string; at: string }[];
  pending_offers: { network_txn_id: string; status: string; reward: number; at: string }[];
  rejected_postbacks: { transaction_id: string; status: string; at: string }[];
  open_fraud_flags: { type: string; severity: string; at: string }[];
};

const CATEGORY_LABEL: Record<string, string> = {
  points: 'ポイント未反映', exchange: '交換', account: 'アカウント', bug: '不具合', other: 'その他',
};
const STATUS: Record<Row['status'], { label: string; cls: string }> = {
  open: { label: '対応中', cls: 'pill warn' },
  answered: { label: '回答済', cls: 'pill blue' },
  resolved: { label: '解決', cls: 'pill ok' },
  closed: { label: 'クローズ', cls: 'pill mute' },
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function answer(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const body = String(formData.get('body') ?? '').trim();
  if (body === '') throw new Error('body required');
  const action = assertEnum(formData.get('action'), ['answer', 'resolve'] as const, 'action');

  const { error } = await getAdminClient().rpc('answer_inquiry', {
    p_inquiry_id: id, p_body: body, p_resolve: action === 'resolve',
  });
  if (error) throw new Error(`answer_inquiry failed: ${error.message}`);
  revalidatePath('/support');
}

async function close(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const { error } = await getAdminClient().rpc('close_inquiry', { p_inquiry_id: id });
  if (error) throw new Error(`close_inquiry failed: ${error.message}`);
  revalidatePath('/support');
}

export default async function Support({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  await requireAdmin();
  const db = getAdminClient();

  const { data, error } = await db
    .from('admin_inquiry_rows')
    .select('*')
    .order('status')
    .order('last_message_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <>
        <h1>お問い合わせ</h1>
        <p className="note">
          取得に失敗しました（{error.message}）。マイグレーション <code>0027_support.sql</code> の適用と
          SERVICE_ROLE_KEY を確認してください。
        </p>
      </>
    );
  }

  const rows = (data as unknown as Row[]) ?? [];
  const open = rows.filter((r) => r.status === 'open').length;

  // 選択中スレッドの本文と、対応に必要なユーザー情報をまとめて引く
  const selected = searchParams.id ? rows.find((r) => r.id === searchParams.id) : undefined;
  let messages: Message[] = [];
  let context: Context | null = null;
  if (selected) {
    const [msgRes, ctxRes] = await Promise.all([
      db.from('inquiry_messages').select('id,is_staff,body,created_at')
        .eq('inquiry_id', selected.id).order('created_at'),
      db.rpc('support_user_context', { p_user: selected.user_id }),
    ]);
    messages = (msgRes.data as unknown as Message[]) ?? [];
    context = (ctxRes.data as unknown as Context) ?? null;
  }

  return (
    <>
      <h1>お問い合わせ（対応中 {open} / 直近 {rows.length}）</h1>
      <div className="sub">
        ポイ活の問い合わせは<strong>「ポイントが反映されない」が大半</strong>です。
        スレッドを開くと、そのユーザーの残高・直近の獲得履歴・<strong>未確定オファー</strong>・
        却下された postback・未解決の不正フラグがまとめて表示されるので、DB を手で漁らずに回答できます。
      </div>

      <table>
        <thead>
          <tr><th>状態</th><th>種別</th><th>件名</th><th>ユーザー</th><th className="right">残高</th><th>最終更新</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={selected?.id === r.id ? { background: '#f4f5ff' } : undefined}>
              <td><span className={STATUS[r.status].cls}>{STATUS[r.status].label}</span></td>
              <td>{CATEGORY_LABEL[r.category] ?? r.category}</td>
              <td>
                {r.subject}
                {r.last_from_staff === false && r.status !== 'closed' && (
                  <span className="pill warn" style={{ marginLeft: 6 }}>要返信</span>
                )}
              </td>
              <td className="mono">{r.handle ? `@${r.handle}` : r.user_id.slice(0, 8)}</td>
              <td className="right mono">{Number(r.balance ?? 0).toLocaleString()}</td>
              <td className="mono">{fmt(r.last_message_at)}</td>
              <td className="right"><a className="btn" href={`/support?id=${r.id}`}>開く</a></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>問い合わせはありません</td></tr>
          )}
        </tbody>
      </table>

      {selected && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 28 }}>{selected.subject}</h2>

          {context && (
            <div className="ctx">
              <div className="kpis" style={{ marginBottom: 12 }}>
                <div className="kpi"><div className="l">現在の残高</div><div className="v">{Number(context.balance).toLocaleString()}<small> P</small></div></div>
                <div className="kpi"><div className="l">累計獲得</div><div className="v">{Number(context.lifetime_earned).toLocaleString()}<small> P</small></div></div>
                <div className="kpi">
                  <div className="l">アカウント状態</div>
                  <div className="v" style={{ fontSize: 18 }}>
                    {context.moderation_state}
                    {context.deletion_status === 'pending' && <span className="pill warn" style={{ marginLeft: 6 }}>退会手続き中</span>}
                  </div>
                </div>
              </div>

              {context.pending_offers.length > 0 && (
                <p className="note alert">
                  未確定のオファーが {context.pending_offers.length} 件あります（
                  {context.pending_offers.map((o) => `${o.network_txn_id}:${o.status}`).join(', ')}）。
                  <strong>「反映されない」の最頻の原因です。</strong>提携先の確定待ちかを確認してください。
                </p>
              )}
              {context.open_fraud_flags.length > 0 && (
                <p className="note alert">
                  未解決の不正フラグ: {context.open_fraud_flags.map((f) => `${f.type}(${f.severity})`).join(', ')}。
                  凍結中であれば付与が止まっています。
                </p>
              )}
              {context.rejected_postbacks.length > 0 && (
                <p className="note">
                  却下された postback: {context.rejected_postbacks.slice(0, 5).map((e) => `${e.transaction_id}(${e.status})`).join(', ')}
                </p>
              )}

              <h3 style={{ fontSize: 13, marginTop: 16 }}>直近のポイント増減</h3>
              <table>
                <thead><tr><th>日時</th><th>理由</th><th className="right">増減</th><th>状態</th></tr></thead>
                <tbody>
                  {context.recent_ledger.map((l, i) => (
                    <tr key={i}>
                      <td className="mono">{fmt(l.at)}</td>
                      <td>{l.reason}</td>
                      <td className="right mono" style={{ color: l.delta < 0 ? '#c0392b' : undefined }}>
                        {l.delta > 0 ? '+' : ''}{Number(l.delta).toLocaleString()}
                      </td>
                      <td className="muted">{l.status}</td>
                    </tr>
                  ))}
                  {context.recent_ledger.length === 0 && (
                    <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>取引がありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={{ fontSize: 13, marginTop: 20 }}>やり取り</h3>
          {messages.map((m) => (
            <div key={m.id} className={m.is_staff ? 'msg staff' : 'msg user'}>
              <div className="msg-who">{m.is_staff ? 'サポート' : 'ユーザー'} ・ <span className="mono">{fmt(m.created_at)}</span></div>
              <div className="msg-body">{m.body}</div>
            </div>
          ))}

          {selected.status !== 'closed' && (
            <form className="form" action={answer} style={{ padding: 0, marginTop: 14 }}>
              <input type="hidden" name="id" value={selected.id} />
              <div className="field wide">
                <label htmlFor="reply-body">返信</label>
                <textarea id="reply-body" name="body" required />
              </div>
              <div className="form-foot">
                <button className="btn primary" type="submit" name="action" value="answer">返信する</button>
                <button className="btn" type="submit" name="action" value="resolve">返信して解決にする</button>
              </div>
            </form>
          )}
          <form action={close} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={selected.id} />
            <button className="btn" type="submit">クローズする</button>
          </form>
        </>
      )}
    </>
  );
}
