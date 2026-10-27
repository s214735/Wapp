export const SHEETS_KEY = "wapp.sheets.v1";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DEFAULT_SHEETS = { version: 1, url: "", sheets: ["O-MF", "O-V"], clientId: "", apiKey: "", projectNumber: "" };

export function spreadsheetId(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Enter a Google Sheets link."); }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !match || match[1]==='e') throw new Error("Use the private spreadsheet’s normal https://docs.google.com/spreadsheets/d/… link, not a published link.");
  return match[1];
}

export function normalizeSheets(input = DEFAULT_SHEETS) {
  if (!input || input.version !== 1) throw new Error("Unsupported spreadsheet settings.");
  const url = String(input.url || "").trim();
  const sheets = (input.sheets || DEFAULT_SHEETS.sheets).map(value => String(value).trim()).filter(Boolean);
  if (!sheets.length || sheets.length > 2 || new Set(sheets).size !== sheets.length) throw new Error("Enter one or two different chart sheet names.");
  return { version: 1, url: url ? `https://docs.google.com/spreadsheets/d/${spreadsheetId(url)}/edit` : "", sheets,
    clientId: String(input.clientId || "").trim(), apiKey: String(input.apiKey || "").trim(), projectNumber: String(input.projectNumber || "").trim() };
}

export function connectionReady(config) {
  return Boolean(config.url && /^[\w-]+\.apps\.googleusercontent\.com$/.test(config.clientId) && config.apiKey && /^\d+$/.test(config.projectNumber));
}

export function findCharts(book, names) {
  return names.map(name => {
    const sheet = book.sheets?.find(s => s.properties?.title === name);
    if (!sheet) return { sheetName: name, error: `No sheet named “${name}” was found. Check its name in Settings.` };
    if (!sheet.charts?.length) return { sheetName: name, error: `No chart was found on “${name}”.` };
    return sheet.charts.map(chart => ({ sheetName: name, chart }));
  }).flat();
}

function chartColumns(spec) {
  if (spec.dataSourceChartProperties || spec.filterSpecs?.length || spec.sortSpecs?.length) throw new Error("This chart uses data-source filtering or sorting that Wapp cannot yet reproduce.");
  if (spec.basicChart) {
    const b = spec.basicChart;
    if (!["LINE", "AREA", "STEPPED_AREA", "COLUMN", "BAR", "SCATTER", "COMBO"].includes(b.chartType)) throw new Error("This chart type is not supported yet.");
    if (b.stackedType === "PERCENT_STACKED") throw new Error("Percentage-stacked charts are not supported yet.");
    if (b.domains?.length !== 1 || !b.series?.length) throw new Error("The chart needs one domain and at least one data series.");
    return [b.domains[0].domain, ...b.series.map(s => s.series)];
  }
  if (spec.pieChart) return [spec.pieChart.domain, spec.pieChart.series];
  throw new Error("This chart type is not supported yet. Line, area, bar, column, scatter, combo and pie charts are supported.");
}

function columnName(index) {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}

export function chartRanges(spec, book) {
  return chartColumns(spec).map(column => {
    if (column?.aggregateType && column.aggregateType !== "AGGREGATE_TYPE_UNSPECIFIED") throw new Error("Aggregated chart data is not supported yet.");
    if (!column?.sourceRange?.sources?.length) throw new Error("The chart does not use readable cell ranges.");
    return column.sourceRange.sources.map(range => {
      const sheetId = range.sheetId ?? 0;
      const sheet = book.sheets?.find(s => s.properties.sheetId === sheetId);
      if (!sheet) throw new Error("A source sheet is missing.");
      const row = range.startRowIndex ?? 0, col = range.startColumnIndex ?? 0;
      const endRow = range.endRowIndex ?? sheet.properties.gridProperties?.rowCount;
      const endCol = range.endColumnIndex ?? sheet.properties.gridProperties?.columnCount;
      if (![row,col,endRow,endCol].every(Number.isInteger) || row < 0 || col < 0 || endRow <= row || endCol <= col) throw new Error("The chart has an invalid source range.");
      if (endRow-row !== 1 && endCol-col !== 1) throw new Error("Each chart series must use a single row or column.");
      if ((endRow-row)*(endCol-col) > 10000) throw new Error("Limit each chart source range to 10,000 cells or fewer.");
      return { sheetId, row, col, endRow, endCol, a1: `'${sheet.properties.title.replaceAll("'", "''")}'!${columnName(col)}${row+1}:${columnName(endCol-1)}${endRow}` };
    });
  });
}

