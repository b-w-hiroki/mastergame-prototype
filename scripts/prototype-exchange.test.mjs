import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html = readFileSync(new URL('../wireframes/core-flow.html', import.meta.url), 'utf8');
function setup() {
  const elements = new Map();
  const document = {getElementById(id) { if (!elements.has(id)) elements.set(id, {innerHTML:'',textContent:'',classList:{add(){},remove(){}}}); return elements.get(id); }, querySelector(){return {textContent:''};}};
  const c = vm.createContext({document, setTimeout(){}, syncBalance(){},renderItems(){},pseg(){}});
  const code = html.slice(html.indexOf('let pendingExchangeItem = null;'),html.indexOf('function renderHist(){'));
  vm.runInContext('var ITEMS=[{nm:"test",gm:"demo",cost:60}]; var balance=100; var history=[];var exchangeRequests=[];var pendingPt=0,pendingHist=null;'+code,c);
  return c;
}
test('confirmed demo exchange debits exactly once',()=>{const c=setup();vm.runInContext('openItem(0);exchange(0);exchange(0)',c);assert.equal(c.balance,40);assert.equal(c.exchangeRequests.length,1);});
test('cancelled sheet cannot debit',()=>{const c=setup();vm.runInContext('openItem(0);closeSheet();exchange(0)',c);assert.equal(c.balance,100);assert.equal(c.history.length,0);});
test('stale insufficient balance cannot go negative',()=>{const c=setup();vm.runInContext('openItem(0);balance=20;exchange(0)',c);assert.equal(c.balance,20);assert.equal(c.history.length,0);});
test('unconfirmed and invalid targets cannot debit',()=>{const c=setup();vm.runInContext('exchange(0);openItem(-1);exchange(-1);openItem(0);exchange(1)',c);assert.equal(c.balance,100);assert.equal(c.history.length,0);});
test('demo limitation appears at entry, confirmation and completion',()=>{assert.match(html,/操作デモ・架空のポイント/);assert.match(html,/デモ体験です。実際の報酬の配送・換金は行いません/);assert.match(html,/textContent='実際の報酬は届きません'/);});
