// Run with Playwright installed: node tests/browser.cjs [screenshot-directory]
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../docs');
const output = process.argv[2];
const legacy = { version:2,startDate:'2026-09-13',servingPrice:63,servingsPerPeriod:2.8,periodDays:7,currency:'kr',oops:[{id:'a',date:'2026-09-27',servings:3.2,note:'Machine'}] };
const routine = JSON.parse(fs.readFileSync(path.join(root,'routine.json')));
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.join(root,pathname==='/'?'index.html':pathname);
  if (!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);});
});
const state = page => page.evaluate(()=>JSON.parse(localStorage.getItem('wapp.counter.v3')));
async function settings(page, section) { await page.locator('[data-view=settings]').click(); await page.locator('#settings-open-'+section).click(); }
async function layout(page, selector) {
  const errors = await page.locator(selector).evaluate(root => {
    const errors=[];
    if(document.documentElement.scrollWidth>innerWidth) errors.push('page overflows');
    for(const el of root.querySelectorAll('input,select')) {
      const r=el.getBoundingClientRect(), p=el.parentElement.getBoundingClientRect();
      if(r.width && (r.left<p.left-1 || r.right>p.right+1 || r.left<0 || r.right>innerWidth)) errors.push(el.id+' overflows');
    }
    for(const row of root.querySelectorAll('.field-grid,.estimate-row')) {
      const fields=[...row.querySelectorAll('input')].map(el=>el.getBoundingClientRect());
      if(fields.length===2) {
        const [a,b]=fields;
        if(a.left<b.right && b.left<a.right && a.top<b.bottom && b.top<a.bottom) errors.push('inputs overlap');
        if(Math.abs(a.left-b.left)>1 && Math.abs(a.top-b.top)>1) errors.push('columns misaligned');
      }
    }
    return errors;
  });
  assert.deepEqual(errors,[]);
}
async function importFile(page,data,accept=true) {
  page.once('dialog',d=>accept?d.accept():d.dismiss());
  await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  if(accept) await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Backup imported');
}
async function run(engine, width) {
  const mobile=width<600;
  const browser=await engine.launch(engine===chromium && process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
  try {
    const context=await browser.newContext({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile,locale:'da-DK',timezoneId:'Europe/Copenhagen',acceptDownloads:true});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-10-27T12:00:00+01:00'));
    await page.addInitScript(data=>{if(!localStorage.getItem('test-seeded')){localStorage.setItem('wapp.candy.v2',JSON.stringify(data));localStorage.setItem('test-seeded','yes');}},legacy);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>document.querySelector('#move-count').textContent!=='—');
    await page.locator('[data-view=counter]').click();
    assert.match(await page.locator('#counter-saved').textContent(),/907,20 DKK/);
    assert.equal(await page.locator('#counter-days').textContent(),'44');
    const initial=await state(page);
    await layout(page,'#counter-view');
    if(output) await page.screenshot({path:path.join(output,`counter-${engine.name()}-${width}.png`),fullPage:true});
    await settings(page,'counter');await layout(page,'#counter-settings');
    if(output) await page.screenshot({path:path.join(output,`settings-${engine.name()}-${width}.png`),fullPage:true});
    await page.reload();assert.deepEqual(await state(page),initial);
    assert.equal(await page.evaluate(()=>localStorage.getItem('wapp.candy.v2')),JSON.stringify(legacy));
    await settings(page,'counter');
    await page.locator('#counter-rate').fill('140');await page.locator('#counter-settings-form button').click();
    assert.equal((await state(page)).oops[0].amount,initial.oops[0].amount);
    await page.locator('[data-view=counter]').click();
    await page.locator('#oops-date').fill('2026-10-26');await page.locator('#oops-amount').fill('25.5');await page.locator('#oops-reason').fill('Unplanned purchase');await page.locator('#oops-form button').click();
    assert.match(await page.locator('#counter-saved').textContent(),/652,90 DKK/);
    assert.equal((await state(page)).oops.length,2);
    await settings(page,'counter');await page.locator('#settings-oops-list button').first().click();
    await layout(page,'#oops-dialog');
    await page.locator('#edit-oops-amount').fill('50');await page.locator('#edit-oops-reason').fill('Updated reason');await page.locator('#edit-oops-date').fill('2026-10-25');await page.locator('#oops-edit-form [type=submit]').click();
    assert.equal((await state(page)).oops[1].amount,50);assert.equal((await state(page)).oops[1].date,'2026-10-25');
    assert.match(await page.locator('#counter-saved').textContent(),/628,40 DKK/);
    await page.locator('#settings-oops-list button').first().click();page.once('dialog',d=>d.accept());await page.locator('#delete-oops-button').click();assert.equal((await state(page)).oops.length,1);
    await settings(page,'backup');assert.equal(await page.locator('#import-button').isVisible(),true);
    if(!mobile) {
      const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();const download=await downloadPromise;
      const data=JSON.parse(fs.readFileSync(await download.path()));assert.equal(data.version,4);assert.deepEqual(data.counter,await state(page));
      await importFile(page,data);assert.deepEqual(await state(page),data.counter);
    } else {
      // Exercise native-share serialization without sending anything externally.
      await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async data=>{window.sharedBackup=JSON.parse(await data.files[0].text());},configurable:true});});
      await page.locator('#share-button').click();await page.waitForFunction(()=>window.sharedBackup);
      assert.deepEqual(await page.evaluate(()=>window.sharedBackup.counter),await state(page));
    }
    const oldFile={version:3,routine,candy:legacy};
    await importFile(page,oldFile);assert.deepEqual(await state(page),initial);
    await importFile(page,oldFile);assert.deepEqual(await state(page),initial);
    await importFile(page,routine);assert.deepEqual(await state(page),initial);
    await importFile(page,{...oldFile,candy:{...legacy,servingPrice:1}},false);
    assert.deepEqual(await state(page),initial);
    await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});assert.deepEqual(await state(page),initial);
    await page.locator('[data-view=stretch]').click();await page.locator('#start-button').click();assert.equal(await page.locator('#session').isVisible(),true);await page.locator('#pause-button').click();assert.equal(await page.locator('#pause-button').textContent(),'Resume');await page.locator('#end-button').click();
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>navigator.serviceWorker.controller);
    assert.deepEqual(await page.evaluate(()=>caches.keys()),['wapp-v4']);
    if(engine===chromium) {
      await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.querySelector('#move-count').textContent!=='—');assert.deepEqual(await state(page),initial);await context.setOffline(false);
    }
    assert.deepEqual(errors,[]);
    console.log(`${engine.name()} ${width}px: migration, layout, add/edit/delete, import/export, Stretch and cache PASS${engine===chromium?' (offline reload PASS)':''}`);
    await context.close();
  } finally {await browser.close();}
}
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{if(output) fs.mkdirSync(output,{recursive:true});for(const width of [320,375,390,430,1280]) await run(webkit,width);await run(chromium,1280);}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
