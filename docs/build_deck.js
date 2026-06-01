/* MasterGame 仕様提案 + MVP分割 デッキ生成 */
const pptx = require("pptxgenjs");
const p = new pptx();
p.layout = "LAYOUT_WIDE";          // 13.3 x 7.5 in
p.author = "MasterGame";
p.title = "MasterGame 仕様提案・MVP分割";

const W = 13.333, H = 7.5;
const F = "Meiryo";                  // 日本語フォント

const C = {
  ink:   "1F2430",
  navy:  "171A2B",
  accent:"3B4CCA",
  purple:"7A4FD0",
  gold:  "C79A3A",
  soft:  "E7E9FB",
  softp: "EFE7FB",
  softg: "F6EFDA",
  line:  "E2E5EC",
  bg:    "F4F5F8",
  white: "FFFFFF",
  sub:   "6B7280",
  muted: "9AA0AC",
  ok:    "2F8F5B",
};
const shadow = () => ({ type:"outer", color:"1F2430", blur:9, offset:3, angle:135, opacity:0.12 });

let page = 0;
function footer(s, dark){
  const col = dark ? "8A90B0" : C.muted;
  s.addText("MasterGame ｜ 仕様提案・MVP分割", { x:0.55, y:H-0.42, w:7, h:0.3, fontFace:F, fontSize:8.5, color:col });
  s.addText("CONFIDENTIAL", { x:W-3.3, y:H-0.42, w:1.8, h:0.3, fontFace:F, fontSize:8.5, color:col, align:"right" });
  s.addText(String(page).padStart(2,"0"), { x:W-1.25, y:H-0.42, w:0.7, h:0.3, fontFace:F, fontSize:8.5, color:col, align:"right", bold:true });
}
function header(s, kicker, title){
  s.background = { color: C.bg };
  s.addText(kicker, { x:0.6, y:0.45, w:11, h:0.3, fontFace:F, fontSize:11, color:C.accent, bold:true, charSpacing:2 });
  s.addText(title, { x:0.58, y:0.74, w:12.1, h:0.7, fontFace:F, fontSize:25, color:C.ink, bold:true });
  page++;
}
function chip(s, x, y, w, txt, fill, col){
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h:0.34, fill:{color:fill}, rectRadius:0.17, line:{type:"none"} });
  s.addText(txt, { x, y, w, h:0.34, fontFace:F, fontSize:9.5, color:col, bold:true, align:"center", valign:"middle" });
}

/* ============ 1. TITLE ============ */
(() => {
  const s = p.addSlide(); s.background = { color: C.navy };
  s.addShape(p.shapes.OVAL, { x:9.0, y:-2.4, w:7, h:7, fill:{color:C.accent, transparency:78}, line:{type:"none"} });
  s.addShape(p.shapes.OVAL, { x:10.8, y:3.2, w:5.5, h:5.5, fill:{color:C.purple, transparency:82}, line:{type:"none"} });
  // logo mark
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x:0.85, y:1.35, w:1.0, h:1.0, fill:{color:C.accent}, rectRadius:0.22, line:{type:"none"}, shadow:shadow() });
  s.addText("MG", { x:0.85, y:1.35, w:1.0, h:1.0, fontFace:F, fontSize:26, color:C.white, bold:true, align:"center", valign:"middle" });
  s.addText("MasterGame", { x:2.05, y:1.45, w:8, h:0.85, fontFace:F, fontSize:30, color:C.white, bold:true });
  s.addText("ゲームを、もっと得する遊びに。", { x:2.08, y:2.22, w:8, h:0.4, fontFace:F, fontSize:13, color:"C8CBE6" });

  s.addText("仕様提案書 ＋ MVP分割", { x:0.85, y:3.55, w:11, h:0.9, fontFace:F, fontSize:40, color:C.white, bold:true });
  s.addText("ポイ活 × ゲームコミュニティ プラットフォーム", { x:0.9, y:4.55, w:11, h:0.5, fontFace:F, fontSize:15, color:"AEB3D8" });

  s.addShape(p.shapes.LINE, { x:0.9, y:5.35, w:4.2, h:0, line:{color:C.gold, width:2} });
  s.addText([
    { text:"対象範囲：", options:{ bold:true, color:"AEB3D8" } },
    { text:"Phase1 / コアフロー（ログイン→ホーム→ミッション→ポイント交換）", options:{ color:"E7E8F2" } },
  ], { x:0.9, y:5.55, w:11, h:0.4, fontFace:F, fontSize:12 });
  s.addText("2026.05 ｜ 既存3資料（構想・サービス紹介・開発要件）に基づく", {
    x:0.9, y:6.5, w:11.5, h:0.4, fontFace:F, fontSize:10.5, color:"8A90B0" });
})();

/* ============ 2. 本提案の位置づけ ============ */
(() => {
  const s = p.addSlide(); header(s, "OVERVIEW", "本提案の位置づけ");
  s.addText("既存3資料を統合し、開発に着手できる粒度へ「仕様提案 → MVP分割 → ワイヤーフレーム」を具体化しました。", {
    x:0.6, y:1.55, w:12, h:0.4, fontFace:F, fontSize:13, color:C.sub });
  const src = [
    ["構想.pptx", "事業の最終形と Phase1–4 ロードマップ", C.accent],
    ["サービス紹介.pptx", "提供価値・ビジネスモデル・導入フロー", C.purple],
    ["開発要件.xlsx", "フェーズ詳細・画面リスト・機能リスト", C.gold],
  ];
  src.forEach((d,i)=>{
    const x = 0.6 + i*4.07;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y:2.2, w:3.8, h:1.5, fill:{color:C.white}, rectRadius:0.08, line:{color:C.line,width:1}, shadow:shadow() });
    s.addShape(p.shapes.RECTANGLE, { x, y:2.2, w:0.09, h:1.5, fill:{color:d[2]}, line:{type:"none"} });
    s.addText(d[0], { x:x+0.3, y:2.42, w:3.3, h:0.4, fontFace:F, fontSize:14, color:C.ink, bold:true });
    s.addText(d[1], { x:x+0.3, y:2.86, w:3.3, h:0.7, fontFace:F, fontSize:11, color:C.sub });
  });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x:0.6, y:4.1, w:12.1, h:2.5, fill:{color:C.white}, rectRadius:0.08, line:{color:C.line,width:1}, shadow:shadow() });
  s.addText("本提案に含む成果物", { x:0.95, y:4.32, w:11, h:0.4, fontFace:F, fontSize:14, color:C.ink, bold:true });
  const deliv = [
    ["① 仕様提案", "サービス価値・ビジネスモデル・Phase1スコープ・技術スタックの整理"],
    ["② MVP分割", "Phase1を MVP0→1→2→3 に分割し、各ゴール・受け入れ基準を定義"],
    ["③ ワイヤーフレーム", "MVP1コアフローの操作可能HTMLモック（別ファイル）"],
  ];
  deliv.forEach((d,i)=>{
    const y = 4.78 + i*0.58;
    s.addText(d[0], { x:0.95, y, w:2.7, h:0.45, fontFace:F, fontSize:12, color:C.accent, bold:true, valign:"middle" });
    s.addText(d[1], { x:3.7, y, w:8.7, h:0.45, fontFace:F, fontSize:11.5, color:C.ink, valign:"middle" });
    if(i<2) s.addShape(p.shapes.LINE, { x:0.95, y:y+0.5, w:11.4, h:0, line:{color:C.line,width:0.75} });
  });
  footer(s);
})();

