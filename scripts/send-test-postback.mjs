import { createHmac, randomUUID } from 'node:crypto';

const required = ['POSTBACK_URL', 'POSTBACK_SECRET', 'CLICK_ID'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  console.error('Required: POSTBACK_URL, POSTBACK_SECRET, CLICK_ID');
  process.exit(1);
}

const partner = process.env.POSTBACK_PARTNER ?? 'test-partner';
const transactionId = process.env.TRANSACTION_ID ?? `manual-${randomUUID()}`;
const clickId = process.env.CLICK_ID;
const secret = process.env.POSTBACK_SECRET;
const signature = createHmac('sha256', secret)
  .update(`${partner}:${transactionId}:${clickId}`)
  .digest('hex');

const response = await fetch(process.env.POSTBACK_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    partner,
    transaction_id: transactionId,
    click_id: clickId,
    signature,
  }),
});

const body = await response.text();
console.log(`HTTP ${response.status}`);
console.log(body);

if (!response.ok) process.exit(1);
