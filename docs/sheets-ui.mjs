import { DEFAULT_SHEETS, SHEETS_KEY, SHEETS_SCOPE, normalizeSheets, connectionReady, spreadsheetId, readCharts } from "./sheets.mjs";

const scripts = new Map();
function script(src) {
  if (scripts.has(src)) return scripts.get(src);
  const promise = new Promise((resolve,reject) => {
    const element=document.createElement('script');element.src=src;element.async=true;
    const timer=setTimeout(()=>fail(),20000);
    const fail=()=>{clearTimeout(timer);element.remove();scripts.delete(src);reject(new Error('Could not load the connection tools. Check your internet connection and try again.'));};
    element.onload=()=>{clearTimeout(timer);resolve();};element.onerror=fail;document.head.append(element);
  });
  scripts.set(src,promise);return promise;
}
let googleReady;
function prepareGoogle() {
  if(!googleReady) googleReady=Promise.all([script('https://accounts.google.com/gsi/client'),script('https://apis.google.com/js/api.js')])
    .then(()=>new Promise((resolve,reject)=>window.gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('Google file picker could not load.')),timeout:20000,ontimeout:()=>reject(new Error('Google file picker timed out.'))})))
    .catch(error=>{googleReady=null;throw error;});
  return googleReady;
}

export function createSheetsPage({notify,openSettings}) {
  const $=id=>document.getElementById(id);
  let config, storageError='';
  try {config=normalizeSheets(JSON.parse(localStorage.getItem(SHEETS_KEY)) || DEFAULT_SHEETS);} catch {config=normalizeSheets(DEFAULT_SHEETS);storageError='Saved spreadsheet settings could not be read. They have been kept; save new settings to replace them.';}
  let token='', expires=0, expiryTimer, generation=0, controller, picker, charts=[], models=[], busy=false, ready=false, preparing=false, lastUpdated='';
  const setStatus=(text,error=false)=>{$('data-status').textContent=text;$('data-status').classList.toggle('error-text',error);};
  function clearCharts(){charts.forEach(chart=>chart.destroy());charts=[];models=[];$('data-charts').replaceChildren();$('data-charts').hidden=true;lastUpdated='';$('data-updated').textContent='';}
  function reset(){generation++;controller?.abort();controller=null;picker?.dispose();picker=null;token='';expires=0;clearTimeout(expiryTimer);busy=false;clearCharts();update();}
  function update(){
    $('data-connection-title').closest('section').classList.toggle('connected',models.length>0);
    $('data-connect').disabled=busy||preparing;
    $('data-connect').hidden=!connectionReady(config)||Boolean(token);
    $('data-connect').textContent=ready?'Connect with Google':'Prepare Google connection';
    $('data-refresh').hidden=!token;$('data-refresh').disabled=busy;
    $('data-disconnect').hidden=!token&&!busy;
    $('data-open-settings').textContent=connectionReady(config)?'Connection settings':'Set up spreadsheet';
    $('data-sheet-link').hidden=!config.url;$('data-sheet-link').href=config.url || '#';
    $('data-permission').hidden=!connectionReady(config);
  }
  function renderSettings(){
    $('sheets-url').value=config.url;
    $('sheets-first').value=config.sheets[0] || '';$('sheets-second').value=config.sheets[1] || '';
    $('sheets-client').value=config.clientId;$('sheets-key').value=config.apiKey;$('sheets-project').value=config.projectNumber;
    $('sheets-settings-status').textContent=storageError || (connectionReady(config)?'Connection settings saved on this device.':'Save your spreadsheet link and complete the one-time Google setup below.');
  }
  async function prepare(){
    if(preparing||ready||!connectionReady(config)) return;
    preparing=true;update();setStatus('Loading Google sign-in…');
    try {await prepareGoogle();ready=true;if(!token&&!busy)setStatus('Ready to connect. Choose your spreadsheet in Google’s file picker.');}
    catch(error){setStatus(error.message,true);}finally{preparing=false;update();}
  }
  function show(){
    update();
    if(!config.url)setStatus('Add your spreadsheet link in Settings to show your graphs here.');
    else if(!connectionReady(config))setStatus('Your link is saved. Complete the Google connection setup in Settings.');
    else if(!ready)prepare();
    else if(!token&&!busy)setStatus('Connect with Google to load your private graphs.');
    requestAnimationFrame(()=>charts.forEach(chart=>chart.resize()));
  }
  function draw(result){
    clearCharts();$('data-charts').hidden=false;
    result.items.forEach(item=>{
      const card=document.createElement('section');card.className='content-card graph-card';
      const kicker=document.createElement('p');kicker.className='section-kicker';kicker.textContent=item.sheetName;card.append(kicker);
      const heading=document.createElement('h2');heading.textContent=item.model?.title || item.chart?.spec?.title || item.sheetName;card.append(heading);
      if(item.error){const message=document.createElement('p');message.className='supporting-text error-text';message.textContent=item.error;card.append(message);}
      else {
        if(item.model.subtitle){const subtitle=document.createElement('p');subtitle.className='supporting-text';subtitle.textContent=item.model.subtitle;card.append(subtitle);}
        const frame=document.createElement('div');frame.className='graph-frame';const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${item.model.title}. Data table follows.`);frame.append(canvas);card.append(frame);
        const details=document.createElement('details');details.className='graph-table';const summary=document.createElement('summary');summary.textContent='View values';details.append(summary);
        const scroll=document.createElement('div');scroll.className='table-scroll';const table=document.createElement('table');const head=document.createElement('thead');const tr=document.createElement('tr');
        for(const label of ['Label',...item.model.series.map(s=>s.name)]){const th=document.createElement('th');th.scope='col';th.textContent=label;tr.append(th);}head.append(tr);table.append(head);
        const body=document.createElement('tbody');
        item.model.labels.slice(0,500).forEach((label,i)=>{const row=document.createElement('tr');for(const value of [label,...item.model.series.map(s=>s.values[i])]){const cell=document.createElement('td');cell.textContent=value==null?'—':String(value);row.append(cell);}body.append(row);});
        if(item.model.labels.length>500){const note=document.createElement('p');note.className='supporting-text';note.textContent='Showing the first 500 rows here. The graph includes the full selected range.';details.append(note);}
        table.append(body);scroll.append(table);details.append(scroll);card.append(details);
        $('data-charts').append(card);models.push({canvas,model:item.model});return;
      }
      $('data-charts').append(card);
    });
    let drawFailures=0;
    models.forEach(({canvas,model})=>{
      try {charts.push(new window.Chart(canvas,model.config));}
      catch {
        window.Chart.getChart(canvas)?.destroy();drawFailures++;
        const message=document.createElement('p');message.className='supporting-text error-text';message.textContent='This graph could not be drawn. Its source values are available in the table below.';
        canvas.parentElement.replaceChildren(message);
      }
    });
    lastUpdated=new Date().toISOString();$('data-updated').textContent=`Updated ${new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(lastUpdated))}`;
    const failures=result.items.filter(item=>item.error).length+drawFailures;
    setStatus(failures ? `${result.title}: ${failures} graph${failures===1?'':'s'} could not be displayed. See the details below.` : `Connected to ${result.title}.`,Boolean(failures));
  }
  async function refresh(){
    if(!token||Date.now()>=expires){reset();setStatus('Your Google connection expired. Connect again.',true);return;}
    const current=generation;controller?.abort();controller=new AbortController();busy=true;update();setStatus('Loading your graphs…');
    try {
      const [result]=await Promise.all([readCharts(config,token,controller.signal),script('./vendor/chart.umd.min.js')]);
      if(current!==generation)return;draw(result);
    } catch(error){
      if(current!==generation||error.name==='AbortError')return;
      if(error.status===401||error.status===403||error.status===404){reset();}
      setStatus(error.message+(models.length?' The previous graphs are still shown.':''),true);
    } finally{if(current===generation){busy=false;update();}}
  }
  function chooseFile(current){
    const p=window.google.picker;
    const view=new p.DocsView(p.ViewId.SPREADSHEETS).setMode(p.DocsViewMode.LIST).setFileIds(spreadsheetId(config.url));
    picker=new p.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(config.apiKey).setAppId(config.projectNumber).setOrigin(location.origin)
      .setSize(Math.max(280,Math.min(800,innerWidth-20)),Math.max(350,Math.min(600,innerHeight-40)))
      .setCallback(data=>{
        if(current!==generation)return;
        if(data.action===p.Action.CANCEL){reset();setStatus('File selection cancelled. Your settings are unchanged.');}
        if(data.action===p.Action.PICKED){
          picker?.dispose();picker=null;
          if(data.docs?.[0]?.id!==spreadsheetId(config.url)){reset();setStatus('Choose the spreadsheet whose link you saved in Settings.',true);return;}
          refresh();
        }
      }).build();picker.setVisible(true);setStatus('Select your spreadsheet in Google’s file picker.');
  }
  function connect(){
    if(!connectionReady(config)){openSettings();return;}
    if(!ready){prepare();return;}
    // This call stays synchronous with the tap so iPhone popup blocking does not interrupt sign-in.
    reset();const current=generation;busy=true;update();setStatus('Waiting for Google sign-in…');
    const client=window.google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:SHEETS_SCOPE,include_granted_scopes:false,
      callback:response=>{
        if(current!==generation)return;
        if(response.error||!response.access_token){reset();setStatus('Google access was not granted. You can try again.',true);return;}
        if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,SHEETS_SCOPE)){reset();setStatus('Permission to the selected file is needed to load its graphs.',true);return;}
        token=response.access_token;expires=Date.now()+Math.max(1,Number(response.expires_in)||3600)*1000;
        expiryTimer=setTimeout(()=>{reset();setStatus('Your Google connection expired. Connect again to refresh your graphs.');},Math.max(0,expires-Date.now()-5000));
        try{chooseFile(current);}catch{reset();setStatus('The Google file picker could not open. Check the project number and Picker API key in Settings.',true);}
      },error_callback:error=>{if(current!==generation)return;reset();setStatus(error.type==='popup_closed'?'Sign-in cancelled.': 'Google sign-in could not open. Allow the sign-in popup or try opening Wapp in Safari.',true);}});
    try{client.requestAccessToken({prompt:'select_account'});}catch{reset();setStatus('Google sign-in could not start. Try again.',true);}
  }
  $('sheets-settings-form').addEventListener('submit',event=>{
    event.preventDefault();if(!event.currentTarget.reportValidity())return;
    try{
      const next=normalizeSheets({version:1,url:$('sheets-url').value,sheets:[$('sheets-first').value,$('sheets-second').value],clientId:$('sheets-client').value,apiKey:$('sheets-key').value,projectNumber:$('sheets-project').value});
      if(next.clientId&&!/^[\w-]+\.apps\.googleusercontent\.com$/.test(next.clientId))throw new Error('Use the OAuth client ID ending in .apps.googleusercontent.com, not a client secret.');
      if(next.projectNumber&&!/^\d+$/.test(next.projectNumber))throw new Error('The Google project number contains digits only.');
      localStorage.setItem(SHEETS_KEY,JSON.stringify(next));reset();config=next;storageError='';renderSettings();update();notify('Spreadsheet settings saved');
    }catch(error){$('sheets-settings-status').textContent=error.message;notify(error.message);}
  });
  $('data-open-settings').addEventListener('click',openSettings);
  $('data-connect').addEventListener('click',connect);$('data-refresh').addEventListener('click',refresh);
  $('data-disconnect').addEventListener('click',()=>{reset();setStatus('Disconnected on this device. Graphs and the access token have been cleared.');});
  window.addEventListener('storage',event=>{
    if(event.key!==SHEETS_KEY)return;reset();
    try{config=normalizeSheets(JSON.parse(event.newValue)||DEFAULT_SHEETS);storageError='';}catch{config=normalizeSheets(DEFAULT_SHEETS);storageError='Spreadsheet settings could not be read.';}
    renderSettings();update();setStatus('Spreadsheet settings changed in another tab. Connect again.');
  });
  renderSettings();update();
  return {show,renderSettings,reset};
}