/* ============ 3. サービス概要（コアループ） ============ */
(() => {
  const s = p.addSlide(); header(s, "WHAT IS MASTERGAME", "サービス概要：価値の循環");
  s.addText("ユーザーは「ミッション」でポイントを貯め、提携ゲームのアイテムや実物報酬と交換できる。", {
    x:0.6, y:1.55, w:12, h:0.4, fontFace:F, fontSize:13, color:C.sub });
  // core loop 3 nodes
  const nodes = [
    ["🎯", "ミッション", "記事を読む / Xを見る\nゲーム関連アクション", C.accent, C.soft],
    ["🪙", "ポイント獲得", "活動が評価され\nポイントとして蓄積", C.gold, C.softg],
    ["🎁", "アイテム交換", "ゲーム内アイテム\n・実物報酬と交換", C.purple, C.softp],
  ];
  nodes.forEach((n,i)=>{
    const x = 1.1 + i*4.0;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y:2.45, w:3.0, h:2.2, fill:{color:C.white}, rectRadius:0.1, line:{color:C.line,width:1}, shadow:shadow() });
    s.addShape(p.shapes.OVAL, { x:x+1.15, y:2.7, w:0.7, h:0.7, fill:{color:n[4]}, line:{type:"none"} });
    s.addText(n[0], { x:x+1.15, y:2.7, w:0.7, h:0.7, fontFace:F, fontSize:24, align:"center", valign:"middle" });
    s.addText(n[1], { x:x, y:3.5, w:3.0, h:0.4, fontFace:F, fontSize:15, color:C.ink, bold:true, align:"center" });
    s.addText(n[2], { x:x+0.15, y:3.92, w:2.7, h:0.7, fontFace:F, fontSize:10.5, color:C.sub, align:"center" });
    if(i<2) s.addText("➜", { x:x+3.0, y:2.45, w:1.0, h:2.2, fontFace:F, fontSize:26, color:C.muted, align:"center", valign:"middle" });
  });
  // bottom value bar
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x:0.6, y:5.15, w:12.1, h:1.5, fill:{color:C.ink}, rectRadius:0.1, line:{type:"none"} });
  s.addText("コミュニティ＝RPGのギルド：", { x:0.95, y:5.32, w:11, h:0.4, fontFace:F, fontSize:12, color:C.gold, bold:true });
  s.addText([
    { text:"フォーラム", options:{bold:true, color:C.white} }, { text:"（箱）　", options:{color:"C8CBD8"} },
    { text:"チャット", options:{bold:true, color:C.white} }, { text:"（会話）　", options:{color:"C8CBD8"} },
    { text:"トピック", options:{bold:true, color:C.white} }, { text:"（依頼）　— ゲーム特化のYahoo知恵袋型で相互互助×報酬を実現", options:{color:"C8CBD8"} },
  ], { x:0.95, y:5.75, w:11.4, h:0.8, fontFace:F, fontSize:12 });
  footer(s);
})();

/* ============ 4. 提供価値 ============ */
(() => {
  const s = p.addSlide(); header(s, "VALUE", "提供価値：ユーザー × ゲーム会社");
  // user column
  const cols = [
    ["ユーザーへの価値", C.accent, C.soft, [
      ["無料で得する", "課金しなくてもミッションでアイテムが手に入る"],
      ["時間が報われる", "プレイ・活動・交流が報酬につながる"],
      ["コミュニティ", "相互互助とポイント賭け質問で困りごとを解決"],
    ]],
    ["ゲーム会社への価値（KPI）", C.purple, C.softp, [
      ["非課金ユーザーのマネタイズ", "交換アイテムに応じて運営へ支払い"],
      ["ユーザー獲得", "無償の誘導枠で送客（掲載頻度は規定あり）"],
      ["継続率の向上", "楽しさ設計＋公式コミュニティで定着"],
    ]],
  ];
  cols.forEach((c,ci)=>{
    const x = 0.6 + ci*6.25;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y:1.7, w:5.85, h:4.9, fill:{color:C.white}, rectRadius:0.08, line:{color:C.line,width:1}, shadow:shadow() });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x:x+0.35, y:2.0, w:5.15, h:0.55, fill:{color:c[2]}, rectRadius:0.1, line:{type:"none"} });
    s.addText(c[0], { x:x+0.35, y:2.0, w:5.15, h:0.55, fontFace:F, fontSize:14, color:c[1], bold:true, align:"center", valign:"middle" });
    c[3].forEach((v,vi)=>{
      const y = 2.85 + vi*1.16;
      s.addShape(p.shapes.OVAL, { x:x+0.4, y:y+0.03, w:0.34, h:0.34, fill:{color:c[1]}, line:{type:"none"} });
      s.addText(String(vi+1), { x:x+0.4, y:y+0.03, w:0.34, h:0.34, fontFace:F, fontSize:11, color:C.white, bold:true, align:"center", valign:"middle" });
      s.addText(v[0], { x:x+0.95, y, w:4.6, h:0.4, fontFace:F, fontSize:13, color:C.ink, bold:true });
      s.addText(v[1], { x:x+0.95, y:y+0.4, w:4.6, h:0.55, fontFace:F, fontSize:10.5, color:C.sub });
    });
  });
  footer(s);
})();

