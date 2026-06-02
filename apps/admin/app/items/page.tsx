import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Item = {
  id: string;
  name: string;
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

export default async function Items() {
  const { data, error } = await supabaseAdmin
    .from('exchange_items')
    .select('id,name,cost_points,delivery_method,stock,is_active,sort,created_at')
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
      <table>
        <thead>
          <tr>
            <th>並び</th><th>アイテム</th><th className="right">必要P</th><th className="right">≒ 金額</th>
            <th>受け渡し</th><th className="right">在庫</th><th>状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => (
            <tr key={it.id}>
              <td className="mono">{it.sort}</td>
              <td>{it.name}</td>
              <td className="right"><b>{it.cost_points.toLocaleString()}</b> P</td>
              <td className="right muted">¥{toYen(it.cost_points).toLocaleString()}</td>
              <td><span className="pill mute">{DELIVERY[it.delivery_method]}</span></td>
              <td className="right">{it.stock === null ? <span className="muted">無制限</span> : it.stock.toLocaleString()}</td>
              <td>{it.is_active ? <span className="pill ok">● 公開</span> : <span className="pill mute">非公開</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>交換アイテムがまだ登録されていません</td></tr>
          )}
        </tbody>
      </table>
      <p className="note">※ 読み取り専用の一覧です（1,000P = 1円換算）。作成・編集・在庫調整は運営RPCを介して順次対応します。</p>
    </>
  );
}
