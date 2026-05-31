import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Overview = {
  total_users: number;
  distributed_points: number;
  exchanged_points: number;
  exchange_users: number;
  open_reports: number;
  pending_postbacks: number;
  distributed_yen: number;
  exchanged_yen: number; // 円換算（1,000P = 1円。レートは app_config.point_yen_rate）
};

export default async function Dashboard() {
  // service_role で集計ビューを参照（admin_overview は 0007_admin.sql）
  const { data, error } = await supabaseAdmin.from('admin_overview').select('*').single<Overview>();

  if (error || !data) {
    return (
      <>
        <h1>ダッシュボード</h1>
        <p className="note">
          集計を取得できませんでした。<code>.env</code> に Supabase の URL / SERVICE_ROLE_KEY を設定し、
          マイグレーション（<code>supabase/migrations</code>）と <code>admin_overview</code> ビューを適用してください。
        </p>
      </>
    );
  }

  return (
    <>
      <h1>ダッシュボード</h1>
      <div className="kpis">
        <div className="kpi"><div className="l">総ユーザー数</div><div className="v">{data.total_users.toLocaleString()}<small> 人</small></div></div>
        <div className="kpi"><div className="l">配布ポイント総数</div><div className="v">{data.distributed_points.toLocaleString()}<small> P</small></div></div>
        <div className="kpi"><div className="l">交換済みポイント</div><div className="v">{data.exchanged_points.toLocaleString()}<small> P</small></div></div>
        <div className="kpi"><div className="l">配布交換金額(1,000P=1円)</div><div className="v">¥{data.exchanged_yen.toLocaleString()}</div></div>
        <div className="kpi"><div className="l">交換実績ユーザー</div><div className="v">{data.exchange_users.toLocaleString()}<small> 人</small></div></div>
        <div className="kpi"><div className="l">未対応の通報</div><div className="v">{data.open_reports.toLocaleString()}</div></div>
      </div>
      <p className="note">
        ※ プロトタイプ admin.html に対応する実装の土台です。ユーザー管理（ソート/BAN）・通報対応・postback承認は
        <code>admin_user_rows</code> ビューと運営用 RPC を介して順次実装します。
      </p>
    </>
  );
}
