/* GramSutra feature pack: live-data adapters, photo crop review, satellite NDVI,
   irrigation guidance, marketplace, government services, voice, and offline calendar. */
(() => {
  'use strict';
  const $f = id => document.getElementById(id);
  const api = (window.GRAMSUTRA_API || '').replace(/\/$/, '');
  const escF = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const langCode = {English:'en-IN',Hindi:'hi-IN',Bengali:'bn-IN',Telugu:'te-IN',Marathi:'mr-IN',Tamil:'ta-IN',Gujarati:'gu-IN',Kannada:'kn-IN',Malayalam:'ml-IN',Punjabi:'pa-IN',Odia:'or-IN',Assamese:'as-IN',Urdu:'ur-IN'};
  const getLang = () => (typeof PROF !== 'undefined' && PROF.lang) || 'Hindi';
  const requestGeo = () => new Promise((resolve,reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported in this browser.'));
    navigator.geolocation.getCurrentPosition(p => resolve({lat:p.coords.latitude,lon:p.coords.longitude}), e => reject(new Error(e.code===1?'Location permission was denied.':'Could not read your location. Check GPS and try again.')), {enableHighAccuracy:true,timeout:15000,maximumAge:300000});
  });
  const readGeo = () => { try { return JSON.parse(localStorage.getItem('gs_geo') || 'null'); } catch (_) { return null; } };
  const saveGeo = g => { localStorage.setItem('gs_geo', JSON.stringify({...g,savedAt:new Date().toISOString()})); };

  // Add the new tools to Explore without changing the primary navigation.
  const extraModules = [
    ['fieldhealth','🛰️','Live satellite health','Draw your field and check NDVI'],
    ['irrigation','💧','Smart irrigation','Soil moisture + rain guidance'],
    ['farmcalendar','🗓️','Farm calendar','Offline task reminders'],
    ['marketplace','🛒','Farmer marketplace','Sell produce, rent equipment'],
    ['schemes','🏛️','Schemes & services','Official farmer portals']
  ];
  if (typeof tabs !== 'undefined') extraModules.forEach(m => { if (!tabs.some(t => t[0] === m[0])) tabs.push([m[0], '']); });
  const hub = $f('modgrid');
  if (hub) extraModules.forEach(m => {
    if (hub.querySelector(`[data-go="${m[0]}"]`)) return;
    const b = document.createElement('button'); b.className='mod'; b.dataset.go=m[0];
    b.innerHTML=`<span>${m[1]}</span><b>${m[2]}</b><small>${m[3]}</small>`; hub.appendChild(b);
  });
  ['fieldhealth','irrigation','farmcalendar','marketplace','schemes'].forEach(id => {
    const s=$f(id); if(s && !s.querySelector('.back')) { const b=document.createElement('button');b.className='back';b.textContent='← All features';b.dataset.go='hub';s.prepend(b); }
  });

  // Crop Doctor: camera/gallery preview, client-side resizing, and server-side vision analysis.
  const diagnosisInput=$f('diagnoseImage'), diagnosisPreview=$f('diagnosePreview');
  diagnosisInput?.addEventListener('change',()=>{
    const file=diagnosisInput.files?.[0];
    if(!file){diagnosisPreview.hidden=true;diagnosisPreview.style.display='none';return;}
    if(diagnosisPreview.dataset.objectUrl) URL.revokeObjectURL(diagnosisPreview.dataset.objectUrl);
    const url=URL.createObjectURL(file);diagnosisPreview.src=url;diagnosisPreview.dataset.objectUrl=url;
    diagnosisPreview.hidden=false;diagnosisPreview.style.display='block';
    $f('diagnoseStatus').textContent='Photo selected. Check that the affected part is clear, then analyse.';
    $f('diagnoseResult').hidden=true;
  });
  async function prepareDiagnosisImage(file){
    const url=URL.createObjectURL(file);
    try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1400/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.82).split(',')[1];resolve({mimeType:'image/jpeg',imageBase64:data});};img.onerror=()=>reject(new Error('Could not open this image. Please try another photo.'));img.src=url;});}finally{URL.revokeObjectURL(url);}
  }
  $f('diagnoseBtn')?.addEventListener('click', async () => {
    const file=diagnosisInput?.files?.[0], status=$f('diagnoseStatus'), out=$f('diagnoseResult'), button=$f('diagnoseBtn');
    out.hidden=true;
    if (!file) { status.textContent='Take a photo or choose a crop photo first.'; return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size>7*1024*1024) { status.textContent='Use a JPEG, PNG or WEBP photo under 7 MB.'; return; }
    button.disabled=true;status.textContent='Preparing your photo…';
    try {
      const prepared=await prepareDiagnosisImage(file);status.textContent='Pragati AI is checking the crop for visible symptoms…';
      const response=await fetch(api+'/api/crop-diagnose',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...prepared,crop:$f('diagnoseCrop').value,notes:$f('diagnoseNotes').value,language:getLang()})});
      const result=await response.json().catch(()=>({}));if(!response.ok) throw new Error(result.error||'Photo analysis failed.');
      out.textContent=result.text+'\n\n'+result.advisory;out.hidden=false;status.textContent='Analysis complete · '+(result.provider||'AI')+' · '+(result.model||'')+' · '+new Date().toLocaleString();
    } catch(e) { status.textContent=e.message; }
    finally {button.disabled=false;}
  });

  // Leaflet satellite imagery with a farmer-drawn polygon and real Sentinel-2 NDVI when enabled.
  let fmap=null, fpolygon=null, fieldPoints=[], fieldMarkers=[], ndviOverlay=null;
  const FIELD_KEY='gs_field_boundary_v1';
  function fieldRenderPoints(){
    if (!fmap) return;
    if(fpolygon){fmap.removeLayer(fpolygon);fpolygon=null;}
    fieldMarkers.forEach(m=>fmap.removeLayer(m));fieldMarkers=[];
    if(fieldPoints.length>=3){fpolygon=L.polygon(fieldPoints,{color:'#fff',weight:3,fillColor:'#18a34a',fillOpacity:.18}).addTo(fmap);}
    else fieldPoints.forEach(p=>fieldMarkers.push(L.circleMarker(p,{radius:5,color:'#fff',weight:2,fillColor:'#178e3b',fillOpacity:1}).addTo(fmap)));
    $f('fieldCount').textContent=fieldPoints.length?`${fieldPoints.length} boundary points · ${fieldPoints.length>=3?'Field polygon ready':'Add '+(3-fieldPoints.length)+' more point(s)'}`:'No boundary drawn yet.';
    try{localStorage.setItem(FIELD_KEY,JSON.stringify(fieldPoints));}catch(_){ }
  }
  function initMap(){
    if(!window.L || fmap) return;
    const g=readGeo(); fmap=L.map('fieldMap',{zoomControl:true}).setView(g?[g.lat,g.lon]:[22.9,78.5],g?14:5);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery © Esri and contributors'}).addTo(fmap);
    try { fieldPoints=JSON.parse(localStorage.getItem(FIELD_KEY)||'[]'); } catch(_){fieldPoints=[];}
    fieldRenderPoints();
    fmap.on('click', e=>{fieldPoints.push([e.latlng.lat,e.latlng.lng]);fieldRenderPoints();});
    setTimeout(()=>fmap.invalidateSize(),150);
  }
  function loadLeaflet(){
    if(window.L){initMap();return;}
    if(document.getElementById('leaflet-css')) return;
    const css=document.createElement('link');css.id='leaflet-css';css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);
    const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.onload=initMap;js.onerror=()=>$f('fieldHealthStatus').textContent='Map library could not load. Check your internet connection.';document.head.appendChild(js);
  }
  document.body.addEventListener('click', e=>{const target=e.target.closest('[data-go="fieldhealth"]');if(target)setTimeout(loadLeaflet,120);});
  $f('fieldLocate')?.addEventListener('click',async()=>{try{const g=await requestGeo();saveGeo(g);loadLeaflet();if(fmap)fmap.setView([g.lat,g.lon],15);$f('fieldHealthStatus').textContent='Map centred on your current location. Tap around the field boundary to draw it.';}catch(e){$f('fieldHealthStatus').textContent=e.message;}});
  $f('fieldUndo')?.addEventListener('click',()=>{fieldPoints.pop();fieldRenderPoints();});
  $f('fieldClear')?.addEventListener('click',()=>{fieldPoints=[];if(ndviOverlay&&fmap){fmap.removeLayer(ndviOverlay);ndviOverlay=null;}fieldRenderPoints();$f('fieldHealthStatus').textContent='Boundary cleared.';});
  $f('fieldAnalyse')?.addEventListener('click',async()=>{
    if(!fmap)loadLeaflet();
    if(fieldPoints.length<3){$f('fieldHealthStatus').textContent='Add at least three boundary points on the map.';return;}
    const ring=fieldPoints.map(([lat,lon])=>[lon,lat]);ring.push(ring[0]);
    $f('fieldHealthStatus').textContent='Requesting the latest low-cloud Sentinel-2 imagery…';
    try{
      const r=await fetch(api+'/api/satellite/ndvi',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({geometry:{type:'Polygon',coordinates:[ring]}})});
      if(!r.ok){const e=await r.json();throw new Error(e.error||'Satellite analysis unavailable.');}
      const blob=await r.blob(), url=URL.createObjectURL(blob), bounds=L.latLngBounds(fieldPoints);
      if(ndviOverlay)fmap.removeLayer(ndviOverlay);ndviOverlay=L.imageOverlay(url,bounds,{opacity:.72,interactive:false}).addTo(fmap);fmap.fitBounds(bounds);
      $f('fieldHealthStatus').textContent='Sentinel-2 NDVI overlay loaded (latest available low-cloud scene from the last 45 days). Red/orange indicate lower vegetation greenness; green indicates higher greenness. This is not a diagnosis.';
    }catch(e){$f('fieldHealthStatus').textContent=e.message;}
  });

  // Live weather via Open-Meteo, with geolocation requested only after an explicit tap.
  async function loadWeatherAt(g){
    const wx=$f('liveWeatherStatus'); if(wx)wx.textContent='Loading live forecast…';
    try{
      const r=await fetch(`${api}/api/weather?lat=${encodeURIComponent(g.lat)}&lon=${encodeURIComponent(g.lon)}`);const j=await r.json();if(!r.ok)throw new Error(j.error||'Weather not available');
      localStorage.setItem('gs_weather_cache',JSON.stringify({at:j.fetchedAt,source:j.source,data:j.data}));
      const d=j.data,c=d.current||{},day=d.daily||{},hourly=d.hourly||{};const hourStart=Math.max(0,hourly.time?.indexOf(c.time) ?? 0);const next24=hourly.precipitation_probability?.slice(hourStart,hourStart+24)||[];const validRain=next24.filter(Number.isFinite);const rain24=validRain.length?Math.max(...validRain):null;const precip=day.precipitation_probability_max?.[0];window.GS_LIVE_WEATHER={current:c,daily:day,rainChanceNext24h:rain24,fetchedAt:j.fetchedAt};
      $f('liveWeatherStatus').innerHTML=`<div class="tiles"><div class="tile">🌡️ Current temperature<b>${Math.round(c.temperature_2m)}°C</b></div><div class="tile">💧 Humidity<b>${c.relative_humidity_2m}%</b></div><div class="tile">🌧️ Rain chance today<b>${precip==null?'—':precip+'%'}</b></div><div class="tile">💨 Wind<b>${Math.round(c.wind_speed_10m||0)} km/h</b></div></div><p class="note">Source: ${escF(j.source)} · Updated ${new Date(j.fetchedAt).toLocaleString()} · Coordinates ${g.lat.toFixed(3)}, ${g.lon.toFixed(3)}</p>`;
      $f('irRain').value=rain24??precip??0;$f('rain').value=precip??0;$f('feed').value='1';const demoOption=$f('feed').querySelector('option[value="1"]');if(demoOption)demoOption.textContent='Live forecast loaded';if(typeof render==='function')render();
      const top=document.querySelector('.top-weather');if(top)top.innerHTML=`🌤️ <b>${Math.round(c.temperature_2m)}°C</b><small>Live · Open-Meteo</small>`;
    }catch(e){if(wx){try{const cached=JSON.parse(localStorage.getItem('gs_weather_cache')||'null');if(cached?.data){const c=cached.data.current||{},age=cached.fetchedAt||cached.at;wx.innerHTML=`<p><b>Saved forecast (may be out of date)</b></p><p>${Number.isFinite(c.temperature_2m)?Math.round(c.temperature_2m)+'°C':''} · ${escF(cached.source||'Weather provider')}</p><p class="note">Last saved: ${new Date(age).toLocaleString()}. Live refresh failed: ${escF(e.message)}</p>`;return;}}catch(_){ }wx.textContent=e.message;}}
  }
  const weatherCard=document.querySelector('#weather .card');
  if(weatherCard && !$f('liveWeatherCard')){
    const card=document.createElement('div');card.id='liveWeatherCard';card.className='task';card.innerHTML='<h3>🌍 Live local forecast</h3><p class="note">Uses your location only when you request it.</p><button class="btn primary" id="wxLocate">Use my location & load weather</button><div id="liveWeatherStatus" class="note" style="margin-top:10px">No live forecast loaded yet.</div>';
    weatherCard.appendChild(card);
  }
  $f('wxLocate')?.addEventListener('click',async()=>{try{const g=await requestGeo();saveGeo(g);await loadWeatherAt(g);}catch(e){$f('liveWeatherStatus').textContent=e.message;}});
  const oldGeo=readGeo(); if(oldGeo) { /* do not automatically re-request or transmit a saved location */ }

  // Real Agmarknet mandi records through data.gov.in (key remains on server).
  const marketSection=$f('market');
  if(marketSection && !$f('liveMandiCard')){
    const card=document.createElement('div');card.id='liveMandiCard';card.className='card';card.innerHTML=`<h2>📈 Live mandi prices</h2><p class="note">Agmarknet records from data.gov.in. The server needs a data.gov.in API key.</p><div class="row"><div><label for="mandiCommodity">Commodity</label><input id="mandiCommodity" value="Wheat" placeholder="Wheat, potato, tomato"></div><div><label for="mandiState">State (optional)</label><input id="mandiState" placeholder="e.g. Uttar Pradesh"></div><div><label for="mandiDistrict">District (optional)</label><input id="mandiDistrict" placeholder="e.g. Meerut"></div></div><button class="btn primary" id="mandiLoad">Load market arrivals</button><div id="mandiStatus" class="status"></div><div id="mandiTrendPanel" class="task" hidden></div><div id="mandiRows" class="tbl"></div>`;
    marketSection.appendChild(card);
  }
  $f('mandiLoad')?.addEventListener('click',async()=>{
    const status=$f('mandiStatus'), rows=$f('mandiRows');status.textContent='Loading official mandi records…';rows.innerHTML='';
    try{const q=new URLSearchParams({commodity:$f('mandiCommodity').value,state:$f('mandiState').value,district:$f('mandiDistrict').value});const r=await fetch(api+'/api/market?'+q.toString());const j=await r.json();if(!r.ok)throw new Error(j.error||'Mandi data unavailable');
      if(!j.records.length){status.textContent='No matching arrivals were returned. Try a broader commodity or state name.';return;}
      rows.innerHTML='<table><thead><tr><th>Commodity</th><th>Market</th><th>Arrival date</th><th>Min ₹/qtl</th><th>Max ₹/qtl</th><th>Modal ₹/qtl</th></tr></thead><tbody>'+j.records.map(x=>`<tr><td>${escF(x.commodity)}</td><td>${escF(x.market)}, ${escF(x.district)}</td><td>${escF(x.arrival_date)}</td><td>${escF(x.min_price)}</td><td>${escF(x.max_price)}</td><td><b>${escF(x.modal_price)}</b></td></tr>`).join('')+'</tbody></table>';
      const byDate=new Map();j.records.forEach(x=>{const v=Number(String(x.modal_price||'').replace(/,/g,''));if(Number.isFinite(v)&&v>0){const k=String(x.arrival_date||'Unknown');const a=byDate.get(k)||[];a.push(v);byDate.set(k,a);}});
      const points=[...byDate].map(([date,vs])=>({date,value:vs.reduce((a,b)=>a+b,0)/vs.length})).reverse().slice(-14);
      const trend=$f('mandiTrendPanel');
      if(points.length>=2){const vals=points.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),range=Math.max(1,max-min),xy=points.map((x,i)=>[40+i*(520/(points.length-1)),140-((x.value-min)/range)*105]),path=xy.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '),pct=((vals.at(-1)-vals[0])/Math.max(1,vals[0])*100),direction=pct>1?'up':pct<-1?'down':'mostly flat';
        trend.hidden=false;trend.innerHTML=`<b>Recent modal-price trend · ${escF($f('mandiCommodity').value)}</b><svg viewBox="0 0 600 180" role="img" aria-label="Recent mandi modal price trend" style="width:100%;height:auto;margin-top:8px"><path d="M40 140H560" stroke="#9cb7a2" fill="none"/><path d="${path}" stroke="#119447" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${xy.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#119447"/>`).join('')}<text x="40" y="164" font-size="11" fill="#53675a">${escF(points[0].date)}</text><text x="560" y="164" text-anchor="end" font-size="11" fill="#53675a">${escF(points.at(-1).date)}</text><text x="40" y="18" font-size="12" fill="#53675a">₹${Math.round(max).toLocaleString('en-IN')} / qtl</text><text x="40" y="154" font-size="12" fill="#53675a">₹${Math.round(min).toLocaleString('en-IN')}</text></svg><p class="note">Across observed records, modal prices are ${direction} (${pct>=0?'+':''}${pct.toFixed(1)}% from the first to last date in this sample). This describes reported records only; it is not a price prediction.</p>`;
      }else{trend.hidden=false;trend.textContent='Not enough distinct arrival dates for a trend yet. Try a broader state/district filter.';}
      status.textContent=`${j.records.length} records · ${j.source} · Retrieved ${new Date(j.fetchedAt).toLocaleString()}. Prices are source-reported wholesale values, not guaranteed offers.`;
    }catch(e){status.textContent=e.message;}
  });

  // Smart irrigation: rule-based, explicitly explainable decision support.
  $f('irAdvice')?.addEventListener('click',()=>{
    const m=Number($f('irMoisture').value),rain=Number($f('irRain').value),crop=$f('irCrop').value,stage=$f('irStage').value;
    const out=$f('irResult');
    if(!Number.isFinite(m)||m<0||m>100||!Number.isFinite(rain)||rain<0||rain>100){out.textContent='Enter soil moisture and rain chance between 0 and 100.';return;}
    let title,reason,priority='Monitor';
    if(m>=80){title='Avoid adding water for now; inspect drainage.';reason='The soil-moisture value you entered is already high. Check whether water is standing and whether the root zone is aerated.';priority='High';}
    else if(rain>=70 && m>=45){title='Consider postponing irrigation and recheck after rain.';reason='A high rain probability plus moderate-to-high reported moisture may make immediate irrigation unnecessary.';priority='Caution';}
    else if(m<30 && rain<40){title='Inspect the root zone and consider irrigation.';reason='The moisture value is low and little rain is expected. Check soil at root depth before irrigating; avoid relying on a surface reading alone.';priority='Attention';}
    else {title='Continue monitoring; no strong irrigation signal from these inputs.';reason='Moisture and rain inputs do not indicate a clear immediate need. Recheck near the crop root zone, especially during '+stage.toLowerCase()+'.';}
    out.innerHTML=`<b>${priority}: ${escF(title)}</b><p>${escF(reason)}</p><p class="note">Inputs: ${escF(crop)}, ${escF(stage)}, ${m}% soil moisture, ${rain}% rain chance. Crop water needs also depend on soil texture, rooting depth, irrigation method and local advisories.</p>`;
  });

  // Offline-first farm calendar with optional account sync.
  const TASK_KEY='gs_farm_tasks_v1', TASK_DELETE_KEY='gs_farm_task_deletes_v1';let farmTasks=[], deletedTaskIds=[];
  try{deletedTaskIds=JSON.parse(localStorage.getItem(TASK_DELETE_KEY)||'[]');if(!Array.isArray(deletedTaskIds))deletedTaskIds=[];}catch(_){deletedTaskIds=[];}
  try{farmTasks=JSON.parse(localStorage.getItem(TASK_KEY)||'[]');if(!Array.isArray(farmTasks))farmTasks=[];}catch(_){farmTasks=[];}
  const localDate=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  if($f('taskDate'))$f('taskDate').value=localDate();
  const makeId=()=>{if(window.crypto?.randomUUID)return crypto.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});};
  function saveTasks(){localStorage.setItem(TASK_KEY,JSON.stringify(farmTasks));localStorage.setItem(TASK_DELETE_KEY,JSON.stringify(deletedTaskIds));renderTasks();syncTasksSoon();checkTaskAlerts();}
  function renderTasks(){
    const box=$f('taskList');if(!box)return;farmTasks.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    box.innerHTML=farmTasks.length?farmTasks.map(t=>`<div class="listing"><label class="chk"><input type="checkbox" data-task-done="${escF(t.id)}" ${t.done?'checked':''}><span><b>${escF(t.title)}</b><br><span class="meta">${escF(t.category)} · Due ${escF(t.date)}</span></span></label><button class="btn" data-task-delete="${escF(t.id)}">Delete</button></div>`).join(''):'<p class="note">No tasks yet. Add sowing, inspection, irrigation or harvest reminders above.</p>';
  }
  $f('taskAdd')?.addEventListener('click',()=>{const title=$f('taskTitle').value.trim(),date=$f('taskDate').value;if(!title||!date){$f('taskStatus').textContent='Enter a task and due date.';return;}farmTasks.push({id:makeId(),title,date,category:$f('taskCategory').value,done:false,updated_at:new Date().toISOString()});$f('taskTitle').value='';$f('taskStatus').textContent='Saved on this device.';saveTasks();});
  $f('taskList')?.addEventListener('change',e=>{const id=e.target.dataset.taskDone;if(!id)return;const t=farmTasks.find(x=>x.id===id);if(t){t.done=e.target.checked;t.updated_at=new Date().toISOString();saveTasks();}});
  $f('taskList')?.addEventListener('click',e=>{const id=e.target.dataset.taskDelete;if(id){farmTasks=farmTasks.filter(t=>t.id!==id);if(!deletedTaskIds.includes(id))deletedTaskIds.push(id);saveTasks();}});
  let syncTimer=null;
  async function syncTasksSoon(){if(syncTimer)clearTimeout(syncTimer);syncTimer=setTimeout(syncTasks,900);}
  async function syncTasks(){
    if(typeof sb==='undefined'||!sb||typeof communityUser==='undefined'||!communityUser)return;
    try{
      const uid=communityUser.id;
      const {data:remote,error}=await sb.from('farm_tasks').select('*').eq('user_id',uid);if(error)throw error;
      const byId=new Map(farmTasks.map(t=>[t.id,t]));
      if(deletedTaskIds.length){const del=await sb.from('farm_tasks').delete().eq('user_id',uid).in('id',deletedTaskIds);if(del.error)throw del.error;}
      (remote||[]).forEach(t=>{if(deletedTaskIds.includes(t.id))return;const local=byId.get(t.id);if(!local || new Date(t.updated_at)>new Date(local.updated_at||0))byId.set(t.id,{id:t.id,title:t.title,date:t.due_date,category:t.category,done:t.is_done,updated_at:t.updated_at});});
      farmTasks=[...byId.values()];
      if(farmTasks.length){const rows=farmTasks.map(t=>({id:t.id,user_id:uid,title:t.title,due_date:t.date,category:t.category,is_done:!!t.done,updated_at:t.updated_at||new Date().toISOString()}));const up=await sb.from('farm_tasks').upsert(rows);if(up.error)throw up.error;}
      deletedTaskIds=[];localStorage.setItem(TASK_DELETE_KEY,'[]');localStorage.setItem(TASK_KEY,JSON.stringify(farmTasks));renderTasks();$f('taskStatus').textContent='Synced with your GramSutra account. Offline changes will sync when you are connected.';
    }catch(e){console.warn('Farm task sync is offline/unavailable:',e.message);}
  }
  renderTasks();window.addEventListener('gramsutra-auth-ready',syncTasks);window.addEventListener('online',syncTasks);
  function checkTaskAlerts(){if(!('Notification'in window)||Notification.permission!=='granted')return;const due=farmTasks.filter(t=>!t.done&&t.date<=localDate());if(!due.length)return;const marker='gs_task_alert_'+localDate();if(localStorage.getItem(marker)==='1')return;try{new Notification('GramSutra: farm tasks due',{body:due.slice(0,3).map(t=>t.title).join(' · ')+(due.length>3?` · +${due.length-3} more`:''),tag:marker});localStorage.setItem(marker,'1');}catch(_){}}
  $f('taskNotify')?.addEventListener('click',async()=>{if(!('Notification'in window)){$f('taskStatus').textContent='Notifications are not supported by this browser.';return;}const perm=await Notification.requestPermission();$f('taskStatus').textContent=perm==='granted'?'Due-task alerts enabled. Alerts are checked when GramSutra is open.':'Notification permission was not granted.';checkTaskAlerts();});
  window.addEventListener('focus',checkTaskAlerts);checkTaskAlerts();

  // Marketplace listings: Supabase-backed public-to-members board, or clearly local-only drafts.
  const LOCAL_LISTINGS='gs_marketplace_local_v1';let localListings=[];
  try{localListings=JSON.parse(localStorage.getItem(LOCAL_LISTINGS)||'[]');if(!Array.isArray(localListings))localListings=[];}catch(_){localListings=[];}
  function marketplaceReady(){return typeof sb!=='undefined'&&!!sb&&typeof communityUser!=='undefined'&&!!communityUser;}
  async function loadInquiries(){
    const box=$f('marketInquiries');if(!box)return;
    if(!marketplaceReady()){box.innerHTML='<p class="note">Sign in to view or reply to marketplace inquiries.</p>';return;}
    try{
      const [received,sent]=await Promise.all([
        sb.from('listing_inquiries').select('id,message,response,status,created_at,profiles!listing_inquiries_sender_id_fkey(display_name),marketplace_listings!listing_inquiries_listing_id_fkey(title)').eq('owner_id',communityUser.id).order('created_at',{ascending:false}).limit(40),
        sb.from('listing_inquiries').select('id,message,response,status,created_at,marketplace_listings!listing_inquiries_listing_id_fkey(title)').eq('sender_id',communityUser.id).order('created_at',{ascending:false}).limit(40)
      ]);
      if(received.error)throw received.error;if(sent.error)throw sent.error;
      const html=[];
      (received.data||[]).forEach(x=>html.push(`<article class="listing"><b>Incoming · ${escF(x.marketplace_listings?.title||'Listing')}</b><p>${escF(x.message)}</p><div class="meta">From ${escF(x.profiles?.display_name||'Farmer')} · ${new Date(x.created_at).toLocaleString()} · ${escF(x.status)}</div>${x.response?`<p><b>Your reply:</b> ${escF(x.response)}</p>`:''}<button class="btn" data-inquiry-reply="${escF(x.id)}">${x.response?'Update reply':'Reply privately'}</button></article>`));
      (sent.data||[]).forEach(x=>html.push(`<article class="listing"><b>Sent · ${escF(x.marketplace_listings?.title||'Listing')}</b><p>${escF(x.message)}</p><div class="meta">${new Date(x.created_at).toLocaleString()} · ${escF(x.status)}</div>${x.response?`<p><b>Seller response:</b> ${escF(x.response)}</p>`:'<p class="note">Waiting for seller response.</p>'}</article>`));
      box.innerHTML=html.join('')||'<p class="note">No marketplace inquiries yet.</p>';
    }catch(e){box.textContent='Could not load inquiries: '+e.message;}
  }
  async function loadListings(){
    const box=$f('listingFeed');if(!box)return;
    const filter=$f('listingFilter').value, query=$f('listingSearch').value.toLowerCase().trim();
    let rows=[];
    if(marketplaceReady()){
      try{let q=sb.from('marketplace_listings').select('id,owner_id,listing_type,title,category,quantity,price,village,description,created_at,profiles(display_name)').eq('status','active').order('created_at',{ascending:false}).limit(100);if(filter!=='all')q=q.eq('listing_type',filter);const {data,error}=await q;if(error)throw error;rows=data||[];$f('listingStatus').textContent='Showing listings shared with signed-in GramSutra members.';}
      catch(e){$f('listingStatus').textContent='Marketplace backend issue: '+e.message;}
    }else {rows=localListings.filter(x=>filter==='all'||x.listing_type===filter);$f('listingStatus').textContent='Local preview only. Configure Supabase and sign in to publish listings to other farmers.';}
    rows=rows.filter(x=>(x.title+' '+x.category+' '+x.village+' '+x.description).toLowerCase().includes(query));
    box.innerHTML=rows.length?rows.map(x=>`<article class="listing"><h3>${x.listing_type==='equipment'?'🚜':x.listing_type==='inputs'?'🌱':'🌾'} ${escF(x.title)}</h3><div class="price">₹${Number(x.price||0).toLocaleString('en-IN')}${x.listing_type==='equipment'?' · rental rate':x.listing_type==='inputs'?' · farm input price':' '}</div><p>${escF(x.description||'')}</p><div class="meta">${x.listing_type==='equipment'?'Equipment rental':x.listing_type==='inputs'?'Seeds & farm inputs':'Produce'} · ${escF(x.category)} · ${escF(x.quantity||'Quantity not specified')} · 📍 ${escF(x.village||'Location not added')} · ${escF(x.profiles?.display_name||x.seller_name||'GramSutra farmer')}</div>${marketplaceReady()&&x.owner_id!==communityUser.id?`<button class="btn" data-listing-inquiry="${escF(x.id)}" data-listing-owner="${escF(x.owner_id)}">Contact seller</button>`:''}</article>`).join(''):'<p class="note">No listings match yet. Be the first to share produce or equipment.</p>';
    await loadInquiries();
  }
  $f('listingPublish')?.addEventListener('click',async()=>{
    const title=$f('listingTitle').value.trim(),price=Number($f('listingPrice').value);
    if(!title||!Number.isFinite(price)||price<0){$f('listingStatus').textContent='Enter a title and a valid non-negative price.';return;}
    const record={listing_type:$f('listingType').value,title,category:$f('listingCategory').value.trim(),quantity:$f('listingQty').value.trim(),price,village:$f('listingVillage').value.trim()||(typeof PROF!=='undefined'?PROF.village:''),description:$f('listingDesc').value.trim()};
    if(marketplaceReady()){
      const {error}=await sb.from('marketplace_listings').insert({...record,owner_id:communityUser.id});if(error){$f('listingStatus').textContent='Could not publish: '+error.message;return;}$f('listingStatus').textContent='Your listing is now visible to signed-in GramSutra members.';
    }else{
      localListings.unshift({...record,id:'local-'+Date.now(),seller_name:(typeof PROF!=='undefined'&&PROF.name)||'This device'});localStorage.setItem(LOCAL_LISTINGS,JSON.stringify(localListings));$f('listingStatus').textContent='Saved on this device only. Sign in with a configured GramSutra account to share it with others.';
    }
    ['listingTitle','listingCategory','listingQty','listingPrice','listingDesc'].forEach(id=>$f(id).value='');await loadListings();
  });
  $f('listingRefresh')?.addEventListener('click',loadListings);$f('listingFilter')?.addEventListener('change',loadListings);$f('listingSearch')?.addEventListener('input',loadListings);
  $f('listingFeed')?.addEventListener('click',async e=>{const b=e.target.closest('[data-listing-inquiry]');if(!b)return;const msg=prompt('Write a short message to the seller:','Hello, I am interested. Is this available?');if(!msg?.trim())return;if(!marketplaceReady()){alert('Sign in to send a seller inquiry.');return;}const {error}=await sb.from('listing_inquiries').insert({listing_id:b.dataset.listingInquiry,sender_id:communityUser.id,owner_id:b.dataset.listingOwner,message:msg.trim()});$f('listingStatus').textContent=error?'Inquiry could not be sent: '+error.message:'Inquiry sent privately to the seller.';if(!error)await loadInquiries();});
  $f('marketInquiries')?.addEventListener('click',async e=>{const b=e.target.closest('[data-inquiry-reply]');if(!b)return;const response=prompt('Write your private reply to this farmer:');if(!response?.trim())return;const {error}=await sb.from('listing_inquiries').update({response:response.trim(),status:'replied',responded_at:new Date().toISOString()}).eq('id',b.dataset.inquiryReply).eq('owner_id',communityUser.id);$f('listingStatus').textContent=error?'Reply not sent: '+error.message:'Reply saved privately. The farmer can see it in their marketplace messages.';if(!error)await loadInquiries();});
  window.addEventListener('gramsutra-auth-ready',loadListings);window.addEventListener('gramsutra-auth-out',loadListings);
  loadListings();

  // Official scheme entry points; do not state eligibility or benefit amounts as guaranteed.
  const schemes=[
    ['PM-KISAN','Income support scheme information and beneficiary services.','https://pmkisan.gov.in/'],
    ['Pradhan Mantri Fasal Bima Yojana','Crop insurance enrolment, notices and claim information.','https://pmfby.gov.in/'],
    ['Soil Health Card','Soil testing and nutrient-management information.','https://soilhealth.dac.gov.in/'],
    ['Kisan Credit Card','Explore agriculture credit and lender information.','https://www.myscheme.gov.in/'],
    ['myScheme','Search central and state government schemes by profile.','https://www.myscheme.gov.in/'],
    ['Agmarknet','Agricultural market arrivals and price information.','https://agmarknet.gov.in/'],
    ['Kisan Call Centre','Toll-free agriculture advice in local languages: 1800-180-1551.','https://www.dackkms.gov.in/Account/aboutus.aspx']
  ];
  $f('schemeList').innerHTML=schemes.map(s=>`<div class="scheme"><h3>${escF(s[0])}</h3><p class="note">${escF(s[1])}</p>${s[0]==='Kisan Call Centre'?'<a href="tel:18001801551">Call 1800-180-1551</a> · ':''}<a href="${s[2]}" target="_blank" rel="noopener">Open official portal ↗</a></div>`).join('');

  // Multi-language voice input and spoken Pragati AI replies.
  const askCard=document.querySelector('#ask .card');
  if(askCard&&!$f('pragatiVoiceTools')){const tools=document.createElement('div');tools.id='pragatiVoiceTools';tools.className='callbar';tools.innerHTML='<button class="btn" id="pragatiSpeak">🔊 Read last answer</button><button class="btn" id="pragatiSave">📌 Save answer</button><label class="chk" style="margin:0"><input id="pragatiAutoSpeak" type="checkbox"> Read answers aloud</label>';askCard.appendChild(tools);}
  function speakLast(){if(!('speechSynthesis'in window)){addMsg('tool','Speech output is not supported in this browser.');return;}const msgs=$f('msgs'),last=[...msgs.querySelectorAll('.msg.bot')].filter(x=>x.textContent.trim()&&x.textContent.trim()!=='Thinking…').pop();if(!last){addMsg('tool','Ask Pragati AI a question first.');return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(last.textContent);u.lang=langCode[getLang()]||'hi-IN';u.rate=.94;speechSynthesis.speak(u);}
  $f('pragatiSpeak')?.addEventListener('click',speakLast);
  const ADVICE_KEY='gs_saved_advice_v1';let savedAdvice=[];try{savedAdvice=JSON.parse(localStorage.getItem(ADVICE_KEY)||'[]');if(!Array.isArray(savedAdvice))savedAdvice=[];}catch(_){savedAdvice=[];}
  function renderSavedAdvice(){const box=$f('savedAdviceList');if(!box)return;box.innerHTML=savedAdvice.length?savedAdvice.map(n=>`<div class="listing"><div class="meta">${new Date(n.savedAt).toLocaleString()}</div><p>${escF(n.text)}</p><button class="btn" data-advice-delete="${escF(n.id)}">Remove</button></div>`).join(''):'<p class="note">No saved advice yet.</p>';}
  $f('pragatiSave')?.addEventListener('click',()=>{const last=[...$f('msgs').querySelectorAll('.msg.bot')].filter(x=>x.textContent.trim()&&x.textContent.trim()!=='Thinking…').pop();if(!last){addMsg('tool','Ask Pragati AI a question before saving an answer.');return;}savedAdvice.unshift({id:makeId(),text:last.textContent,savedAt:new Date().toISOString()});savedAdvice=savedAdvice.slice(0,100);localStorage.setItem(ADVICE_KEY,JSON.stringify(savedAdvice));renderSavedAdvice();addMsg('tool','Saved to your offline advice notebook.');});
  $f('savedAdviceList')?.addEventListener('click',e=>{const id=e.target.dataset.adviceDelete;if(id){savedAdvice=savedAdvice.filter(n=>n.id!==id);localStorage.setItem(ADVICE_KEY,JSON.stringify(savedAdvice));renderSavedAdvice();}});
  renderSavedAdvice();

  const autoKey='gs_pragati_auto_speak';$f('pragatiAutoSpeak').checked=localStorage.getItem(autoKey)==='1';$f('pragatiAutoSpeak')?.addEventListener('change',e=>localStorage.setItem(autoKey,e.target.checked?'1':'0'));
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(Recognition){$f('mic').style.display='';$f('mic').title='Speak in your selected language';$f('mic').onclick=()=>{try{const rec=new Recognition();rec.lang=langCode[getLang()]||'hi-IN';rec.interimResults=false;rec.maxAlternatives=1;rec.onstart=()=>addMsg('tool','🎤 Listening in '+getLang()+'…');rec.onresult=e=>{$f('q').value=e.results[0][0].transcript;send();};rec.onerror=()=>addMsg('tool','Could not recognise speech. Check microphone permission or type your question.');rec.start();}catch(e){addMsg('tool','Voice input could not start: '+e.message);}};}else{$f('mic').style.display='none';}
  const originalSend=typeof send==='function'?send:null;
  if(originalSend){
    send=async function(text){await originalSend(text);if($f('pragatiAutoSpeak')?.checked&&('speechSynthesis'in window))speakLast();};
  }

  // Keep feature modules initialized when Pragati AI opens them through an app tool.
  const baseShow=typeof show==='function'?show:null;
  if(baseShow){show=function(id){baseShow(id);if(id==='fieldhealth')setTimeout(loadLeaflet,140);if(id==='marketplace')loadListings();};}

  // Useful status hints and avoid presenting the illustrative dashboard values as live.
  const demoNote=document.querySelector('#home .map-note');if(demoNote)demoNote.textContent='Illustrative field-health preview · use Live satellite health to analyse a drawn field';
  if($f('top-village') && typeof PROF!=='undefined' && PROF.village)$f('top-village').textContent=PROF.village;
  const hash=location.hash.slice(1);if(extraModules.some(m=>m[0]===hash)){show(hash);if(hash==='fieldhealth')setTimeout(loadLeaflet,150);}
})();
