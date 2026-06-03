import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

type Item = {
  id: string;
  name: string;
  description: string | null;
  cost_points: number;
  delivery_method: 'csv' | 'code' | 'api';
  stock: number | null;
  is_active: boolean;
  sort: number;
  created_at: string;
};

const DELIVERY: Record<Item['delivery_method'], string> = {
  csv: 'CSV式',
  code: 'コード式',
  api: 'API式',
};

// 1,000P = 1円（app_config.point_yen_rate と一致。表示用の概算）
const toYen = (p: number) => Math.round((p / 1000) * 100) / 100;

const toIntOrNull = (v: FormDataEntryValue | null) => {
  const s = v ? String(v).trim() : '';
  if (s === '') return null;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? n : null;
};

// 作成 / 更新（マスタ。ポイント操作なし＝安全。service_role でRLSバイパス）
async function saveItem(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const cost = toIntOrNull(formData.get('cost_points'));

  if (name === '') throw new Error('name required');
  if (cost === null || cost <= 0) throw new Error('cost_points must be > 0');

  // 在庫：空欄 = 無制限（null）
  const stock = toIntOrNull(formData.get('stock'));

  const payload = {
    name,
    description: (String(formData.get('description') ?? '').trim() || null),
    cost_points: cost,
    delivery_method: String(formData.get('delivery_method')) as Item['delivery_method'],
    stock,
    sort: toIntOrNull(formData.get('sort')) ?? 0,
    is_active: formData.get('is_active') === 'on',
  };

  const res = id
    ? await supabaseAdmin.from('exchange_items').update(payload).eq('id', id)
    : await supabaseAdmin.from('exchange_items').insert(payload);
  if (res.error) throw new Error(res.error.message);

  revalidatePath('/items');
}

async function toggleItem(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const next = String(formData.get('next')) === 'true';
  const { error } = await supabaseAdmin.from('exchange_items').update({ is_active: next }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/items');
}

async function deleteItem(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const { error } = await supabaseAdmin.from('exchange_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/items');
}

function ItemForm({ it }: { it?: Item }) {
  return (
    <form action={saveItem} className="form">
      {it && <input type="hidden" name="id" value={it.id} />}
      <div className="form-grid">
        <div className="field wide">
          <label>アイテム名</label>
          <input type="text" name="name" defaultValue={it?.name ?? ''} required />
        </div>
        <div className="field wide">
          <label>説明（任意）</label>
          <textarea name="description" defaultValue={it?.description ?? ''} />
        </div>
        <div className="field">
          <label>必要ポイント</label>
          <input type="number" name="cost_points" defaultValue={it?.cost_points ?? 1000} min={1} required />
        </div>
        <div className="field">
          <label>受け渡し方法</label>
          <select name="delivery_method" defaultValue={it?.delivery_method ?? 'code'}>
            <option value="code">コード式</option>
            <option value="csv">CSV式</option>
            <option value="api">API式</option>
          </select>
        </div>
        <div className="field">
          <label>在庫（空欄＝無制限）</label>
          <input type="number" name="stock" defaultValue={it?.stock ?? ''} min={0} />
        </div>
        <div className="field">
          <label>並び順（sort）</label>
          <input type="number" name="sort" defaultValue={it?.sort ?? 0} />
        </div>
        <div className="field check">
          <input type="checkbox" id={`ia-${it?.id ?? 'new'}`} name="is_active" defaultChecked={it?.is_active ?? true} />
          <label htmlFor={`ia-${it?.id ?? 'new'}`}>公開する</label>
        </div>
      </div>
      <div className="form-foot">
        <button className="btn primary" type="submit">{it ? '更新する' : '作成する'}</button>
      </div>
    </form>
  );
}

export default async function Items() {
  const { data, error } = await supabaseAdmin
    .from('exchange_items')
    .select('id,name,description,cost_points,delivery_method,stock,is_active,sort,created_at')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <>
        <h1>交換アイテム管理</h1>
        <p className="note">取得に失敗しました（{error.message}）。<code>exchange_items</code> テーブルと SERVICE_ROLE_KEY を確認してください。</p>
      </>
    );
  }
  const rows = (data as Item[]) ?? [];
  const active = rows.filter((i) => i.is_active).length;

  return (
    <>
      <h1>交換アイテム管理（{rows.length} 件 / 公開 {active}）</h1>
      <div className="sub">ポイントと交換できるアイテムのマスタ。在庫が空欄のものは無制限です。</div>

      <details className="editor">
        <summary>＋ 新しい交換アイテムを作成</summary>
        <ItemForm />
      </details>

      <table>
        <thead>
          <tr>
            <th>並び</th><th>アイテム</th><th className="right">必要P</th><th className="right">≒ 金額</th>
            <th>受け渡し</th><th className="right">在庫</th><th>状態</th><th className="right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => (
            <tr key={it.id}>
              <td className="mono">{it.sort}</td>
              <td>
                <details className="editor" style={{ margin: 0, border: 0, background: 'transparent' }}>
                  <summary style={{ padding: 0, color: 'var(--ink)', fontWeight: 600 }}>{it.name}</summary>
                  <ItemForm it={it} />
                </details>
              </td>
              <td className="right"><b>{it.cost_points.toLocaleString()}</b> P</td>
              <td className="right muted">¥{toYen(it.cost_points).toLocaleString()}</td>
              <td><span className="pill mute">{DELIVERY[it.delivery_method]}</span></td>
              <td className="right">{it.stock === null ? <span className="muted">無制限</span> : it.stock.toLocaleString()}</td>
              <td>{it.is_active ? <span className="pill ok">● 公開</span> : <span className="pill mute">非公開</span>}</td>
              <td className="right">
                <div className="actions" style={{ justifyContent: 'flex-end' }}>
                  <form action={toggleItem}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="next" value={(!it.is_active).toString()} />
                    <button className={`btn ${it.is_active ? 'warn' : ''}`} type="submit">{it.is_active ? '非公開' : '公開'}</button>
                  </form>
                  <form action={deleteItem}>
                    <input type="hidden" name="id" value={it.id} />
                    <button className="btn danger" type="submit">削除</button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>交換アイテムがまだ登録されていません</td></tr>
          )}
        </tbody>
      </table>
      <p className="note">※ アイテム名をクリックすると編集できます（1,000P = 1円換算）。マスタ更新は service_role 経由で即時反映されます。</p>
    </>
  );
}
