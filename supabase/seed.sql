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

-- missions
insert into public.missions (type, title, reward_points, icon, max_progress, requires_verification) values
  ('daily','攻略記事を1本読む',30,'news',1,false),
  ('daily','公式Xのポストを見る',20,'x',1,false),
  ('daily','ログインボーナスを受け取る',10,'check',1,false),
  ('weekly','デイリーミッションを5日達成',200,'target',5,false),
  ('achievement','累計10,000P獲得',500,'crown',10000,false),
  ('event','『エルディア戦記』事前登録',500,'sword',1,true),    -- 要postback検証
  ('offer','『パズルキングダム』をインストール',800,'game',1,true);

-- exchange items
insert into public.exchange_items (name, game_id, cost_points, delivery_method, stock, sort)
select v.name, g.id, v.cost, v.method, v.stock, v.sort
from (values
  ('ゲーム内通貨 1,000','eldia',800,'code',null,1),
  ('スタミナ回復ドリンク ×5','eldia',300,'code',null,2),
  ('ガチャチケット ×3','monster',1500,'api',120,3),
  ('限定レアキャラ確定チケット','monster',1200,'code',0,4),
  ('プレミアム装備スキン','starfall',1600,'code',null,5),
  ('Amazonギフト券 500円分',null,5000,'csv',58,6)
) as v(name,gslug,cost,method,stock,sort)
left join public.games g on g.slug = v.gslug;

-- public forum + a couple topics (author設定はアプリ層/サインアップ後に作成想定。ここは構造例)
insert into public.forums (slug, name, description, type) values
  ('lounge','公開ラウンジ','なんでも雑談OKの広場','public'),
  ('eldia-guild','エルディア戦記 ギルド','攻略・パーティ募集・質問','game');