export function gridCells(book) {
  const cells = new Map();
  for (const sheet of book.sheets || []) for (const grid of sheet.data || []) {
    (grid.rowData || []).forEach((row, r) => (row.values || []).forEach((cell, c) => {
      cells.set(`${sheet.properties.sheetId}:${(grid.startRow || 0)+r}:${(grid.startColumn || 0)+c}`, cell);
    }));
  }
  return cells;
}

const palette = ["#376047", "#ae754b", "#527fa3", "#926b9b", "#b6993a", "#569591"];
function color(series, index) {
  const rgb = series?.colorStyle?.rgbColor || series?.color;
  return rgb ? `rgba(${Math.round((rgb.red || 0)*255)},${Math.round((rgb.green || 0)*255)},${Math.round((rgb.blue || 0)*255)},${rgb.alpha ?? 1})` : palette[index % palette.length];
}
const numeric = cell => Number.isFinite(cell?.effectiveValue?.numberValue) ? cell.effectiveValue.numberValue : null;
const label = cell => String(cell?.formattedValue ?? cell?.effectiveValue?.stringValue ?? cell?.effectiveValue?.numberValue ?? "");

export function buildChart(spec, ranges, cells) {
  const columns = ranges.map(parts => parts.flatMap(r => {
    const result = [];
    for (let row=r.row;row<r.endRow;row++) for(let col=r.col;col<r.endCol;col++) result.push(cells.get(`${r.sheetId}:${row}:${col}`));
    return result;
  }));
  const basic = spec.basicChart;
  // Google can infer headers. Match the common case of text headers above numbers.
  const inferred = columns.slice(1).some(c => label(c[0]) && numeric(c[0]) === null) ? 1 : 0;
  const headers = basic?.headerCount ?? inferred;
  if (!Number.isInteger(headers) || headers < 0) throw new Error("The chart has an invalid header count.");
  const rows = Math.max(...columns.map(c => c.length));
  let end = rows;
  while (end>headers && columns.every(c => !label(c[end-1]))) end--;
  if (end <= headers) throw new Error("The chart has no data to display.");
  const labels = Array.from({length:end-headers},(_,i)=>label(columns[0][i+headers]));
  const type = basic?.chartType || "PIE";
  const firstDomain = columns[0].slice(headers,end).find(cell=>numeric(cell)!==null);
  const dateDomain = Boolean(basic && ["DATE","DATE_TIME"].includes(firstDomain?.effectiveFormat?.numberFormat?.type));
  const numericDomain = Boolean(basic && type!=="BAR" && type!=="COLUMN" && firstDomain && columns[0].slice(headers,end).every(cell=>!label(cell)||numeric(cell)!==null));
  const xValue = cell => {const n=numeric(cell);return n===null?null:dateDomain?Date.UTC(1899,11,30)+n*86400000:n;};
  const formatDate = value => new Intl.DateTimeFormat(documentLocale(),{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value));
  const datasets = columns.slice(1).map((values,i) => {
    const series = basic?.series[i];
    const seriesType = series?.type || type;
    const isBar = ["BAR", "COLUMN"].includes(seriesType);
    const title = values.slice(0,headers).map(label).filter(Boolean).join(" / ") || `Series ${i+1}`;
    const data = Array.from({length:end-headers},(_,j)=>numeric(values[j+headers]));
    if(type === "SCATTER" || numericDomain) {
      for(let j=0;j<data.length;j++) {
        const x=xValue(columns[0][j+headers]);
        if(x === null && data[j] !== null) throw new Error("Scatter charts need numeric values on the horizontal axis.");
        data[j] = {x,y:data[j]};
      }
    }
    return { label:title, data, ...(basic ? {type: type === "SCATTER" ? "scatter" : isBar ? "bar" : "line", yAxisID:series?.targetAxis === "RIGHT_AXIS" ? "yRight" : "y"} : {}),
      borderColor:color(series,i), backgroundColor:basic ? color(series,i) : labels.map((_,j)=>palette[j%palette.length]),
      borderWidth:2, pointRadius:2, pointHoverRadius:5, tension:basic?.lineSmoothing ? 0.3 : 0,
      spanGaps:Boolean(basic?.interpolateNulls), fill:["AREA","STEPPED_AREA"].includes(seriesType), stepped:seriesType === "STEPPED_AREA" };
  });
  const axisTitle = pos => basic?.axis?.find(a=>a.position===pos)?.title || "";
  const scales = basic ? {
    x:{stacked:basic.stackedType === "STACKED",title:{display:Boolean(axisTitle("BOTTOM_AXIS")),text:axisTitle("BOTTOM_AXIS")},ticks:{maxTicksLimit:5,autoSkip:true,maxRotation:45}},
    y:{stacked:basic.stackedType === "STACKED",title:{display:Boolean(axisTitle("LEFT_AXIS")),text:axisTitle("LEFT_AXIS")},ticks:{maxTicksLimit:6}},
    ...(datasets.some(d=>d.yAxisID==='yRight') ? {yRight:{position:'right',grid:{drawOnChartArea:false},title:{display:Boolean(axisTitle('RIGHT_AXIS')),text:axisTitle('RIGHT_AXIS')}}} : {})
  } : undefined;
  if(scales) {
    if(numericDomain || type==='SCATTER')scales.x.type='linear';
    if(dateDomain)scales.x.ticks.callback=formatDate;
    for(const [key,position] of [['x','BOTTOM_AXIS'],['y','LEFT_AXIS'],['yRight','RIGHT_AXIS']]) {
      const axis=basic.axis?.find(a=>a.position===position);
      if(!scales[key])continue;
      if(axis?.viewWindowOptions?.viewWindowMode==='EXPLICIT') {
        for(const [from,to] of [['viewWindowMin','min'],['viewWindowMax','max']]) if(Number.isFinite(axis.viewWindowOptions[from]))scales[key][to]=key==='x'&&dateDomain?Date.UTC(1899,11,30)+axis.viewWindowOptions[from]*86400000:axis.viewWindowOptions[from];
      }
    }
    datasets.forEach((dataset,i)=>{
      const sample=columns[i+1].slice(headers,end).find(cell=>numeric(cell)!==null);
      if(sample?.effectiveFormat?.numberFormat?.type==='PERCENT')scales[dataset.yAxisID].ticks={...scales[dataset.yAxisID].ticks,callback:value=>new Intl.NumberFormat(documentLocale(),{style:'percent',maximumFractionDigits:1}).format(value)};
    });
  }
  const config = { type: basic ? type === "SCATTER" ? "scatter" : ["COLUMN","BAR"].includes(type) ? "bar" : "line" : spec.pieChart?.pieHole ? "doughnut" : "pie",
    data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,locale:documentLocale(),indexAxis:type === "BAR" ? "y" : "x",
      ...(scales ? {scales} : {}),plugins:{legend:{display:(basic?.legendPosition || spec.pieChart?.legendPosition)!=='NO_LEGEND',position:'bottom'},tooltip:{callbacks:{
        title:items=>items.length?labels[items[0].dataIndex]:'',
        label:context=>`${context.dataset.label}: ${label(columns[context.datasetIndex+1][context.dataIndex+headers]) || '—'}`
      }}},
      ...(spec.pieChart?.pieHole ? {cutout:`${spec.pieChart.pieHole*100}%`} : {})} };
  return {config, labels, series:datasets.map((d,i)=>({name:d.label,values:Array.from({length:end-headers},(_,j)=>label(columns[i+1][j+headers]) || null)})), title:spec.title || "Graph", subtitle:spec.subtitle || ""};
}
function documentLocale() { return typeof navigator === "undefined" ? "en" : navigator.language; }

