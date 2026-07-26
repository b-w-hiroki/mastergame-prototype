-- ============================================================
-- MasterGame — seed data (catalogs). Run after migrations.
-- ============================================================

-- VIP tiers (staking rate in bps: 100 = 1.0% / 月)
insert into public.vip_tiers (name, min_xp, staking_rate_bps, point_boost_bps, sort) values
  ('ブロンズ',     0,   100, 300, 1),
  ('シルバー',  3000,   150, 500, 2),
  ('ゴールド', 10000,   200, 700, 3),
  ('プラチナ', 30000,   300, 900, 4),
  ('ダイヤ',   80000,   500,1100, 5);

-- ad networks
insert into public.ad_networks (code, name, priority) values
  ('applovin','AppLovin',10),('tapjoy','Tapjoy',20),
  ('ironsource','ironSource',30),('pollfish','PollFish',40);

-- games (genre-based)
insert into public.games (slug, name, genre) values
  ('eldia','エルディア戦記','rpg'),
  ('monster','モンスターアリーナ','strategy'),
  ('starfall','スターフォール','shooter'),
  ('puzzle-kingdom','パズルキングダム','puzzle'),
  ('sengoku','戦国アリーナ','strategy');

-- missions （reward_points は 1,000P=1円 換算。xp_reward は活動量ベースで独立）
insert into public.missions (type, title, reward_points, xp_reward, icon, max_progress, requires_verification) values
  ('daily','攻略記事を1本読む',3000,30,'news',1,false),
  ('daily','公式Xのポストを見る',2000,20,'x',1,false),
  ('daily','ログインボーナスを受け取る',1000,10,'check',1,false),
  ('weekly','デイリーミッションを5日達成',20000,200,'target',5,false),
  ('achievement','累計1,000,000P獲得',50000,500,'crown',1000000,false),
  ('event','『エルディア戦記』事前登録',50000,500,'sword',1,true),    -- 要postback検証
  ('offer','『パズルキングダム』をインストール',80000,300,'game',1,true);

-- exchange items
insert into public.exchange_items (name, game_id, cost_points, delivery_method, stock, sort)
select v.name, g.id, v.cost, v.method, v.stock, v.sort
from (values
  ('ゲーム内通貨 1,000','eldia',80000,'code',null,1),
  ('スタミナ回復ドリンク ×5','eldia',30000,'code',null,2),
  ('ガチャチケット ×3','monster',150000,'api',120,3),
  ('限定レアキャラ確定チケット','monster',120000,'code',0,4),
  ('プレミアム装備スキン','starfall',160000,'code',null,5),
  ('Amazonギフト券 500円分',null,500000,'csv',58,6)   -- 500円 ÷ (1000P=1円) = 500,000P
) as v(name,gslug,cost,method,stock,sort)
left join public.games g on g.slug = v.gslug;

-- ad partners（postback 検証の相手。sandbox の署名鍵は Vault 参照名で保持）
-- 検証には環境変数 POSTBACK_SECRET_SANDBOX を設定する（.env.example 参照）。
insert into public.ad_partners (name, slug, signing_secret_ref, allowed_ips, attribution_window, postback_mode, status) values
  ('Sandbox Partner','sandbox','vault:POSTBACK_SECRET_SANDBOX', null, interval '24 hours','sandbox','active');

-- 検証が必要なミッション（event/offer）を sandbox パートナーへ紐づける（postback パスを E2E 可能に）
update public.missions m
  set partner_id = (select id from public.ad_partners where slug = 'sandbox')
  where m.requires_verification and m.partner_id is null;

-- offers（offerwall。ad_networks に紐づく）。offer_url は本番でネットワーク SDK/API が払い出す。
insert into public.offers (network_id, external_id, title, description, reward_points, event_type, status, offer_url)
select n.id, v.ext, v.title, v.descr, v.reward, v.evt, 'active', v.url
from (values
  ('applovin','of-install-001','新作RPGをインストール','インストール後に起動で達成',60000,'install','https://example.com/offer/of-install-001'),
  ('tapjoy','of-purchase-002','ショップで初回購入','初回課金で達成',200000,'purchase','https://example.com/offer/of-purchase-002'),
  ('pollfish','of-survey-003','アンケートに回答','約5分のアンケート',12000,'survey','https://example.com/offer/of-survey-003')
) as v(netcode,ext,title,descr,reward,evt,url)
join public.ad_networks n on n.code = v.netcode;

-- public forum + a couple topics (author設定はアプリ層/サインアップ後に作成想定。ここは構造例)
insert into public.forums (slug, name, description, type) values
  ('lounge','公開ラウンジ','なんでも雑談OKの広場','public'),
  ('eldia-guild','エルディア戦記 ギルド','攻略・パーティ募集・質問','game');
