import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COUNTER, normalizeCounter, calculateCounter, dayNumber } from "../docs/counter.mjs";
import { COUNTER_KEY, loadCounter, normalizeBackup } from "../docs/data.mjs";
import { normalizeRoutine, buildTimeline, totalSeconds } from "../docs/core.mjs";
import { readFileSync } from "node:fs";

const routine = normalizeRoutine(JSON.parse(readFileSync(new URL('../docs/routine.json', import.meta.url))));
const legacy = { version: 2, startDate: '2026-09-13', servingPrice: 63, servingsPerPeriod: 2.8, periodDays: 7, currency: 'kr', oops: [{ id: 'a', date: '2026-09-27', servings: 3.2, note: 'Machine' }] };
const oldest = { version: 1, startDate: legacy.startDate, packetPrice: 63, packetsPerPeriod: 2.8, periodDays: 7, oops: [{ id: 'a', date: '2026-09-27', packets: 3.2, note: 'Machine' }] };
const storage = (entries) => { const data = new Map(Object.entries(entries)); return { data, getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }; };

test('both historical schemas preserve savings and become fixed DKK', () => {
  for (const input of [legacy, oldest]) {
    const counter = normalizeCounter(input);
    assert.ok(Math.abs(counter.amountPerPeriod - 176.4) < 1e-10);
    assert.ok(Math.abs(counter.oops[0].amount - 201.6) < 1e-10);
    assert.equal(counter.oops[0].reason, 'Machine');
    assert.equal(counter.oops[0].date, '2026-09-27');
    assert.equal(calculateCounter(counter, '2026-10-27').saved, 907.2);
    assert.equal(calculateCounter(counter, '2026-10-27').days, 44);
    assert.deepEqual(normalizeCounter(JSON.parse(JSON.stringify(counter))), counter);
    assert.equal(normalizeCounter({...counter, amountPerPeriod: 200}).oops[0].amount, counter.oops[0].amount);
  }
});

test('precision, zero prices, missing notes, duplicate IDs and future entries survive migration', () => {
  const counter = normalizeCounter({...legacy, servingPrice: 0.03, oops: [{date:'2026-09-13', servings:0.5}, {date:'2027-01-01', servings:1, id:'oops-1', note:'  '}]});
  assert.equal(counter.oops[0].amount, 0.015);
  assert.equal(counter.oops[0].reason, 'No reason provided');
  assert.notEqual(counter.oops[0].id, counter.oops[1].id);
  assert.deepEqual(normalizeCounter(counter), counter);
  assert.equal(calculateCounter(counter, '2026-09-13').deductions, 0.015);
  assert.equal(normalizeCounter({...legacy, servingPrice:0}).oops[0].amount, 0);
});

test('calendar arithmetic, period accrual, date window and negative savings', () => {
  const c = {...DEFAULT_COUNTER, startDate:'2026-03-28', amountPerPeriod:100, periodDays:2, oops:[{id:'1',date:'2026-03-28',amount:120,reason:'Expense'}, {id:'2',date:'2026-03-27',amount:999,reason:'Before'}, {id:'3',date:'2026-03-31',amount:999,reason:'After'}]};
  assert.deepEqual(calculateCounter(c, '2026-03-30'), {configured:true,days:2,gross:100,deductions:120,saved:-20});
  assert.equal(calculateCounter(c, '2026-03-27').saved,0);
  assert.equal(calculateCounter(DEFAULT_COUNTER).configured,false);
  assert.equal(dayNumber('2026-02-29'),null);
  assert.equal(dayNumber('2024-03-01')-dayNumber('2024-02-28'),2);
});

test('storage migration is idempotent, leaves old records and prefers current data', () => {
  for (const [key, data] of [['wapp.candy.v2',legacy],['wapp.nico.v1',oldest]]) {
    const raw = JSON.stringify(data);
    const s = storage({[key]:raw});
    const first = loadCounter(s);
    assert.deepEqual(loadCounter(s),first);
    assert.equal(s.getItem(key),raw);
    const edited = {...first, amountPerPeriod:300};
    s.setItem(COUNTER_KEY, JSON.stringify(edited));
    assert.deepEqual(loadCounter(s),edited);
  }
  const s = storage({'wapp.candy.v2':JSON.stringify(legacy),'wapp.nico.v1':JSON.stringify({...oldest,packetPrice:1})});
  assert.equal(loadCounter(s).amountPerPeriod,normalizeCounter(legacy).amountPerPeriod);
});

test('invalid stored data is never removed, overwritten, or silently replaced by older data', () => {
  for (const raw of ['{broken', 'null', JSON.stringify({...DEFAULT_COUNTER,version:99}), JSON.stringify({...legacy,oops:[{date:'bad'}]})]) {
    const s = storage({[COUNTER_KEY]:raw,'wapp.candy.v2':JSON.stringify(legacy)});
    const before = [...s.data];
    assert.throws(()=>loadCounter(s));
    assert.deepEqual([...s.data],before);
  }
});

test('backup import supports old, current and routine-only files without duplicating entries', () => {
  const counter = normalizeCounter(legacy);
  for (const file of [{version:2,routine,nico:oldest},{version:3,routine,candy:legacy},{version:4,routine,counter}]) {
    const once = normalizeBackup(file, DEFAULT_COUNTER);
    assert.deepEqual(once, {routine,counter});
    assert.deepEqual(normalizeBackup(file, once.counter), once);
    assert.deepEqual(normalizeBackup(JSON.parse(JSON.stringify({version:4,...once})), counter),once);
  }
  assert.deepEqual(normalizeBackup(routine,counter),{routine,counter});
  assert.throws(()=>normalizeBackup(routine,null));
  assert.throws(()=>normalizeBackup({version:99,routine,counter},counter));
  assert.throws(()=>normalizeBackup({routine,counter:{...counter,amountPerPeriod:-1}},counter));
  assert.ok(totalSeconds(buildTimeline(routine))>0);
});

test('reject invalid values and preserve current amounts even with stale legacy fields', () => {
  const counter = normalizeCounter(legacy);
  assert.deepEqual(normalizeCounter({...legacy,...counter}),counter);
  for (const amountPerPeriod of ['',null,NaN,Infinity,-1,true]) assert.throws(()=>normalizeCounter({...counter,amountPerPeriod}));
  assert.throws(()=>normalizeCounter({...counter,periodDays:1.5}));
  assert.throws(()=>normalizeCounter({...counter,oops:{}}));
  assert.throws(()=>normalizeCounter({...counter,oops:[{date:'2026-10-01',amount:-1}]}));
});