/* ============ 5. ビジネスモデル ============ */
(() => {
  const s = p.addSlide(); header(s, "BUSINESS MODEL", "ビジネスモデル：アフィリエイト型（初期）");
  s.addText("ゲーム会社からアイテムを仕入れ、広告費の一部をユーザーにポイント還元。鍵は「ここでしか手に入らない」限定アイテム。", {
    x:0.6, y:1.55, w:12.3, h:0.4, fontFace:F, fontSize:12.5, color:C.sub });
  const box = (x,y,w,h,fill,line)=>s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y,w,h,fill:{color:fill},rectRadius:0.1,line:line?{color:line,width:1}:{type:"none"},shadow:shadow()});
  // three actors
  box(0.7,2.3,3.5,1.0,C.ink); s.addText("企業（広告主）", {x:0.7,y:2.3,w:3.5,h:1.0,fontFace:F,fontSize:14,color:C.white,bold:true,align:"center",valign:"middle"});
  box(4.9,2.3,3.5,1.0,C.accent); s.addText("MasterGame", {x:4.9,y:2.3,w:3.5,h:1.0,fontFace:F,fontSize:14,color:C.white,bold:true,align:"center",valign:"middle"});
  box(9.1,2.3,3.5,1.0,C.purple); s.addText("ゲーマー（ユーザー）", {x:9.1,y:2.3,w:3.5,h:1.0,fontFace:F,fontSize:13,color:C.white,bold:true,align:"center",valign:"middle"});
  box(4.9,5.4,3.5,1.0,C.gold); s.addText("ゲーム会社（提携先）", {x:4.9,y:5.4,w:3.5,h:1.0,fontFace:F,fontSize:12.5,color:C.white,bold:true,align:"center",valign:"middle"});
  // flows (labels)
  const flow = (x,y,w,t,col,align)=>s.addText(t,{x,y,w,h:0.35,fontFace:F,fontSize:10.5,color:col,bold:true,align:align||"center"});
  // ③ 企業 → MasterGame（箱の中心 y=2.8 で連結）
  s.addShape(p.shapes.LINE,{x:4.2,y:2.8,w:0.7,h:0,line:{color:C.muted,width:1.5,endArrowType:"triangle"}});
  flow(3.55,2.05,2.0,"③ 広告費 ¥",C.ink);
  // ④/⑤ MasterGame ⇄ ゲーマー（双方向：還元と交換申請）
  s.addShape(p.shapes.LINE,{x:8.4,y:2.8,w:0.7,h:0,line:{color:C.muted,width:1.5,beginArrowType:"triangle",endArrowType:"triangle"}});
  flow(7.6,2.05,2.3,"④ ポイント還元 P",C.accent);
  flow(7.4,3.42,2.7,"⑤ 貯めたPで交換申請",C.purple);
  // ①/⑥⑦ MasterGame ⇄ ゲーム会社（双方向：納品と付与・精算。箱の上下端を連結）
  s.addShape(p.shapes.LINE,{x:6.65,y:3.3,w:0,h:2.1,line:{color:C.muted,width:1.5,beginArrowType:"triangle",endArrowType:"triangle"}});
  flow(3.35,4.2,2.9,"① アイテム納品",C.gold,"right");
  flow(6.95,4.2,4.2,"⑥ アイテム付与 ／ ⑦ コード精算 ¥",C.gold,"left");
  // note
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.7,y:6.55,w:11.9,h:0.0,line:{type:"none"},fill:{color:C.white}});
  s.addText([
    {text:"導入条件：",options:{bold:true,color:C.ink}},
    {text:"初期・月額費用 無料／システム連携 原則なし（API利用時のみ）。納品は CSV式・コード式・API式（開発中）。報酬は ",options:{color:C.sub}},
    {text:"翌々月末",options:{bold:true,color:C.accent}},
    {text:" 精算。",options:{color:C.sub}},
  ],{x:0.7,y:6.55,w:11.9,h:0.4,fontFace:F,fontSize:11});
  footer(s);
})();

/* ============ 6. フェーズロードマップ ============ */
(() => {
  const s = p.addSlide(); header(s, "ROADMAP", "フェーズ・ロードマップ");
  const ph = [
    ["Phase 1", "MVP", "ポイ活×ゲームコミュニティの確立", "2025/6–7", C.accent],
    ["Phase 1.5", "拡充", "継続・BtoBメリット強化（MAU最大化）", "2025/8–10", C.purple],
    ["Phase 2", "基盤化", "独自PF化・エンゲージ・API提供", "2025/11", C.ink],
    ["Phase 3", "連携", "ゲーム連携自動化・外部課金・KPI", "2026/3", C.gold],
    ["Phase 4+", "Web3", "NFT/仮想通貨化・自社スタジオ", "2027–", "5A6072"],
  ];
  const colW = 2.32, gap = 0.18, x0 = 0.6, y0 = 2.2;
  // baseline
  s.addShape(p.shapes.LINE,{x:x0+0.2,y:y0+2.7,w:12.0,h:0,line:{color:C.line,width:2}});
  ph.forEach((d,i)=>{
    const x = x0 + i*(colW+gap);
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y:y0,w:colW,h:2.4,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
    s.addShape(p.shapes.RECTANGLE,{x,y:y0,w:colW,h:0.5,fill:{color:d[4]},line:{type:"none"}});
    s.addText(d[0],{x,y:y0,w:colW,h:0.5,fontFace:F,fontSize:13,color:C.white,bold:true,align:"center",valign:"middle"});
    chip(s,x+colW/2-0.55,y0+0.65,1.1,d[1],C.bg,d[4]);
    s.addText(d[2],{x:x+0.15,y:y0+1.12,w:colW-0.3,h:0.95,fontFace:F,fontSize:10,color:C.ink,align:"center",valign:"top"});
    // node + date
    s.addShape(p.shapes.OVAL,{x:x+colW/2-0.1,y:y0+2.6,w:0.2,h:0.2,fill:{color:d[4]},line:{color:C.white,width:2}});
    s.addText(d[3],{x:x-0.1,y:y0+2.9,w:colW+0.2,h:0.35,fontFace:F,fontSize:10.5,color:d[4],bold:true,align:"center"});
  });
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.6,y:6.0,w:12.1,h:0.7,fill:{color:C.soft},rectRadius:0.08,line:{type:"none"}});
  s.addText([
    {text:"本提案のスコープ：",options:{bold:true,color:C.accent}},
    {text:"Phase 1（必要に応じ Phase 1.5 の一部）。以降は将来を阻害しないデータ設計のみ考慮。",options:{color:C.ink}},
  ],{x:0.9,y:6.0,w:11.5,h:0.7,fontFace:F,fontSize:11.5,valign:"middle"});
  footer(s);
})();