export async function fetchSheet(id, token, params, signal, request = fetch) {
  const response = await request(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?${params}`, {headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal});
  if (!response.ok) {
    const error = new Error(response.status === 401 ? "Your Google connection expired. Connect again." : response.status === 403 || response.status === 404 ? "Google could not open this spreadsheet. Check the account, file selection and enabled APIs, then connect again." : response.status === 429 ? "Google is receiving too many requests. Wait a moment and refresh." : "Google Sheets could not be loaded. Please try again.");
    error.status = response.status; throw error;
  }
  return response.json();
}

export async function readCharts(config, token, signal, request = fetch) {
  const id = spreadsheetId(config.url);
  const book = await fetchSheet(id, token, new URLSearchParams({fields:"properties(title),sheets(properties,charts)"}), signal, request);
  const items = findCharts(book,config.sheets);
  for (const item of items) {
    if(item.error) continue;
    try {
      item.ranges=chartRanges(item.chart.spec,book);
      if(item.ranges.flat().reduce((sum,r)=>sum+(r.endRow-r.row)*(r.endCol-r.col),0)>50000) throw new Error("Limit the chart to 50,000 source cells or fewer.");
    } catch(error) {item.error=error.message;}
  }
  const a1=[...new Set(items.filter(i=>!i.error).flatMap(i=>i.ranges.flat().map(r=>r.a1)))];
  const params=new URLSearchParams({includeGridData:"true",fields:"sheets(properties(sheetId),data(startRow,startColumn,rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat)))))"});
  a1.forEach(r=>params.append("ranges",r));
  const cells=a1.length ? gridCells(await fetchSheet(id,token,params,signal,request)) : new Map();
  for(const item of items) if(!item.error) {try {item.model=buildChart(item.chart.spec,item.ranges,cells);} catch(error) {item.error=error.message;}}
  return {title:book.properties?.title || "Spreadsheet",items};
}
