const $ = id => document.getElementById(id);
const metricKeys = ['insideTemp','insideHumidity','outsideTemp','outsideHumidity','weight','soundDb'];
const labels = {insideTemp:'Inside temperature',outsideTemp:'Outside temperature',insideHumidity:'Inside humidity',outsideHumidity:'Outside humidity',weight:'Hive weight',soundDb:'Sound level'};
const units = {insideTemp:'°C',outsideTemp:'°C',insideHumidity:'%',outsideHumidity:'%',weight:' kg',soundDb:' dBFS'};
let socket=null, demo=true, reconnectTimer=null, toastTimer=null, lastWeight=null, lastAlertAt={}, alerts=[];
let readings = [];
let thresholds = {highTemp:36,lowTemp:10,highHumidity:85,weightChange:1.5};
let deviceHost = localStorage.getItem('beebot_host') || '';
let cameraUrl = localStorage.getItem('beebot_camera') || '';
const MAX_POINTS=250;

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function nowLabel(iso){return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}
function setConnection(connected,label){$('connectionDot').parentElement.classList.toggle('connected',connected);$('connectionText').textContent=label}
function setTag(id,text,type=''){$(id).textContent=text;$(id).className='state-tag'+(type?' '+type:'')}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function showVal(id,v,digits=1){$(id).textContent=v===null||v===undefined||!Number.isFinite(Number(v))?'--':Number(v).toFixed(digits)}
function normalize(raw){
 const d={...raw};
 const aliases={insideTemp:['insideTemp','inside_temp','tempInside','temperature_inside'],insideHumidity:['insideHumidity','inside_humidity','humidityInside'],outsideTemp:['outsideTemp','outside_temp','tempOutside','temperature_outside'],outsideHumidity:['outsideHumidity','outside_humidity','humidityOutside'],weight:['weight','weightKg','weight_kg'],soundDb:['soundDb','sound_db','dbfs'],soundState:['soundState','sound_state'],servoOpen:['servoOpen','servo_open','ventOpen'],servoAngle:['servoAngle','servo_angle'],timestamp:['timestamp','time','ts']};
 for(const [key,keys] of Object.entries(aliases)){if(d[key]===undefined){const found=keys.find(k=>d[k]!==undefined);if(found)d[key]=d[found]}}
 for(const k of metricKeys)d[k]=num(d[k]);
 if(d.timestamp===undefined)d.timestamp=new Date().toISOString();
 else if(typeof d.timestamp==='number')d.timestamp=new Date(d.timestamp<1e12?d.timestamp*1000:d.timestamp).toISOString();
 else {const parsed=Date.parse(d.timestamp);d.timestamp=Number.isNaN(parsed)?new Date().toISOString():new Date(parsed).toISOString()}
 return d;
}
function updateUI(d){
 showVal('insideTemp',d.insideTemp);showVal('insideHumidity',d.insideHumidity,0);showVal('outsideTemp',d.outsideTemp);showVal('outsideHumidity',d.outsideHumidity,0);showVal('weight',d.weight,2);showVal('soundDb',d.soundDb,1);
 const sound=(d.soundState||'UNKNOWN').toString().toUpperCase();$('soundState').textContent=sound;setTag('soundTag',sound,sound==='ALARM'?'warn':sound==='QUIET'||sound==='ACTIVE'?'good':'');
 const open=d.servoOpen===true||String(d.servoOpen).toLowerCase()==='true'||Number(d.servoAngle)===180;
 const angle=d.servoAngle!==undefined?d.servoAngle:(open?180:(d.servoOpen===false?0:null));
 $('servoDetail').textContent=angle===null?'No servo status reported':`Reported position: ${angle}°`;
 setTag('servoState',angle===null?'UNKNOWN':open?'OPEN':'CLOSED',angle===null?'':open?'warn':'good');
 const hasSensorValue=metricKeys.some(k=>d[k]!==null);setTag('sensorState',hasSensorValue?'ONLINE':'CHECK DATA',hasSensorValue?'good':'warn');$('sensorDetail').textContent=hasSensorValue?'Latest data received':'Connected, but no valid sensor values received';
 $('lastUpdated').textContent='Updated '+nowLabel(d.timestamp);
 const high=Number($('tempThreshold').value)||36;
 if(d.insideTemp!==null && d.insideTemp>=high){$('hiveCondition').textContent='High inside temperature';$('hiveMessage').textContent='Inside temperature is at or above your configured threshold.';$('statusPill').textContent='CHECK HIVE';}
 else {$('hiveCondition').textContent=demo?'Demo readings active':'Sensor data received';$('hiveMessage').textContent=demo?'Sample values are being shown. Connect your ESP32 for real readings.':'Latest readings received from your ESP32.';$('statusPill').textContent=demo?'PREVIEW':'LIVE';}
}
function saveReading(raw){
 const d=normalize(raw);
 // Ignore repeated timestamp-only events only if no sensor values are present.
 if(!metricKeys.some(k=>d[k]!==null))return;
 readings.push(d);if(readings.length>MAX_POINTS)readings.shift();
 try{localStorage.setItem('beebot_history',JSON.stringify(readings))}catch(e){}
 updateUI(d);checkAlerts(d);renderCharts();renderRows();
}
function loadHistory(){try{const parsed=JSON.parse(localStorage.getItem('beebot_history')||'[]');if(Array.isArray(parsed))readings=parsed.slice(-MAX_POINTS)}catch(e){readings=[]}if(readings.length){updateUI(normalize(readings[readings.length-1]));renderCharts();renderRows()}}
function drawChart(canvasId,key){
 const canvas=$(canvasId);if(!canvas)return;
 const rect=canvas.getBoundingClientRect();const width=Math.max(260,rect.width||500),height=Number(canvas.getAttribute('height'))||180;
 const ratio=window.devicePixelRatio||1;canvas.width=width*ratio;canvas.height=height*ratio;canvas.style.height=height+'px';
 const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,width,height);
 const points=readings.filter(r=>Number.isFinite(Number(r[key]))).slice(-60);
 const pad={l:38,r:12,t:16,b:25},cw=width-pad.l-pad.r,ch=height-pad.t-pad.b;
 ctx.font='10px DM Sans, sans-serif';ctx.lineWidth=1;ctx.strokeStyle='#edf1ed';ctx.fillStyle='#89958c';
 for(let i=0;i<4;i++){const y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(width-pad.r,y);ctx.stroke()}
 if(points.length===0){ctx.fillStyle='#89958c';ctx.textAlign='center';ctx.fillText('Waiting for readings…',width/2,height/2);return}
 const vals=points.map(p=>Number(p[key]));let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min-=1;max+=1}const extra=(max-min)*.12;min-=extra;max+=extra;
 for(let i=0;i<4;i++){const v=max-(max-min)*i/3;ctx.textAlign='right';ctx.fillText(v.toFixed(1),pad.l-7,pad.t+ch*i/3+3)}
 ctx.strokeStyle='#329565';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.beginPath();
 points.forEach((p,i)=>{const x=pad.l+(points.length===1?cw/2:i*cw/(points.length-1));const y=pad.t+(max-Number(p[key]))/(max-min)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
 const last=points[points.length-1],lx=pad.l+(points.length===1?cw/2:(points.length-1)*cw/(points.length-1)),ly=pad.t+(max-Number(last[key]))/(max-min)*ch;
 ctx.fillStyle='#329565';ctx.beginPath();ctx.arc(lx,ly,4,0,Math.PI*2);ctx.fill();
 ctx.textAlign='left';ctx.fillStyle='#89958c';ctx.fillText(nowLabel(points[0].timestamp),pad.l,height-7);ctx.textAlign='right';ctx.fillText(nowLabel(points[points.length-1].timestamp),width-pad.r,height-7);
}
function renderCharts(){const k=$('overviewChartMetric').value;drawChart('overviewChart',k);$('overviewLegend').textContent=labels[k]||k;$('chartPointCount').textContent=readings.length+' samples';drawChart('historyChart',$('historyMetric').value);const valid=readings.filter(r=>Number.isFinite(Number(r[$('historyMetric').value])));if(valid.length){const vs=valid.map(r=>Number(r[$('historyMetric').value]));$('historySummary').textContent=`${valid.length} samples · Min ${Math.min(...vs).toFixed(2)}${units[$('historyMetric').value]||''} · Max ${Math.max(...vs).toFixed(2)}${units[$('historyMetric').value]||''} · Latest ${vs[vs.length-1].toFixed(2)}${units[$('historyMetric').value]||''}`}else $('historySummary').textContent='No readings for this measurement yet.'}
function renderRows(){const body=$('historyRows');const rows=readings.slice(-20).reverse();if(!rows.length){body.innerHTML='<tr><td colspan="7">Waiting for sensor data…</td></tr>';return}body.innerHTML=rows.map(r=>`<tr><td>${new Date(r.timestamp).toLocaleString()}</td><td>${fmt(r.insideTemp,1)}</td><td>${fmt(r.insideHumidity,0)}</td><td>${fmt(r.outsideTemp,1)}</td><td>${fmt(r.outsideHumidity,0)}</td><td>${fmt(r.weight,2)}</td><td>${fmt(r.soundDb,1)}</td></tr>`).join('')}
function fmt(v,n){return v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toFixed(n)}
function checkAlerts(d){
 const t=Date.now();
 function add(key,title,message){if(t-(lastAlertAt[key]||0)<60000)return;lastAlertAt[key]=t;alerts.unshift({time:new Date().toISOString(),title,message});alerts=alerts.slice(0,60);renderAlerts();try{localStorage.setItem('beebot_alerts',JSON.stringify(alerts))}catch(e){}if('Notification'in window&&Notification.permission==='granted')new Notification('BeeBot: '+title,{body:message})}
 if(d.insideTemp!==null&&d.insideTemp>=Number($('tempThreshold').value))add('highTemp','High inside temperature',`Reading ${d.insideTemp.toFixed(1)}°C reached the configured threshold.`);
 if(d.insideTemp!==null&&d.insideTemp<=Number($('lowTempThreshold').value))add('lowTemp','Low inside temperature',`Reading ${d.insideTemp.toFixed(1)}°C is at or below the configured threshold.`);
 if(d.insideHumidity!==null&&d.insideHumidity>=Number($('humidityThreshold').value))add('highHumidity','High inside humidity',`Reading ${d.insideHumidity.toFixed(0)}% reached the configured threshold.`);
 if(d.weight!==null&&lastWeight!==null&&Math.abs(d.weight-lastWeight)>=Number($('weightThreshold').value))add('weightChange','Large weight change',`Weight changed by ${(d.weight-lastWeight).toFixed(2)} kg between received samples.`);
 if(d.weight!==null)lastWeight=d.weight;
 if(String(d.soundState).toUpperCase()==='ALARM')add('soundAlarm','Bee sound alarm','The ESP32 reported ALARM sound classification.');
}
function renderAlerts(){const list=$('alertList');$('alertBadge').textContent=alerts.length;if(!alerts.length){list.innerHTML='<div class="empty-state">No alerts yet. Events will appear here when readings cross a threshold.</div>';return}list.innerHTML=alerts.slice(0,30).map(a=>`<div class="alert-item"><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.message)}</p><time>${new Date(a.time).toLocaleString()}</time></div>`).join('')}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function connect(){
 if(!deviceHost){toast('Enter your ESP32 IP in Connection settings first.');showPage('settings');return}
 disconnect(false);demo=false;
 const url=(deviceHost.startsWith('ws://')||deviceHost.startsWith('wss://'))?deviceHost:`ws://${deviceHost.replace(/^https?:\/\//,'').replace(/\/$/,'')}/ws`;
 try{socket=new WebSocket(url)}catch(e){setConnection(false,'Connection error');toast('Could not open WebSocket. Check the host and URL.');return}
 setConnection(false,'Connecting…');$('demoToggle').textContent='Demo data: OFF';
 socket.onopen=()=>{setConnection(true,'ESP32 connected');toast('Connected to BeeBot ESP32')};
 socket.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.type==='status'){return}saveReading(data)}catch(e){console.warn('Ignoring non-JSON message',e)}};
 socket.onerror=()=>{setConnection(false,'Connection error')};
 socket.onclose=()=>{setConnection(false,'Disconnected');if(!demo&&deviceHost) {clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>{if(!demo)connect()},4000)}};
}
function disconnect(showToast=true){if(socket){const s=socket;socket=null;s.onclose=null;try{s.close()}catch(e){}}clearTimeout(reconnectTimer);if(showToast)toast('Disconnected from ESP32');setConnection(false,'Disconnected')}
function showPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(page+'Page').classList.remove('hidden');document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const titles={overview:['Hive overview','A live snapshot of your colony environment.'],history:['History & charts','Explore and export measurements saved on this device.'],camera:['Live camera','View a browser-compatible camera stream on your local network.'],alerts:['Alerts & events','Review threshold events generated by new readings.'],settings:['Connection settings','Configure the ESP32 and optional camera stream.']};$('pageTitle').textContent=titles[page][0];$('pageSubtitle').textContent=titles[page][1];if(page==='history')drawChart('historyChart',$('historyMetric').value);if(page==='camera')applyCamera()}
function applyCamera(){if(!cameraUrl){$('cameraImage').classList.add('hidden');$('cameraImage').removeAttribute('src');$('cameraStatus').textContent='Camera not configured';$('cameraFrame').querySelector('.camera-placeholder').classList.remove('hidden');return}$('cameraImage').classList.add('hidden');$('cameraFrame').querySelector('.camera-placeholder').classList.add('hidden');$('cameraStatus').textContent='Loading camera stream…';$('cameraImage').src=cameraUrl+(cameraUrl.includes('?')?'&':'?')+'t='+Date.now();$('cameraImage').onload=()=>{$('cameraImage').classList.remove('hidden');$('cameraStatus').textContent='Camera stream loaded'};$('cameraImage').onerror=()=>{$('cameraImage').classList.add('hidden');$('cameraFrame').querySelector('.camera-placeholder').classList.remove('hidden');$('cameraStatus').textContent='Could not load stream — check URL/format';}}
function seedDemo(){const now=Date.now();for(let i=24;i>=0;i--){const x=i;saveReading({timestamp:new Date(now-x*60000).toISOString(),insideTemp:32.2+Math.sin(x/3)*1.1+(Math.random()-.5)*.4,insideHumidity:67+Math.sin(x/4)*3+(Math.random()-.5)*2,outsideTemp:29.8+Math.sin(x/5)*1.8+(Math.random()-.5)*.5,outsideHumidity:73+Math.cos(x/5)*4,weight:24.8-x*.003+(Math.random()-.5)*.05,soundDb:-43+Math.sin(x/3)*4,soundState:x%7===0?'ACTIVE':'QUIET',servoOpen:false,servoAngle:0})}}
function exportCsv(){if(!readings.length){toast('No readings to export yet.');return}const keys=['timestamp',...metricKeys,'soundState','servoOpen','servoAngle'];const csv=[keys.join(','),...readings.map(r=>keys.map(k=>{const v=r[k]??'';return '"'+String(v).replace(/"/g,'""')+'"'}).join(','))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download='beebot-history.csv';a.click();URL.revokeObjectURL(a.href)}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
$('overviewChartMetric').addEventListener('change',renderCharts);$('historyMetric').addEventListener('change',()=>drawChart('historyChart',$('historyMetric').value));
$('connectDevice').addEventListener('click',()=>{deviceHost=$('deviceHost').value.trim();cameraUrl=$('cameraUrl').value.trim();localStorage.setItem('beebot_host',deviceHost);localStorage.setItem('beebot_camera',cameraUrl);applyCamera();connect()});
$('disconnectDevice').addEventListener('click',()=>{disconnect();demo=false;$('demoToggle').textContent='Demo data: OFF'});
$('demoToggle').addEventListener('click',()=>{if(demo){demo=false;disconnect(false);$('demoToggle').textContent='Demo data: OFF';setConnection(false,'Demo paused');toast('Demo data paused')}else{demo=true;disconnect(false);$('demoToggle').textContent='Demo data: ON';setConnection(false,'Demo mode');seedDemo();toast('Demo data enabled')}});
$('reloadCamera').addEventListener('click',applyCamera);
$('exportCsv').addEventListener('click',exportCsv);
$('clearHistory').addEventListener('click',()=>{if(confirm('Delete reading history saved in this browser?')){readings=[];localStorage.removeItem('beebot_history');renderCharts();renderRows();toast('Local history cleared')}});
$('saveThresholds').addEventListener('click',()=>{thresholds={highTemp:Number($('tempThreshold').value),lowTemp:Number($('lowTempThreshold').value),highHumidity:Number($('humidityThreshold').value),weightChange:Number($('weightThreshold').value)};localStorage.setItem('beebot_thresholds',JSON.stringify(thresholds));toast('Thresholds saved on this device')});
$('requestNotifications').addEventListener('click',async()=>{if(!('Notification'in window)){toast('This browser does not support notifications.');return}const p=await Notification.requestPermission();toast(p==='granted'?'Browser notifications enabled.':'Notifications not enabled.')});
$('clearAlerts').addEventListener('click',()=>{alerts=[];localStorage.removeItem('beebot_alerts');renderAlerts();toast('Events cleared')});
window.addEventListener('resize',()=>{clearTimeout(window._chartResize);window._chartResize=setTimeout(renderCharts,150)});
$('deviceHost').value=deviceHost;$('cameraUrl').value=cameraUrl;
try{thresholds={...thresholds,...JSON.parse(localStorage.getItem('beebot_thresholds')||'{}')};$('tempThreshold').value=thresholds.highTemp;$('lowTempThreshold').value=thresholds.lowTemp;$('humidityThreshold').value=thresholds.highHumidity;$('weightThreshold').value=thresholds.weightChange;alerts=JSON.parse(localStorage.getItem('beebot_alerts')||'[]')}catch(e){}
loadHistory();renderAlerts();
if(deviceHost){$('demoToggle').textContent='Demo data: OFF';demo=false;connect()}else{setConnection(false,'Demo mode');seedDemo()}


// Progressive Web App installation support. The dashboard's WebSocket logic remains unchanged.
let deferredInstallPrompt = null;
const installButton = $('installApp');
window.addEventListener('beforeinstallprompt', event => {
 event.preventDefault();
 deferredInstallPrompt = event;
 if (installButton) installButton.hidden = false;
});
if (installButton) installButton.addEventListener('click', async () => {
 if (!deferredInstallPrompt) {
  toast('Use your browser menu and choose Install app or Add to Home Screen.');
  return;
 }
 deferredInstallPrompt.prompt();
 await deferredInstallPrompt.userChoice;
 deferredInstallPrompt = null;
 installButton.hidden = true;
});
window.addEventListener('appinstalled', () => {
 if (installButton) installButton.hidden = true;
 toast('BeeBot Connect was installed.');
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
 window.addEventListener('load', () => {
  navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('BeeBot offline support could not be enabled:', err));
 });
}