/* ============ 7. Phase1 スコープ全体像 ============ */
(() => {
  const s = p.addSlide(); header(s, "PHASE 1 SCOPE", "Phase 1 スコープ全体像");
  const cats = [
    ["認証・基盤", ["アカウント作成/ログイン","OAuth(Google/Apple/LINE)","PWリセット","各種許諾/アクセスロック"]],
    ["マイページ", ["プロフィール設定","ログアウト/退会","通知/メールボックス"]],
    ["ホーム", ["ニュースフィード","広告バナー枠","お知らせ記事作成"]],
    ["コミュニケーション", ["トピック作成/投稿/返信","リアクション","ポイント賭け質問→報酬"]],
    ["ミッション", ["デイリー/ウィークリー/実績","期間限定(タイアップ)","進捗ゲージ/受取演出"]],
    ["ポイント", ["獲得","交換申請","履歴/月間推移"]],
    ["サポート", ["問い合わせフォーム","ヘルプ/FAQ","ショートカットメニュー"]],
    ["運用基盤・管理", ["管理ダッシュボード","BAN/凍結/マーキング","Push通知/行動分析"]],
  ];
  const cw=2.95, ch=2.18, gx=0.13, gy=0.16, x0=0.6, y0=1.65;
  cats.forEach((c,i)=>{
    const col=i%4, row=Math.floor(i/4);
    const x=x0+col*(cw+gx), y=y0+row*(ch+gy);
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y,w:cw,h:ch,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
    s.addShape(p.shapes.RECTANGLE,{x,y,w:cw,h:0.06,fill:{color:C.accent},line:{type:"none"}});
    s.addText(c[0],{x:x+0.25,y:y+0.18,w:cw-0.4,h:0.4,fontFace:F,fontSize:13,color:C.accent,bold:true});
    s.addText(c[1].map((t,j)=>({text:t,options:{bullet:{indent:10},breakLine:true,color:C.ink}})),
      {x:x+0.28,y:y+0.66,w:cw-0.5,h:ch-0.8,fontFace:F,fontSize:9.8,paraSpaceAfter:3,valign:"top"});
  });
  footer(s);
})();

/* ============ 8. MVP分割の考え方 ============ */
(() => {
  const s = p.addSlide(); header(s, "MVP STRATEGY", "MVP分割の考え方");
  s.addText("Phase1 を一括ではなく、価値の核から検証可能な4スライスに分割。各MVPは単独でリリース・学習できる状態を目標とする。", {
    x:0.6, y:1.55, w:12.3, h:0.5, fontFace:F, fontSize:13, color:C.sub });
  const pr = [
    ["①価値の核を先に固める", "「ミッション→ポイント→交換」を最優先で通し、サービスの存在理由を最短で体験可能に（=今回のWF）", C.accent],
    ["②縦に薄く通す", "各MVPは認証〜DB〜画面まで縦断。横に機能を増やす前に1本動かす", C.purple],
    ["③学習を組み込む", "MVPごとに受け入れ基準とKPIを定義し、次スライスの優先度を更新", C.gold],
  ];
  pr.forEach((d,i)=>{
    const y=2.35+i*1.35;
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.6,y,w:12.1,h:1.15,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
    s.addShape(p.shapes.RECTANGLE,{x:0.6,y,w:0.1,h:1.15,fill:{color:d[2]},line:{type:"none"}});
    s.addText(d[0],{x:1.0,y:y+0.2,w:4.0,h:0.75,fontFace:F,fontSize:15,color:C.ink,bold:true,valign:"middle"});
    s.addText(d[1],{x:5.0,y:y+0.2,w:7.5,h:0.75,fontFace:F,fontSize:11.5,color:C.sub,valign:"middle"});
  });
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.6,y:6.45,w:12.1,h:0.0,line:{type:"none"},fill:{color:C.white}});
  s.addText([
    {text:"対応関係：",options:{bold:true,color:C.accent}},
    {text:"MVP0–1 ≒ Phase1(MVP) ／ MVP2–3 ≒ Phase1〜1.5。MVP1が本WFの対象範囲。",options:{color:C.ink}},
  ],{x:0.6,y:6.45,w:12.1,h:0.4,fontFace:F,fontSize:11});
  footer(s);
})();

/* ============ 9. MVP分割：マイルストーン表 ============ */
(() => {
  const s = p.addSlide(); header(s, "MVP BREAKDOWN", "MVP分割：マイルストーン");
  const hdr = (t)=>({text:t,options:{fill:{color:C.ink},color:C.white,bold:true,align:"center",valign:"middle",fontFace:F,fontSize:11}});
  const cell=(t,o={})=>({text:t,options:Object.assign({fontFace:F,fontSize:9.5,color:C.ink,valign:"middle",align:"left"},o)});
  const rows = [
    [hdr("MVP"), hdr("ゴール"), hdr("主な内容"), hdr("受け入れ基準"), hdr("時期")],
    [
      cell("MVP0\n基盤・認証",{bold:true,color:C.accent,align:"center",fill:{color:C.soft}}),
      cell("登録→ログインして\n毎日アクセスできる"),
      cell("スプラッシュ/タイトル、アカウント作成、ログイン、OAuth、PWリセット、マイページ、許諾/アクセスロック、管理者ログイン"),
      cell("新規登録→ログイン→\n再ログインが通る"),
      cell("〜2025/6上",{align:"center"}),
    ],
    [
      cell("MVP1 ★\nコアサイクル",{bold:true,color:C.white,align:"center",fill:{color:C.accent}}),
      cell("ミッション→ポイント→\n交換が一気通貫で動く",{fill:{color:C.soft}}),
      cell("ホーム(フィード/残高/導線)、ミッション(4種・進捗・受取演出)、ポイント(残高/履歴)、交換(一覧/申請/履歴)、広告バナー、管理(マスタ/付与)",{fill:{color:C.soft}}),
      cell("ミッション達成→加算→\n交換申請→履歴反映",{fill:{color:C.soft}}),
      cell("2025/6–7\n（本WF）",{align:"center",bold:true,color:C.accent,fill:{color:C.soft}}),
    ],
    [
      cell("MVP2\nコミュニティ",{bold:true,color:C.purple,align:"center",fill:{color:C.softp}}),
      cell("ギルド型コミュニティで\nBtoB理由とエンゲージ創出"),
      cell("フォーラム/トピック(作成/投稿/返信/編集削除)、リアクション、ポイント賭け質問→回答報酬、お知らせ記事、通知/メールボックス"),
      cell("トピック作成→返信→\n賭け質問→報酬付与"),
      cell("2025/7–8",{align:"center"}),
    ],
    [
      cell("MVP3\n運用・分析",{bold:true,color:C.gold,align:"center",fill:{color:C.softg}}),
      cell("安定運用とKPI可視化\n継続最小施策"),
      cell("ユーザー行動分析、管理ダッシュボード強化(統計/監視/権限/BAN/凍結/SU)、サポート/ヘルプ/FAQ、ログボ最小、Push運用"),
      cell("管理側で主要KPIが見える\nBAN/凍結が機能"),
      cell("2025/8–",{align:"center"}),
    ],
  ];
  s.addTable(rows, {
    x:0.55, y:1.6, w:12.25, colW:[1.55,2.35,4.6,2.45,1.3],
    rowH:[0.4,1.0,1.15,1.0,1.0],
    border:{pt:0.75,color:C.line}, align:"left", valign:"middle", autoPage:false,
  });
  footer(s);
})();

