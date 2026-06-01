# カスタムドメインの設定（GitHub Pages）

現在の公開URL：`https://b-w-hiroki.github.io/mastergame-prototype/`
独自ドメイン（例：`prototype.mastergame.jp`）で公開する手順です。

> ⚠️ 独自ドメインの設定には **あなたが所有するドメイン** が必要です（DNS設定が必要なため、こちらでは実施できません）。
> 下記の手順とテンプレートを用意しています。

## 手順

### 1. リポジトリに `CNAME` ファイルを追加
リポジトリ直下に、ドメイン名だけを書いた `CNAME` ファイルを置きます。

```
prototype.mastergame.jp
```

（このリポジトリには `CNAME.example` を同梱しています。リネームして使ってください。）

### 2. DNS を設定（ドメイン管理サービス側）

**サブドメイン（推奨）の場合** — CNAME レコード：

| Type | Name | Value |
|---|---|---|
| CNAME | `prototype` | `b-w-hiroki.github.io` |

**Apex（`example.com` 直）の場合** — A / AAAA レコード：

```
A     185.199.108.153
A     185.199.109.153
A     185.199.110.153
A     185.199.111.153
AAAA  2606:50c0:8000::153
AAAA  2606:50c0:8001::153
AAAA  2606:50c0:8002::153
AAAA  2606:50c0:8003::153
```

### 3. GitHub 側で設定
リポジトリ **Settings → Pages → Custom domain** にドメインを入力し、
DNS 伝播後に **Enforce HTTPS** をオンにします（証明書は自動発行）。

CLI でも設定できます：

```bash
gh api -X PUT repos/b-w-hiroki/mastergame-prototype/pages \
  -f "cname=prototype.mastergame.jp" -F "https_enforced=true"
```

### 4. 公開URLとメタ情報の更新
独自ドメインに切り替えたら、以下の絶対URLも置換します：
- `index.html` / `wireframes/landing.html` の `og:*` / `canonical`
- `robots.txt`（社内向けのため `Disallow: /` の方針は維持）

> 本ハブは社内・関係者向けのため検索エンジンには `noindex`／`Disallow` で非掲載にしています（`sitemap.xml` は廃止）。

---

ドメインをお持ちでない場合は、現状の `*.github.io` URL のままで問題なく確認・共有できます。
