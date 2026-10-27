const {webkit,chromium}=require('playwright');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../docs');
const output=process.argv[2];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);});});
const googleMock=`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>{window.requestedScope=options.scope;queueMicrotask(()=>{if(window.authMode==='cancel')options.error_callback({type:'popup_closed'});else if(window.authMode==='denied')options.callback({error:'access_denied'});else options.callback({access_token:'synthetic-test-token',expires_in:3600});});}})}},picker:{Action:{PICKED:'picked',CANCEL:'cancel'},ViewId:{SPREADSHEETS:'spreadsheets'},DocsViewMode:{LIST:'list'},DocsView:class {setMode(){return this}setFileIds(id){window.pickerFileId=id;return this}},PickerBuilder:class {addView(){return this}setOAuthToken(){return this}setDeveloperKey(){return this}setAppId(){return this}setOrigin(){return this}setSize(){return this}setCallback(cb){this.cb=cb;return this}build(){const cb=this.cb;return {dispose(){},setVisible(){queueMicrotask(()=>cb(window.authMode==='picker-cancel'?{action:'cancel'}:{action:'picked',docs:[{id:window.authMode==='wrong-file'?'other':window.pickerFileId}]}));}}}}}};`;
async function settings(page){await page.locator('[data-view=settings]').click();await page.locator('#settings-open-data').click();}
async function connect(page){await page.locator('[data-view=data]').click();await page.waitForFunction(()=>document.querySelector('#data-connect').textContent==='Connect with Google'&&!document.querySelector('#data-connect').disabled);await page.locator('#data-connect').click();}
async function layout(page,selector){assert.deepEqual(await page.locator(selector).evaluate(root=>{const errors=[];if(document.documentElement.scrollWidth>innerWidth)errors.push('page overflow');for(const el of root.querySelectorAll('input,button,canvas')){const r=el.getBoundingClientRect();if(r.width&&(r.left<0||r.right>innerWidth+1))errors.push(el.id||el.tagName);}return errors;}),[]);}
async function run(engine,width,fixtures){
  const browser=await engine.launch(engine===chromium&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
  try{
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:googleMock}));
    await page.route('https://apis.google.com/js/api.js',r=>r.fulfill({contentType:'text/javascript',body:'window.gapi={load:(name,options)=>options.callback()};'}));
    let status=200,networkFailure=false,releaseRequest;
    const requests=[];
    await page.route('https://sheets.googleapis.com/**',async route=>{
      const request=route.request();requests.push(request);assert.equal(request.method(),'GET');assert.equal(request.headers().authorization,'Bearer synthetic-test-token');
      if(networkFailure)return route.abort();
      if(releaseRequest===true)await new Promise(resolve=>{releaseRequest=resolve;});
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(new URL(request.url()).searchParams.has('ranges')?fixtures.grid:fixtures.book)}).catch(()=>{});
    });
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('[data-view=data]').click();await layout(page,'#data-view');
    assert.equal(await page.locator('#data-connect').isVisible(),false);
    await page.locator('#data-open-settings').click();
    await page.locator('#sheets-url').fill('https://docs.google.com/spreadsheets/d/example/edit#gid=123');
    await page.locator('.google-setup summary').click();
    await page.locator('#sheets-client').fill('example.apps.googleusercontent.com');await page.locator('#sheets-key').fill('synthetic-key');await page.locator('#sheets-project').fill('123456');
    await layout(page,'#data-settings');await page.locator('#sheets-settings-form [type=submit]').click();
    if(output)await page.screenshot({path:path.join(output,`data-settings-${engine.name()}-${width}.png`),fullPage:true});
    for(const mode of ['cancel','denied','picker-cancel','wrong-file']){
      await page.evaluate(mode=>window.authMode=mode,mode);await connect(page);await page.waitForFunction(()=>!document.querySelector('#data-connect').disabled);
      assert.equal(await page.locator('#data-charts canvas').count(),0);
    }
    await page.evaluate(()=>window.authMode='success');await connect(page);await page.waitForFunction(()=>document.querySelectorAll('#data-charts canvas').length===2);
    await layout(page,'#data-view');
    assert.equal(await page.evaluate(()=>Object.keys(Chart.instances).length),2,await page.locator('#data-status').innerText());
    assert.equal(await page.evaluate(()=>window.requestedScope),'https://www.googleapis.com/auth/drive.file');
    await page.locator('.graph-table summary').first().click();assert.match(await page.locator('.graph-table').first().textContent(),/12%/);
    if(output)await page.screenshot({path:path.join(output,`data-connected-${engine.name()}-${width}.png`),fullPage:true});
    const before=requests.length;await page.locator('#data-refresh').click();await page.waitForFunction(()=>!document.querySelector('#data-refresh').disabled);assert.equal(requests.length,before+2);
    networkFailure=true;await page.locator('#data-refresh').click();await page.waitForFunction(()=>!document.querySelector('#data-refresh').disabled);assert.equal(await page.locator('#data-charts canvas').count(),2);networkFailure=false;
    status=401;await page.locator('#data-refresh').click();await page.waitForFunction(()=>!document.querySelector('#data-connect').hidden);assert.equal(await page.locator('#data-charts canvas').count(),0);status=200;
    await connect(page);await page.waitForFunction(()=>document.querySelectorAll('#data-charts canvas').length===2);
    releaseRequest=true;await page.locator('#data-refresh').click();while(typeof releaseRequest!=='function')await new Promise(resolve=>setTimeout(resolve,10));
    await page.locator('#data-disconnect').click();releaseRequest();releaseRequest=null;
    assert.equal(await page.locator('#data-charts canvas').count(),0);assert.equal(await page.evaluate(()=>Object.keys(Chart.instances).length),0);
    const saved=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
    assert.ok(!JSON.stringify(saved).includes('synthetic-test-token'));assert.ok(!JSON.stringify(saved).includes('Example trend'));
    assert.equal(JSON.parse(saved['wapp.sheets.v1']).url,'https://docs.google.com/spreadsheets/d/example/edit');
    await page.reload();await settings(page);assert.equal(await page.locator('#sheets-url').inputValue(),'https://docs.google.com/spreadsheets/d/example/edit');
    await page.locator('#sheets-url').fill('https://example.org/private');await page.locator('#sheets-settings-form [type=submit]').click();assert.match(await page.locator('#sheets-settings-status').textContent(),/private spreadsheet/);
    await page.locator('[data-view=counter]').click();assert.equal(await page.locator('#counter-view').isVisible(),true);
    await page.locator('[data-view=stretch]').click();await page.locator('#start-button').click();await page.locator('#end-button').click();
    assert.deepEqual(errors,[]);console.log(`${engine.name()} ${width}px: settings, chart rendering, OAuth/picker cancellation, refresh, expiry error, disconnect and private storage PASS`);
  }finally{await browser.close();}
}
(async()=>{const fixtures=await import('./sheets-fixtures.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{if(output)fs.mkdirSync(output,{recursive:true});for(const width of [320,390,430,1280])await run(webkit,width,fixtures);await run(chromium,1280,fixtures);}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