/* ============ 10. MVP1 コアフロー（WF対象） ============ */
(() => {
  const s = p.addSlide(); header(s, "MVP1 · CORE FLOW", "MVP1 コアフロー（ワイヤーフレーム対象）");
  s.addText("操作可能HTMLモックで、価値の核を一気通貫に確認できる状態を制作済み（wireframes/core-flow.html）。", {
    x:0.6, y:1.5, w:12.3, h:0.4, fontFace:F, fontSize:12.5, color:C.sub });
  const steps = [
    ["1","ログイン","メール / OAuth\n(Google·Apple·LINE)",C.ink],
    ["2","ホーム","残高・ニュース\nミッション導線",C.accent],
    ["3","ミッション","4種タブ・進捗\n達成→受取演出",C.purple],
    ["4","ポイント交換","アイテム選択→\n申請→履歴反映",C.gold],
  ];
  const pw=2.55, ph=3.4, gap=0.55, x0=0.85, y0=2.25;
  steps.forEach((st,i)=>{
    const x=x0+i*(pw+gap);
    // phone frame
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y:y0,w:pw,h:ph,fill:{color:C.navy},rectRadius:0.18,line:{type:"none"},shadow:shadow()});
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:x+0.13,y:y0+0.13,w:pw-0.26,h:ph-0.26,fill:{color:C.white},rectRadius:0.12,line:{type:"none"}});
    // top color band + title
    s.addShape(p.shapes.RECTANGLE,{x:x+0.13,y:y0+0.13,w:pw-0.26,h:0.6,fill:{color:st[3]},line:{type:"none"}});
    s.addText(st[1],{x:x+0.13,y:y0+0.13,w:pw-0.26,h:0.6,fontFace:F,fontSize:12,color:C.white,bold:true,align:"center",valign:"middle"});
    // skeleton lines
    for(let k=0;k<4;k++){
      s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:x+0.35,y:y0+0.95+k*0.55,w:pw-0.7,h:0.34,fill:{color:C.bg},rectRadius:0.05,line:{type:"none"}});
    }
    // step number badge
    s.addShape(p.shapes.OVAL,{x:x+pw/2-0.28,y:y0-0.28,w:0.56,h:0.56,fill:{color:st[3]},line:{color:C.white,width:2.5},shadow:shadow()});
    s.addText(st[0],{x:x+pw/2-0.28,y:y0-0.28,w:0.56,h:0.56,fontFace:F,fontSize:15,color:C.white,bold:true,align:"center",valign:"middle"});
    // caption
    s.addText(st[2],{x:x-0.1,y:y0+ph+0.12,w:pw+0.2,h:0.7,fontFace:F,fontSize:10,color:C.sub,align:"center"});
    if(i<3) s.addText("➜",{x:x+pw,y:y0,w:gap,h:ph,fontFace:F,fontSize:22,color:C.muted,align:"center",valign:"middle"});
  });
  footer(s);
})();

/* ============ 11. 技術スタック提案 ============ */
(() => {
  const s = p.addSlide(); header(s, "TECH STACK", "技術スタック提案");
  s.addText("資料の要件「工数削減・モバイル最適化・後のWeb対応」に最適化。初期はマネージド中心でスピード優先、規模拡大で段階的に内製化。", {
    x:0.6, y:1.5, w:12.3, h:0.4, fontFace:F, fontSize:12, color:C.sub });
  const rows = [
    [{text:"領域",options:{fill:{color:C.ink},color:C.white,bold:true,fontFace:F,fontSize:11,valign:"middle"}},
     {text:"推奨",options:{fill:{color:C.ink},color:C.white,bold:true,fontFace:F,fontSize:11,valign:"middle"}},
     {text:"理由",options:{fill:{color:C.ink},color:C.white,bold:true,fontFace:F,fontSize:11,valign:"middle"}}],
    ["モバイル","React Native + Expo (TypeScript)","iOS/Android同時開発・Push対応・後のWeb展開(RN Web/Next)が容易"],
    ["認証","Supabase Auth（OAuth）","Google/Apple/LINE/Facebook を最小工数で。要件のOAuthに合致"],
    ["バックエンド","Supabase (Postgres/Realtime/Storage)","初期は工数最小。規模拡大時に NestJS+PostgreSQL へ段階移行"],
    ["リアルタイム","Supabase Realtime","フォーラム/通知/(将来)チャットを追加実装少なく実現"],
    ["通知","Expo Notifications (FCM/APNs)","ローカル/サーバーPush両対応の要件を満たす"],
    ["管理画面","Next.js 管理コンソール（初期 Retool 可）","運用工数削減。ミッション/交換マスタ・KPIをノーコード寄りで"],
    ["インフラ","Supabase + Vercel + EAS","フルマネージドで運用人員を最小化"],
  ].map((r,ri)=> ri===0 ? r : r.map((c,ci)=>({text:c,options:{fontFace:F,fontSize:10,valign:"middle",bold:ci===0,color:ci===0?C.accent:C.ink, fill:{color: ri%2?C.white:C.bg}}})));
  s.addTable(rows, { x:0.55, y:2.05, w:12.25, colW:[2.0,4.0,6.25], rowH:0.6, border:{pt:0.75,color:C.line}, valign:"middle", autoPage:false });
  s.addText("※ あくまで提案。チームの既存スキルセットに応じて Flutter / Firebase / 独自API 等も選択肢。本スライドで方針を合意したい。", {
    x:0.6, y:6.85, w:12.3, h:0.3, fontFace:F, fontSize:9.5, color:C.muted, italic:true });
  footer(s);
})();

/* ============ ADD-1. 追加機能提案 サマリ ============ */
(() => {
  const s = p.addSlide(); header(s, "ADD-ON PROPOSAL", "追加機能提案：4つの強化ポイント");
  s.addText("コアフローに加え、収益・信頼・継続・差別化を底上げする4機能を提案。いずれも仕様書とワイヤーフレームに反映済み。", {
    x:0.6, y:1.55, w:12.3, h:0.4, fontFace:F, fontSize:12.5, color:C.sub });
  const feats = [
    ["🎁","オファーウォール / 動画広告","提携ゲームが少ないと在庫・収益が確保できない","外部ネットワークで常時ミッション在庫＋収益の第2の柱","MVP1.5–2",C.accent,C.soft],
    ["🛡️","達成のサーバー検証 (postback)","自己申告はなりすまし可・BtoB提案が成立しない","S2S postbackで検証後に付与し不正を遮断","MVP1 土台",C.gold,C.softg],
    ["🎯","スマートナッジ（あと◯P）","交換の手前でユーザーが離脱しやすい","「あと◯P」＋おすすめミッションで背中を押す","MVP1",C.purple,C.softp],
    ["💬","コミュニティ / ギルド＋通報","差別化の核だが安全装置なしには開けない","ギルド・賭け質問＋通報/モデレーションを両立","MVP2",C.ink,C.bg],
  ];
  feats.forEach((d,i)=>{
    const col=i%2, row=Math.floor(i/2);
    const x=0.6+col*6.25, y=2.15+row*2.25;
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y,w:5.85,h:2.05,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
    s.addShape(p.shapes.OVAL,{x:x+0.32,y:y+0.3,w:0.62,h:0.62,fill:{color:d[6]},line:{type:"none"}});
    s.addText(d[0],{x:x+0.32,y:y+0.3,w:0.62,h:0.62,fontFace:F,fontSize:20,align:"center",valign:"middle"});
    s.addText(d[1],{x:x+1.1,y:y+0.32,w:3.35,h:0.6,fontFace:F,fontSize:13,color:C.ink,bold:true,valign:"middle"});
    chip(s,x+4.5,y+0.4,1.15,d[4],d[6],d[5]);
    s.addText([{text:"課題　",options:{bold:true,color:"C0392B"}},{text:d[2],options:{color:C.sub}}],{x:x+0.35,y:y+1.08,w:5.15,h:0.42,fontFace:F,fontSize:10.5,valign:"top"});
    s.addText([{text:"解決　",options:{bold:true,color:C.ok}},{text:d[3],options:{color:C.ink}}],{x:x+0.35,y:y+1.52,w:5.15,h:0.42,fontFace:F,fontSize:10.5,valign:"top"});
  });
  footer(s);
})();

