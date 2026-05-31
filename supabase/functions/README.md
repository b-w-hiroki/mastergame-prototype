# Supabase Edge Functions

## postback — 達成のサーバー検証受信口

広告主・広告ネットワークからの S2S postback を受け、**HMAC署名検証** → **`confirm_postback` RPC**（冪等・attribution・付与）を呼びます。

### デプロイ

```bash
# シークレット設定（パートナーslug ごと、無ければ共通 POSTBACK_SECRET）
supabase secrets set POSTBACK_SECRET_APPLOVIN=xxxxxxxx
supabase secrets set POSTBACK_SECRET_TAPJOY=yyyyyyyy

# デプロイ（SUPABASE_URL / SERVICE_ROLE_KEY は自動注入）
supabase functions deploy postback --no-verify-jwt
```

`--no-verify-jwt`：postback は外部（広告網）から来るため JWT 認証は無効化し、**HMAC署名で検証**します。

### パートナー側に伝える postback URL

```
https://<project-ref>.functions.supabase.co/postback
  ?partner=applovin&transaction_id={TXN}&click_id={CLICK_ID}&sig={HMAC}
```

- `sig` = HMAC-SHA256( `${partner}:${transaction_id}:${click_id}`, secret ) の16進
- POST(JSON) でも可。

### 動作確認（ローカル / デプロイ後）

```bash
# 署名を作る（例）
node -e "const c=require('crypto');console.log(c.createHmac('sha256','SECRET').update('applovin:tx_test_1:click_abc').digest('hex'))"

curl -X POST "https://<ref>.functions.supabase.co/postback" \
  -H 'content-type: application/json' \
  -d '{"partner":"applovin","transaction_id":"tx_test_1","click_id":"click_abc","sig":"<上のhash>"}'
# → {"status":"accepted",...} / 2回目は {"status":"duplicate",...}
```

### 関連
- RPC：`supabase/migrations/0011_postback_rpc.sql`（`track_click` / `confirm_postback`）
- 仕様：`docs/specs/mission-verification-postback.md`
