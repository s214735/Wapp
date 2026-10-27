import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SHEETS,normalizeSheets,spreadsheetId,connectionReady,findCharts,chartRanges,gridCells,buildChart,readCharts,fetchSheet} from '../docs/sheets.mjs';
import {source,spec,book,grid} from './sheets-fixtures.mjs';
test('accept only Google spreadsheet links; configuration stays explicit',()=>{
  const config=normalizeSheets({...DEFAULT_SHEETS,url:'https://docs.google.com/spreadsheets/d/test-id/edit?gid=123#gid=123'});
  assert.equal(config.url,'https://docs.google.com/spreadsheets/d/test-id/edit');assert.equal(spreadsheetId(config.url),'test-id');
  assert.equal(connectionReady(config),false);
  assert.equal(connectionReady({...config,clientId:'test.apps.googleusercontent.com',apiKey:'test-key',projectNumber:'123'}),true);
  for(const url of ['javascript:alert(1)','https://evil.example/spreadsheets/d/a/edit','https://docs.google.com.evil.example/spreadsheets/d/a','https://docs.google.com/spreadsheets/d/e/public','http://docs.google.com/spreadsheets/d/id']){
    assert.throws(()=>spreadsheetId(url));
  }
  assert.throws(()=>normalizeSheets({...DEFAULT_SHEETS,sheets:['same','same']}));
  assert.throws(()=>normalizeSheets({...DEFAULT_SHEETS,version:99}));
});
test('find requested charts by exact tab name and report missing tabs/charts',()=>{
  assert.equal(findCharts(book,['O-MF','O-V']).length,2);
  assert.match(findCharts(book,['missing'])[0].error,/No sheet/);
  assert.match(findCharts(book,["Input's data"])[0].error,/No chart/);
});
test('preserve date spacing, dual axes, percentages, missing data and formatted values',()=>{
  const ranges=chartRanges(spec,book);assert.equal(ranges[0][0].a1,"'Input''s data'!A1:A5");
  const model=buildChart(spec,ranges,gridCells(grid));
  assert.equal(model.labels.length,3);assert.equal(model.config.options.scales.x.type,'linear');
  const points=model.config.data.datasets[0].data;
  assert.equal(points[1].y,null);assert.equal(points[2].x-points[0].x,7*86400000);
  assert.equal(model.config.data.datasets[1].yAxisID,'yRight');
  assert.match(model.config.options.scales.yRight.ticks.callback(.12),/12/);
  assert.deepEqual(model.series[1].values,['12%','15%','14%']);
  assert.equal(model.config.options.plugins.tooltip.callbacks.label({dataset:{label:'Ratio'},datasetIndex:1,dataIndex:0}),'Ratio: 12%');
});
test('reject unsupported or oversized chart data rather than draw misleading values',()=>{
  assert.throws(()=>chartRanges({histogramChart:{}},book),/not supported/);
  assert.throws(()=>chartRanges({basicChart:{...spec.basicChart,stackedType:'PERCENT_STACKED'}},book),/not supported/);
  assert.throws(()=>chartRanges({basicChart:{...spec.basicChart,domains:[{domain:{...source(0),aggregateType:'SUM'}}]}},book),/Aggregated/);
  const bad=structuredClone(spec);bad.basicChart.series[0].series.sourceRange.sources[0].endRowIndex=20000;
  assert.throws(()=>chartRanges(bad,book),/10,000/);
});
test('read metadata then only referenced ranges with bearer auth and no caching/writes',async()=>{
  const calls=[];
  const request=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>new URL(url).searchParams.has('ranges')?grid:book};};
  const result=await readCharts(normalizeSheets({...DEFAULT_SHEETS,url:'https://docs.google.com/spreadsheets/d/example/edit'}),'test-token',undefined,request);
  assert.equal(result.items.length,2);assert.ok(result.items.every(i=>i.model));assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer test-token'&&c.options.cache==='no-store'&&!c.options.method));
  assert.equal(new URL(calls[1].url).searchParams.getAll('ranges').length,3);
  assert.ok(!calls[0].url.includes('test-token'));
});
test('authorization, quota and server errors are actionable',async()=>{
  for(const status of [401,403,404,429,500])await assert.rejects(fetchSheet('example','test-token',new URLSearchParams(),undefined,async()=>({ok:false,status})),e=>e.status===status);
});