/* ============ ADD-2. オファーウォール ============ */
(() => {
  const s = p.addSlide(); header(s, "ADD-ON ①", "オファーウォール / 動画リワード広告");
  s.addText("提携ゲームが少なくても「常にミッション在庫がある」状態を作り、アフィリエイトに次ぐ収益の柱を立てる。", {
    x:0.6, y:1.5, w:12.3, h:0.4, fontFace:F, fontSize:12, color:C.sub });
  // flow
  const flow=["オファー表示","クリック / 開始","条件達成","ネットワークから postback","ポイント付与（検証後）"];
  const fw=2.28, gap=0.2, x0=0.6, y0=2.15;
  flow.forEach((t,i)=>{
    const x=x0+i*(fw+gap);
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y:y0,w:fw,h:0.95,fill:{color:i===4?C.accent:C.white},rectRadius:0.08,line:{color:i===4?C.accent:C.line,width:1},shadow:shadow()});
    s.addText(String(i+1),{x:x+0.12,y:y0+0.1,w:0.5,h:0.4,fontFace:F,fontSize:13,color:i===4?"CAD2FF":C.accent,bold:true});
    s.addText(t,{x:x+0.15,y:y0+0.34,w:fw-0.3,h:0.55,fontFace:F,fontSize:10,color:i===4?C.white:C.ink,bold:true,valign:"middle"});
    if(i<4) s.addText("›",{x:x+fw,y:y0,w:gap,h:0.95,fontFace:F,fontSize:18,color:C.muted,align:"center",valign:"middle"});
  });
  // key points (left) + revenue (right)
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.6,y:3.5,w:8.0,h:3.1,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
  s.addText("設計のポイント",{x:0.95,y:3.7,w:7,h:0.4,fontFace:F,fontSize:13,color:C.accent,bold:true});
  s.addText([
    {text:"複数ネットワークをアダプタ層で抽象化（メディエーション）— Tapjoy / AppLovin / ironSource 等",options:{bullet:{indent:12},breakLine:true}},
    {text:"動画リワード広告（30秒視聴で即時付与）と高単価CPAオファーを併設",options:{bullet:{indent:12},breakLine:true}},
    {text:"報酬確定は広告ネットワークからの postback で（達成検証と同じ土台を共用）",options:{bullet:{indent:12},breakLine:true}},
    {text:"iOS ATT / IDFA 許諾・年齢・地域による出し分け、在庫枯渇時のフォールバック",options:{bullet:{indent:12},breakLine:true}},
    {text:"重複postbackの排除（idempotency）で二重付与を防止",options:{bullet:{indent:12}}},
  ],{x:1.0,y:4.15,w:7.4,h:2.3,fontFace:F,fontSize:11,color:C.ink,paraSpaceAfter:7,valign:"top"});
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:8.85,y:3.5,w:3.85,h:3.1,fill:{color:C.ink},rectRadius:0.08,line:{type:"none"}});
  s.addText("収益インパクト",{x:9.15,y:3.72,w:3.3,h:0.4,fontFace:F,fontSize:12,color:C.gold,bold:true});
  s.addText("常時ミッション在庫",{x:9.15,y:4.2,w:3.3,h:0.4,fontFace:F,fontSize:13,color:C.white,bold:true});
  s.addText("コールドスタート解決",{x:9.15,y:4.55,w:3.3,h:0.35,fontFace:F,fontSize:10,color:"AEB3D8"});
  s.addText("＋ 第2の収益源",{x:9.15,y:5.05,w:3.3,h:0.4,fontFace:F,fontSize:13,color:C.white,bold:true});
  s.addText("KPI：eCPM / 完了率 / ARPDAU",{x:9.15,y:5.4,w:3.3,h:0.35,fontFace:F,fontSize:10,color:"AEB3D8"});
  chip(s,9.15,6.0,1.9,"配置：MVP1.5–2",C.softg,C.gold);
  footer(s);
})();

/* ============ ADD-3. postback検証 ============ */
(() => {
  const s = p.addSlide(); header(s, "ADD-ON ②", "達成のサーバー検証（postback）");
  s.addText("自己申告ではなくサーバーで達成を検証してから付与する。これが無いとBtoB（広告掲載）の信頼が成立しない＝MVP1の土台。", {
    x:0.6, y:1.5, w:12.5, h:0.4, fontFace:F, fontSize:12, color:C.sub });
  // state machine
  const st=[["未達成",C.muted,C.bg],["検証中 (pending)",C.gold,C.softg],["確定 (confirmed)",C.ok,"E7F3EC"],["却下 (rejected)","C0392B","FDECEA"]];
  const sw=2.7, gap=0.45, x0=0.85, y0=2.15;
  st.forEach((d,i)=>{
    const x=x0+i*(sw+gap);
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y:y0,w:sw,h:0.9,fill:{color:d[2]},rectRadius:0.45,line:{color:d[1],width:1.25}});
    s.addText(d[0],{x,y:y0,w:sw,h:0.9,fontFace:F,fontSize:12,color:d[1],bold:true,align:"center",valign:"middle"});
    if(i<2) s.addText("→",{x:x+sw,y:y0,w:gap,h:0.9,fontFace:F,fontSize:18,color:C.muted,align:"center",valign:"middle"});
  });
  s.addText("↑ postback受信＋署名/IP検証",{x:0.85+2*(sw+gap),y:y0-0.45,w:sw,h:0.4,fontFace:F,fontSize:9,color:C.ok,align:"center"});
  s.addText("不正検知でreject／chargebackでreversed",{x:0.85,y:y0+1.0,w:11.5,h:0.35,fontFace:F,fontSize:9.5,color:C.muted,align:"center"});
  // two cards
  const cards=[
    ["検証の仕組み",C.accent,[ "署名検証（HMAC共有シークレット）＋ IP許可リスト","transaction_id によるべき等性で重複postbackを排除","付与は point_ledger に台帳記録（二重支払い防止）","管理画面で監査・手動承認/却下" ]],
    ["不正検知（段階拡張）",C.purple,[ "デバイスフィンガープリント／多重アカウント検知","達成速度の異常・エミュレータ/VPN兆候","しきい値超過で保留→マーキング（運用基盤と接続）","高度ルールは MVP2–3 で拡張" ]],
  ];
  cards.forEach((c,ci)=>{
    const x=0.6+ci*6.25;
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y:3.85,w:5.85,h:2.45,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
    s.addShape(p.shapes.RECTANGLE,{x,y:3.85,w:5.85,h:0.06,fill:{color:c[1]},line:{type:"none"}});
    s.addText(c[0],{x:x+0.3,y:4.0,w:5.2,h:0.4,fontFace:F,fontSize:13,color:c[1],bold:true});
    s.addText(c[2].map(t=>({text:t,options:{bullet:{indent:12},breakLine:true,color:C.ink}})),{x:x+0.33,y:4.45,w:5.25,h:1.75,fontFace:F,fontSize:10.3,paraSpaceAfter:6,valign:"top"});
  });
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.6,y:6.5,w:12.1,h:0.0,line:{type:"none"},fill:{color:C.white}});
  s.addText([{text:"✓ ワイヤーフレームで実装済み：",options:{bold:true,color:C.ok}},{text:"提携オファーの達成が「検証中 → 確定」で反映される様子を確認できます。",options:{color:C.ink}}],{x:0.6,y:6.48,w:12.1,h:0.4,fontFace:F,fontSize:10.5});
  footer(s);
})();

/* ============ ADD-4. スマートナッジ ============ */
(() => {
  const s = p.addSlide(); header(s, "ADD-ON ③", "スマートナッジ（あと◯P）");
  s.addText("ゴール勾配効果・損失回避を突いて、交換手前の離脱を防ぎ交換率と回遊を高める軽量施策。", {
    x:0.6, y:1.5, w:12.3, h:0.4, fontFace:F, fontSize:12, color:C.sub });
  // mock nudge bar
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.6,y:2.1,w:8.0,h:1.05,fill:{color:C.softg},rectRadius:0.1,line:{color:"E7D6A6",width:1}});
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.85,y:2.32,w:0.62,h:0.62,fill:{color:C.white},rectRadius:0.12,line:{color:"ECDCAE",width:1}});
  s.addText("🎯",{x:0.85,y:2.32,w:0.62,h:0.62,fontFace:F,fontSize:20,align:"center",valign:"middle"});
  s.addText([{text:"あと ",options:{color:"7A5B16"}},{text:"250P",options:{bold:true,color:C.gold}},{text:" で「ガチャチケット ×3」と交換できます",options:{color:"7A5B16",bold:true}}],{x:1.65,y:2.32,w:6.0,h:0.4,fontFace:F,fontSize:12.5,valign:"middle"});
  s.addText("おすすめ：デイリー5日達成（＋200P）でぐっと近づく",{x:1.65,y:2.72,w:6.3,h:0.35,fontFace:F,fontSize:9.5,color:"9A7E3A"});
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:7.45,y:2.45,w:1.0,h:0.38,fill:{color:C.gold},rectRadius:0.08,line:{type:"none"}});
  s.addText("貯める ▸",{x:7.45,y:2.45,w:1.0,h:0.38,fontFace:F,fontSize:9.5,color:C.white,bold:true,align:"center",valign:"middle"});
  s.addText("実際のUIイメージ（WFより）",{x:0.6,y:3.2,w:8,h:0.3,fontFace:F,fontSize:9,color:C.muted,italic:true});
  // logic + places
  s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:8.85,y:2.1,w:3.85,h:4.0,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
  s.addText("ロジック",{x:9.15,y:2.3,w:3.3,h:0.4,fontFace:F,fontSize:12,color:C.purple,bold:true});
  s.addText("残高 × 交換アイテム → 最も近い対象を選定 → 不足分◯Pを埋めるミッションを提案",{x:9.15,y:2.7,w:3.35,h:1.1,fontFace:F,fontSize:10.5,color:C.ink});
  s.addText("表示場所",{x:9.15,y:3.95,w:3.3,h:0.4,fontFace:F,fontSize:12,color:C.purple,bold:true});
  s.addText([
    {text:"ホーム上部バナー",options:{bullet:{indent:10},breakLine:true}},
    {text:"交換カード「あと◯P」",options:{bullet:{indent:10},breakLine:true}},
    {text:"達成演出後のサジェスト",options:{bullet:{indent:10},breakLine:true}},
    {text:"行動喚起Push（1.5〜2）",options:{bullet:{indent:10}}},
  ],{x:9.2,y:4.35,w:3.3,h:1.7,fontFace:F,fontSize:10.3,color:C.ink,paraSpaceAfter:5,valign:"top"});
  // bottom left points
  s.addText([
    {text:"行動経済学的根拠：",options:{bold:true,color:C.ink}},
    {text:"ゴール勾配（あと少しでやる気が上がる）＋ 損失回避（あと少しを逃したくない）。",options:{color:C.sub}},
  ],{x:0.6,y:3.7,w:8.0,h:0.5,fontFace:F,fontSize:11,valign:"top"});
  s.addText([
    {text:"出し過ぎ防止：",options:{bold:true,color:C.ink}},
    {text:"表示頻度のクールダウン／ナッジ種類のローテーション／A/B枠を用意。実装は軽量でMVP1に収まる。",options:{color:C.sub}},
  ],{x:0.6,y:4.35,w:8.0,h:0.6,fontFace:F,fontSize:11,valign:"top"});
  chip(s,0.6,5.2,1.55,"配置：MVP1",C.softp,C.purple);
  s.addText("✓ ワイヤーフレームで実装済み（ホーム＆交換カードに表示）",{x:2.4,y:5.2,w:6.2,h:0.35,fontFace:F,fontSize:10.5,color:C.ok,bold:true,valign:"middle"});
  footer(s);
})();

/* ============ ADD-5. コミュニティ / ギルド ============ */
(() => {
  const s = p.addSlide(); header(s, "ADD-ON ④", "コミュニティ / ギルド＋通報");
  s.addText("RPGギルド型の相互互助で差別化とBtoB提携理由を両立。ただし安全装置（通報・モデレーション）が前提。", {
    x:0.6, y:1.5, w:12.5, h:0.4, fontFace:F, fontSize:12, color:C.sub });
  // structure
  const lv=[["フォーラム（ギルド）","公開/ゲーム別の箱",C.accent],["トピック（依頼/質問）","賭け質問も可",C.purple],["投稿 / 返信＋リアクション","ベストアンサー報酬",C.gold]];
  lv.forEach((d,i)=>{
    const x=0.6+i*4.07;
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y:2.15,w:3.8,h:1.2,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
    s.addShape(p.shapes.RECTANGLE,{x,y:2.15,w:0.09,h:1.2,fill:{color:d[2]},line:{type:"none"}});
    s.addText(d[0],{x:x+0.3,y:2.36,w:3.3,h:0.45,fontFace:F,fontSize:12.5,color:C.ink,bold:true});
    s.addText(d[1],{x:x+0.3,y:2.8,w:3.3,h:0.4,fontFace:F,fontSize:10,color:C.sub});
    if(i<2) s.addText("›",{x:x+3.8,y:2.15,w:0.27,h:1.2,fontFace:F,fontSize:18,color:C.muted,align:"center",valign:"middle"});
  });
  // two cards: engagement vs safety
  const cards=[
    ["エンゲージ／差別化",C.accent,[ "ポイント賭け質問 → ベストアンサーに報酬","回答評価（投票）で良質回答を可視化","ギルド単位の交流・期間限定のゲーム別開催（BtoB理由）","リアルタイムチャット/DMは段階実装" ]],
    ["安全装置（前提）",C.ok,[ "投稿/ユーザーの通報フロー＋理由選択","NGワード自動フィルタ・スパム検知","モデレーション管理：削除/警告/凍結/BAN","権限：一般 / モデレーター / 管理者" ]],
  ];
  cards.forEach((c,ci)=>{
    const x=0.6+ci*6.25;
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x,y:3.6,w:5.85,h:2.5,fill:{color:C.white},rectRadius:0.08,line:{color:C.line,width:1},shadow:shadow()});
    s.addShape(p.shapes.RECTANGLE,{x,y:3.6,w:5.85,h:0.06,fill:{color:c[1]},line:{type:"none"}});
    s.addText(c[0],{x:x+0.3,y:3.75,w:5.2,h:0.4,fontFace:F,fontSize:13,color:c[1],bold:true});
    s.addText(c[2].map(t=>({text:t,options:{bullet:{indent:12},breakLine:true,color:C.ink}})),{x:x+0.33,y:4.2,w:5.25,h:1.8,fontFace:F,fontSize:10.3,paraSpaceAfter:6,valign:"top"});
  });
  s.addText([{text:"✓ ワイヤーフレームで実装済み：",options:{bold:true,color:C.ok}},{text:"ギルド→トピック→返信、賭け質問のベストアンサー進呈、通報モーダルまで操作できます。",options:{color:C.ink}}],{x:0.6,y:6.45,w:12.1,h:0.4,fontFace:F,fontSize:10.5});
  footer(s);
})();

/* ============ 12. リスク・留意点 ============ */
(() => {
  const s = p.addSlide(); header(s, "RISKS", "想定リスクと留意点");
  const risks = [
    ["アイテム納品の運用", "MVP1は「コード式」中心、CSV式併用。API式は Phase3。納品〜付与のリードタイムを前提に設計", C.accent],
    ["報酬精算フロー", "翌々月末精算（資料準拠）。管理側で月次集計・請求情報出力を MVP3 で整備", C.purple],
    ["ポイント不正対策", "本格セキュリティは Phase2 だが、ポイント二重取得・改ざん対策の最小限は MVP1 から設計", C.gold],
    ["法務・会計確認", "ポイントに換金性が出る場合は前払式支払手段等の該当性を要確認。早めに専門家レビュー", "C0392B"],
    ["Web3/NFT(Phase4)", "規制・税務の影響大。スコープ外だが、ポイント/アイテムのデータ設計は将来移行を阻害しない形に", "5A6072"],
  ];
  risks.forEach((d,i)=>{
    const y=1.7+i*0.98;
    s.addShape(p.shapes.ROUNDED_RECTANGLE,{x:0.6,y,w:12.1,h:0.82,fill:{color:C.white},rectRadius:0.06,line:{color:C.line,width:1},shadow:shadow()});
    s.addShape(p.shapes.RECTANGLE,{x:0.6,y,w:0.1,h:0.82,fill:{color:d[2]},line:{type:"none"}});
    s.addText(d[0],{x:1.0,y,w:3.3,h:0.82,fontFace:F,fontSize:12.5,color:C.ink,bold:true,valign:"middle"});
    s.addText(d[1],{x:4.4,y:y+0.05,w:8.1,h:0.72,fontFace:F,fontSize:10.8,color:C.sub,valign:"middle"});
  });
  footer(s);
})();

/* ============ 13. 次のステップ（クロージング） ============ */
(() => {
  const s = p.addSlide(); s.background = { color: C.navy }; page++;
  s.addShape(p.shapes.OVAL, { x:-2.2, y:3.5, w:7, h:7, fill:{color:C.accent, transparency:80}, line:{type:"none"} });
  s.addText("NEXT ACTIONS", { x:0.85, y:0.85, w:11, h:0.4, fontFace:F, fontSize:12, color:C.gold, bold:true, charSpacing:2 });
  s.addText("次のステップ", { x:0.83, y:1.2, w:11, h:0.8, fontFace:F, fontSize:30, color:C.white, bold:true });
  const steps = [
    ["01","本提案・MVP分割の合意","特に MVP1 のスコープ確定（コアフロー）"],
    ["02","技術スタックの決定","RN+Expo / Supabase 方針の可否を判断"],
    ["03","MVP1 詳細要件・画面設計","WFを土台に画面遷移とデータモデルを確定"],
    ["04","見積り・体制確定 → 開発着手","スプリント計画と受け入れ基準の最終化"],
  ];
  steps.forEach((d,i)=>{
    const y=2.45+i*1.0;
    s.addText(d[0],{x:0.85,y,w:1.0,h:0.85,fontFace:F,fontSize:30,color:C.accent,bold:true,valign:"middle"});
    s.addText(d[1],{x:2.0,y,w:6.0,h:0.85,fontFace:F,fontSize:15,color:C.white,bold:true,valign:"middle"});
    s.addText(d[2],{x:7.6,y,w:5.0,h:0.85,fontFace:F,fontSize:11,color:"AEB3D8",valign:"middle"});
    if(i<3) s.addShape(p.shapes.LINE,{x:0.9,y:y+0.9,w:11.6,h:0,line:{color:"2E3350",width:1}});
  });
  s.addText("操作可能ワイヤーフレーム：wireframes/core-flow.html ／ 本資料：docs/", {
    x:0.85, y:6.85, w:11.5, h:0.35, fontFace:F, fontSize:10, color:"8A90B0" });
})();

p.writeFile({ fileName: "docs/MasterGame_仕様提案_MVP分割.pptx" }).then(f=>console.log("WROTE", f));
