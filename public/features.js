/* GramSutra feature pack: live-data adapters, photo crop review, satellite NDVI,
   irrigation guidance, marketplace, government services, voice, and offline calendar. */
(() => {
  'use strict';
  const $f = id => document.getElementById(id);
  const api = (window.GRAMSUTRA_API || '').replace(/\/$/, '');
  const escF = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const langCode = {English:'en-IN',Hindi:'hi-IN',Bengali:'bn-IN',Telugu:'te-IN',Marathi:'mr-IN',Tamil:'ta-IN',Gujarati:'gu-IN',Kannada:'kn-IN',Malayalam:'ml-IN',Punjabi:'pa-IN',Odia:'or-IN',Assamese:'as-IN',Urdu:'ur-IN'};
  const getLang = () => {
    const lang = (typeof PROF !== 'undefined' && PROF.lang) || localStorage.getItem('gs_language') || 'Hindi';
    return lang in langCode ? lang : 'English';
  };
  const requestGeo = () => new Promise((resolve,reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported in this browser.'));
    navigator.geolocation.getCurrentPosition(p => resolve({lat:p.coords.latitude,lon:p.coords.longitude}), e => reject(new Error(e.code===1?'Location permission was denied.':'Could not read your location.')));
  });
  const readGeo = () => { try { return JSON.parse(localStorage.getItem('gs_geo') || 'null'); } catch (_) { return null; } };
  const saveGeo = g => { localStorage.setItem('gs_geo', JSON.stringify({...g,savedAt:new Date().toISOString()})); };

  function speakText(text, languageName = getLang()) {
    if (!('speechSynthesis' in window) || !text || !String(text).trim()) return false;
    const utterance = new SpeechSynthesisUtterance(String(text).trim());
    const locale = langCode[languageName] || langCode.English || 'en-IN';
    utterance.lang = locale;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => (v.lang || '').toLowerCase().startsWith(locale.toLowerCase().slice(0,2))) || voices.find(v => (v.lang || '').toLowerCase().startsWith((locale.split('-')[0] || 'en').toLowerCase())) || voices[0];
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function speakLastReply() {
    const msgs = $f('msgs');
    if (!msgs || !('speechSynthesis' in window)) return false;
    const last = [...msgs.querySelectorAll('.msg.bot')].filter(x => x.textContent.trim() && x.textContent.trim() !== 'Thinking…').pop();
    if (!last) return false;
    return speakText(last.textContent.trim(), getLang());
  }

  const voiceRoutes = [
    {id:'home', names:['home','dashboard','होम','मुख्य पृष्ठ','হোম','హోమ్','முகப்பு','मुख्य பக்கம்','મુખ્ય પૃષ્ઠ','मुख्यपृष्ठ','घर','मुख्य पन्ना']},
    {id:'weather', names:['weather','forecast','मौसम','আবহাওয়া','వాతావరణం','வானிலை','હવામાન','ಹವಾಮಾನ','മഴ','ਮੌਸਮ','আবহাওয়া']},
    {id:'crop', names:['crop doctor','crop diagnosis','diagnose crop','फसल डॉक्टर','फसल की बीमारी','শস্য রোগ','పంట వైద్యుడు','விவசாய மருத்துவர்','પાક डॉक्टर','ಕೃಷಿ ವೈದ್ಯ']},
    {id:'market', names:['market','market rates','mandi rates','मंडी भाव','বাজার দর','మార్కెట్ ధరలు','சந்தை விலை','માર્કેટ ભાવ','ಮಾರುಕಟ್ಟೆ ಬೆಲೆ']},
    {id:'biz', names:['business','farm business','calculator','व्यवसाय','खेती का हिसाब','ব্যবসা','వ్యాపారం','வணிகம்','વ્યાવસાય','કૃષિ વ્યવસાય']},
    {id:'hub', names:['explore','features','all features','एक्सप्लोर','सभी फीचर','অন্বেষণ','అన్వేషించండి','ಆರಾಯಿಸುವುದು','સभी ફીચર્સ']},
    {id:'sat', names:['satellite','satellite map','उपग्रह नक्शा','স্যাটেলাইট মানচিত্র','ఉపగ్రహ మ్యాప్','செயற்கைக்கோள்','સેટેલાઇટ']},
    {id:'gis', names:['my fields','field map','खेत का नक्शा','আমার জমি','నా పొలాలు','என் வயல்கள்','મારા ખેતરો','ನಮ್ಮ ಕ್ಷೇತ್ರ']},
    {id:'coop', names:['cooperative','co-op','सहकारी','সমবায়','సహకార','கூட்டுறவு','સહકારી','ಸಹಕಾರಿ']},
    {id:'robot', names:['robot','tractor robot','रोबोट','রোবট','రోబోట్','రాబోట్','റോബോട്ട്','ट्रैक्टर रोबोट']},
    {id:'ask', names:['pragati ai','ask ai','assistant','chatbot','प्रगति एआई','प्रगति','ప్రగతి ఏఐ','பிரகதி ஏஐ','પ્રગતિ એઆઈ','ಪ್ರಗತಿ ಎಐ']},
    {id:'community', names:['community','chat','connections','समुदाय','সম্প্রদায়','కమ్యూనిటీ','சமூகம்','સામુદાયિક','ಸಮುದಾಯ']},
    {id:'cropai', names:['crop photo','ai crop photo check','photo diagnosis','फसल की फोटो','শস্যের ছবি','పంట ఫోటో','பயிர் புகைப்படம்','ફসল ફોટો']},
    {id:'fieldhealth', names:['field health','live satellite health','ndvi','खेत की सेहत','জমির স্বাস্থ্য','పొలపు ఆరోగ్యం','வயல் ஆரோக்கியம்','ખેતરની પ્રગતિ']},
    {id:'irrigation', names:['irrigation','water advice','सिंचाई','পानी की सलाह','సించाई','நீர்ப்பாசனம்','સિંચાઈ','ಸಿಂಚನೆ']},
    {id:'farmcalendar', names:['farm calendar','calendar','reminders','खेती कैलेंडर','कृषि कैलेंडर','కృషి క్యాలెండర్','விவசாய காலெண்டர்','ખેતરનો કાલેન્ડર']},
    {id:'marketplace', names:['marketplace','sell produce','rent equipment','किसान बाजार','किसान मार्केटप्लेस','ವிவசாய ಮಾರುಕಟ್ಟೆ','ફાર્મ માર્કેટપ્લેસ']},
    {id:'schemes', names:['government schemes','schemes','सरकारी योजना','सरकारी परियोजना','ప్రభుత్వ పథకాలు','સરકારી યોજનાઓ','સરકારી યોજનાઅ']}
  ];

  function normalizeSpeech(value) {
    return String(value || '').toLocaleLowerCase().normalize('NFKC').replace(/[.,!?।؛:]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function routeFromSpeech(transcript) {
    const text = normalizeSpeech(transcript);
    if (!text) return null;
    const matches = [];
    for (const route of voiceRoutes) {
      for (const name of route.names) {
        const key = normalizeSpeech(name);
        if (key && text.includes(key)) matches.push({id: route.id, length: key.length});
      }
    }
    matches.sort((a, b) => b.length - a.length);
    return matches[0]?.id || null;
  }

  function openVoiceRoute(id) {
    if (typeof show !== 'function') return false;
    show(id);
    if (typeof render === 'function') render();
    window.scrollTo({top: 0, behavior: 'smooth'});
    return true;
  }

  function handleVoiceTranscript(transcript) {
    const spoken = normalizeSpeech(transcript);
    if (!spoken) return;
    const routeId = routeFromSpeech(spoken);
    if (routeId) {
      openVoiceRoute(routeId);
      return;
    }
    if ($f('modal') && !$f('modal').hidden) {
      if (status => $f('gsVoiceStatus')) $f('gsVoiceStatus').textContent = 'Please finish login first, then use voice commands across GramSutra.';
      return;
    }
    if ($f('q') && typeof send === 'function') {
      show('ask');
      if (typeof render === 'function') render();
      $f('q').value = transcript;
      send(transcript).catch(() => {});
      return;
    }
    if ($f('gsVoiceStatus')) $f('gsVoiceStatus').textContent = 'I heard you, but could not match that command. Try “open Crop Doctor” or ask Pragati AI.';
  }

  const liveStatus = $f('gsVoiceStatus');
  const voiceButton = $f('gsVoiceButton');
  const micButton = $f('mic');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startListeningFor(langName = getLang()) {
    if (!Recognition) {
      if (liveStatus) liveStatus.textContent = 'Voice recognition is not supported in this browser. Try a current Chrome browser, or use typing.';
      return;
    }
    const chosen = langCode[langName] || langCode.English || 'en-IN';
    const rec = new Recognition();
    rec.lang = chosen;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      if (voiceButton) {
        voiceButton.setAttribute('aria-pressed', 'true');
        voiceButton.textContent = '⏹';
      }
      if (liveStatus) liveStatus.textContent = 'Listening in ' + (langName || 'English') + '. Say a feature name or ask Pragati AI.';
    };
    rec.onresult = e => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      if (text) handleVoiceTranscript(text);
    };
    rec.onerror = e => {
      if (liveStatus) liveStatus.textContent = e.error === 'not-allowed' ? 'Microphone permission is blocked. Allow microphone access in your browser settings.' : 'Could not recognise speech. Check your microphone and try again.';
    };
    rec.onend = () => {
      if (voiceButton) {
        voiceButton.setAttribute('aria-pressed', 'false');
        voiceButton.textContent = '🎤';
      }
    };
    try { rec.start(); } catch (e) { if (liveStatus) liveStatus.textContent = 'Could not start microphone: ' + e.message; }
  }

  if (voiceButton) {
    voiceButton.addEventListener('click', () => startListeningFor(getLang()));
  }

  if (micButton) {
    micButton.addEventListener('click', () => startListeningFor(getLang()));
  }

  // Keep auto-speak for AI replies when enabled.
  const originalSend = typeof send === 'function' ? send : null;
  const autoSpeakKey = 'gs_pragati_auto_speak';
  const shouldAutoSpeak = () => localStorage.getItem(autoSpeakKey) === '1';
  if (originalSend) {
    send = async function (text) {
      const result = await originalSend(text);
      if (shouldAutoSpeak()) speakLastReply();
      return result;
    };
  }

  // Add the new tools to Explore without changing the primary navigation.
  const extraModules = [
    ['cropai','📷','AI crop photo check','Upload a leaf or crop photo'],
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
  ['cropai','fieldhealth','irrigation','farmcalendar','marketplace','schemes'].forEach(id => {
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
    try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1400/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>blob?resolve({mimeType:blob.type||'image/jpeg',imageBase64:blobToBase64(blob)}):reject(new Error('Could not prepare the photo.')), 'image/jpeg', 0.82);};img.onerror=()=>reject(new Error('The selected photo could not be loaded.'));img.src=url;});} finally { URL.revokeObjectURL(url); }
  }
  function blobToBase64(blob){ const reader = new FileReader(); return new Promise((resolve, reject)=>{ reader.onloadend = () => resolve(String(reader.result || '').split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(blob); }); }
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
    const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.onload=initMap;js.onerror=()=>$f('fieldHealthStatus').textContent='Map library could not load.';
    document.head.appendChild(js);
  }
  document.body.addEventListener('click', e=>{const target=e.target.closest('[data-go="fieldhealth"]');if(target)setTimeout(loadLeaflet,120);});
  $f('fieldLocate')?.addEventListener('click',async()=>{try{const g=await requestGeo();saveGeo(g);loadLeaflet();if(fmap)fmap.setView([g.lat,g.lon],15);$f('fieldHealthStatus').textContent='Map centred on your location. Draw the field outline to analyse crop health.';}catch(e){$f('fieldHealthStatus').textContent=e.message;}});
  $f('fieldUndo')?.addEventListener('click',()=>{fieldPoints.pop();fieldRenderPoints();});
  $f('fieldClear')?.addEventListener('click',()=>{fieldPoints=[];if(ndviOverlay&&fmap){fmap.removeLayer(ndviOverlay);ndviOverlay=null;}fieldRenderPoints();$f('fieldHealthStatus').textContent='Boundary cleared. Add at least 3 points again.';});
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
      $f('fieldHealthStatus').textContent='Sentinel-2 NDVI overlay loaded (latest available low-cloud scene from the last 45 days). Red/orange indicate lower vegetation greenness; green indicates higher crop vigour.';
    }catch(e){$f('fieldHealthStatus').textContent=e.message;}
  });

  // Live weather via Open-Meteo, with geolocation requested only after an explicit tap.
  async function loadWeatherAt(g){
    const wx=$f('liveWeatherStatus'); if(wx)wx.textContent='Loading live forecast…';
    try{
      const r=await fetch(`${api}/api/weather?lat=${encodeURIComponent(g.lat)}&lon=${encodeURIComponent(g.lon)}`);const j=await r.json();if(!r.ok)throw new Error(j.error||'Weather not available');
      localStorage.setItem('gs_weather_cache',JSON.stringify({at:j.fetchedAt,source:j.source,data:j.data}));
      const d=j.data,c=d.current||{},day=d.daily||{},hourly=d.hourly||{};const hourStart=Math.max(0,hourly.time?.indexOf(c.time) ?? 0);const next24=hourly.precipitation_probability?.slice(hourStart,hourStart+24) || [];
      const rain24=next24.length?Math.round(next24.reduce((a,b)=>a+(Number(b)||0),0)/next24.length):null; const precip=Number(c.precipitation ?? day.precipitation_probability_max?.[0] ?? 0);
      $f('liveWeatherStatus').innerHTML=`<div class="tiles"><div class="tile">🌡️ Current temperature<b>${Math.round(c.temperature_2m)}°C</b></div><div class="tile">💧 Humidity<b>${c.relative_humidity_2m ?? 0}%</b></div><div class="tile">🌧️ Rain chance<b>${rain24 ?? precip ?? 0}%</b></div></div>`;
      $f('irRain').value=rain24??precip??0;$f('rain').value=precip??0;$f('feed').value='1';const demoOption=$f('feed').querySelector('option[value="1"]');if(demoOption)demoOption.textContent='Live forecast from Open-Meteo';
      const top=document.querySelector('.top-weather');if(top)top.innerHTML=`🌤️ <b>${Math.round(c.temperature_2m)}°C</b><small>Live · Open-Meteo</small>`;
    }catch(e){if(wx){try{const cached=JSON.parse(localStorage.getItem('gs_weather_cache')||'null');if(cached?.data){const c=cached.data.current||{},age=cached.fetchedAt||cached.at;wx.innerHTML=`<p><b>Using last saved forecast.</b> (updated ${new Date(age).toLocaleString()})</p>`;}else wx.textContent='Weather is currently unavailable. Try again later.';}catch(_){wx.textContent='Weather is currently unavailable. Try again later.';}}}
  }
  const weatherCard=document.querySelector('#weather .card');
  if(weatherCard && !$f('liveWeatherCard')){
    const card=document.createElement('div');card.id='liveWeatherCard';card.className='task';card.innerHTML='<h3>🌍 Live local forecast</h3><p class="note">Uses your location only when you request it. No location is sent automatically.</p>';
    weatherCard.appendChild(card);
  }
  $f('wxLocate')?.addEventListener('click',async()=>{try{const g=await requestGeo();saveGeo(g);await loadWeatherAt(g);}catch(e){$f('liveWeatherStatus').textContent=e.message;}});
  const oldGeo=readGeo(); if(oldGeo) { /* do not automatically re-request or transmit a saved location */ }

  // Real Agmarknet mandi records through data.gov.in (key remains on server).
  const marketSection=$f('market');
  if(marketSection && !$f('liveMandiCard')){
    const card=document.createElement('div');card.id='liveMandiCard';card.className='card';card.innerHTML=`<h2>📈 Live mandi prices</h2><p class="note">Agmarknet records from data.gov.in. The server keeps the API key private.</p>`;
    marketSection.appendChild(card);
  }
  $f('mandiLoad')?.addEventListener('click',async()=>{
    const status=$f('mandiStatus'), rows=$f('mandiRows');status.textContent='Loading official mandi records…';rows.innerHTML='';
    try{const q=new URLSearchParams({commodity:$f('mandiCommodity').value,state:$f('mandiState').value,district:$f('mandiDistrict').value});const r=await fetch(api+'/api/market?'+q.toString());const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not load mandi data.');
      if(!j.records.length){status.textContent='No matching arrivals were returned. Try a broader commodity or state name.';return;}
      rows.innerHTML='<table><thead><tr><th>Commodity</th><th>Market</th><th>Arrival date</th><th>Min ₹/qtl</th><th>Max ₹/qtl</th><th>Modal ₹/qtl</th></tr></thead><tbody>'+j.records.map(x=>`<tr><td>${escF(x.commodity||'')}</td><td>${escF(x.market||'')}</td><td>${escF(x.arrival_date||'')}</td><td>${escF(x.min_price||'')}</td><td>${escF(x.max_price||'')}</td><td>${escF(x.modal_price||'')}</td></tr>`).join('')+'</tbody></table>';
      const byDate=new Map();j.records.forEach(x=>{const v=Number(String(x.modal_price||'').replace(/,/g,''));if(Number.isFinite(v)&&v>0){const k=String(x.arrival_date||'Unknown');const a=byDate.get(k)||[];a.push(v);byDate.set(k,a);}});
      const points=[...byDate].map(([date,vs])=>({date,value:vs.reduce((a,b)=>a+b,0)/vs.length})).reverse().slice(-14);
      const trend=$f('mandiTrendPanel');
      if(points.length>=2){const vals=points.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),range=Math.max(1,max-min),xy=points.map((x,i)=>[40+i*(520/(points.length-1)),140-((x.value-min)/range)*100]);
        trend.hidden=false;trend.innerHTML=`<b>Recent modal-price trend · ${escF($f('mandiCommodity').value)}</b><svg viewBox="0 0 600 180" role="img" aria-label="Recent mandi modal price trend" style="width:100%;height:180px;border:1px solid var(--line);border-radius:12px;background:#f7fff9;margin-top:8px"><polyline points="${xy.map(([x,y])=>`${x},${y}`).join(' ')}" fill="none" stroke="#15803d" stroke-width="3"/></svg>`;}
      else{trend.hidden=false;trend.textContent='Not enough distinct arrival dates for a trend yet. Try a broader state/district filter.';}
      status.textContent=`${j.records.length} records · ${j.source} · Retrieved ${new Date(j.fetchedAt).toLocaleString()}. Prices are source-reported wholesale values, not guaranteed offers.`;
    }catch(e){status.textContent=e.message;}
  });

  // Smart irrigation: rule-based, explicitly explainable decision support.
  $f('irAdvice')?.addEventListener('click',()=>{
    const m=Number($f('irMoisture').value),rain=Number($f('irRain').value),crop=$f('irCrop').value,stage=$f('irStage').value;
    const out=$f('irResult');
    if(!Number.isFinite(m)||m<0||m>100||!Number.isFinite(rain)||rain<0||rain>100){out.textContent='Enter soil moisture and rain chance between 0 and 100.';return;}
    let title,reason,priority='Monitor';
    if(m>=80){title='Avoid adding water for now; inspect drainage.';reason='The soil-moisture value you entered is already high. Check whether water is standing and whether the root zone is aerated.';priority='Low';}
    else if(rain>=70 && m>=45){title='Consider postponing irrigation and recheck after rain.';reason='A high rain probability plus moderate-to-high reported moisture may make immediate irrigation unnecessary.';priority='Moderate';}
    else if(m<30 && rain<40){title='Inspect the root zone and consider irrigation.';reason='The moisture value is low and little rain is expected. Check soil at root depth before irrigating; avoid overwatering.';priority='High';}
    else {title='Continue monitoring; no strong irrigation signal from these inputs.';reason='Moisture and rain inputs do not indicate a clear immediate need. Recheck near the crop root zone, especially if the field has a slope or drainage issue.';priority='Monitor';}
    out.innerHTML=`<b>${priority}: ${escF(title)}</b><p>${escF(reason)}</p><p class="note">Inputs: ${escF(crop)}, ${escF(stage)}, ${m}% soil moisture, ${rain}% rain chance. Crop water needs also depend on soil type, root depth and plant stage.</p>`;
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
    box.innerHTML=farmTasks.length?farmTasks.map(t=>`<div class="listing"><label class="chk"><input type="checkbox" data-task-done="${escF(t.id)}" ${t.done?'checked':''}><span><b>${escF(t.title)}</b><div class="meta">${escF(t.date||'No date')} · ${escF(t.category||'General')} ${t.done?'· Done':''}</div></span></label><button class="btn" data-task-delete="${escF(t.id)}">Delete</button></div>`).join(''):'<p class="note">No reminders yet. Add a task and due date.</p>';
  }
  $f('taskAdd')?.addEventListener('click',()=>{const title=$f('taskTitle').value.trim(),date=$f('taskDate').value;if(!title||!date){$f('taskStatus').textContent='Enter a task and due date.';return;}farmTasks.unshift({id:makeId(),title,date,category:$f('taskCategory').value||'General',done:false,updated_at:new Date().toISOString()});saveTasks();$f('taskTitle').value='';});
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
      (remote||[]).forEach(t=>{if(deletedTaskIds.includes(t.id))return;const local=byId.get(t.id);if(!local || new Date(t.updated_at)>new Date(local.updated_at||0))byId.set(t.id,{id:t.id,title:t.title,date:t.due_date||t.date,category:t.category||'General',done:!!t.is_done,updated_at:t.updated_at||new Date().toISOString()});});
      farmTasks=[...byId.values()];
      if(farmTasks.length){const rows=farmTasks.map(t=>({id:t.id,user_id:uid,title:t.title,due_date:t.date,category:t.category,is_done:!!t.done,updated_at:t.updated_at||new Date().toISOString()}));await sb.from('farm_tasks').upsert(rows,{onConflict:'id'});} 
      deletedTaskIds=[];localStorage.setItem(TASK_DELETE_KEY,'[]');localStorage.setItem(TASK_KEY,JSON.stringify(farmTasks));renderTasks();$f('taskStatus').textContent='Synced with your GramSutra account.';
    }catch(e){console.warn('Farm task sync is offline/unavailable:',e.message);}
  }
  renderTasks();window.addEventListener('gramsutra-auth-ready',syncTasks);window.addEventListener('online',syncTasks);
  function checkTaskAlerts(){if(!('Notification'in window)||Notification.permission!=='granted')return;const due=farmTasks.filter(t=>!t.done&&t.date<=localDate());if(!due.length)return;const marker='gs_task_alerts_v1';const seen=JSON.parse(localStorage.getItem(marker)||'[]');if(!seen.includes(due[0].id)){new Notification('Farm reminder', { body: due[0].title + ' is due today.' }); seen.push(due[0].id); localStorage.setItem(marker, JSON.stringify(seen));}}
  $f('taskNotify')?.addEventListener('click',async()=>{if(!('Notification'in window)){$f('taskStatus').textContent='Notifications are not supported by this browser.';return;}const perm=await Notification.requestPermission();if(perm==='granted'){$f('taskStatus').textContent='Due-task alerts enabled.';checkTaskAlerts();}else{$f('taskStatus').textContent='Notifications are blocked. You can still use the offline reminder list.';}});
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
        sb.from('listing_inquiries').select('id,message,response,status,created_at,profiles!listing_inquiries_sender_id_fkey(display_name),marketplace_listings!listing_inquiries_listing_id_fkey(title)').eq('owner_id',communityUser.id).order('created_at',{ascending:false}),
        sb.from('listing_inquiries').select('id,message,response,status,created_at,marketplace_listings!listing_inquiries_listing_id_fkey(title)').eq('sender_id',communityUser.id).order('created_at',{ascending:false})
      ]);
      if(received.error)throw received.error;if(sent.error)throw sent.error;
      const html=[];
      (received.data||[]).forEach(x=>html.push(`<article class="listing"><b>Incoming · ${escF(x.marketplace_listings?.title||'Listing')}</b><p>${escF(x.message)}</p><div class="meta">From ${escF(x.profiles?.display_name || 'Farmer')} · ${new Date(x.created_at).toLocaleDateString('en-IN')}</div>${x.response?`<p><b>Reply:</b> ${escF(x.response)}</p>`:''}</article>`));
      (sent.data||[]).forEach(x=>html.push(`<article class="listing"><b>Sent · ${escF(x.marketplace_listings?.title||'Listing')}</b><p>${escF(x.message)}</p><div class="meta">${new Date(x.created_at).toLocaleDateString('en-IN')}</div>${x.response?`<p><b>Seller reply:</b> ${escF(x.response)}</p>`:''}</article>`));
      box.innerHTML=html.join('')||'<p class="note">No marketplace inquiries yet.</p>';
    }catch(e){box.textContent='Could not load inquiries: '+e.message;}
  }
  async function loadListings(){
    const box=$f('listingFeed');if(!box)return;
    const filter=$f('listingFilter').value, query=$f('listingSearch').value.toLowerCase().trim();
    let rows=[];
    if(marketplaceReady()){
      try{let q=sb.from('marketplace_listings').select('id,owner_id,listing_type,title,category,quantity,price,village,description,created_at,profiles(display_name)').eq('status','active').order('created_at',{ascending:false});
        if(filter!=='all') q=q.eq('listing_type',filter); const {data,error}=await q;if(error)throw error;rows=data||[]; $f('listingStatus').textContent='Active marketplace listings loaded.';}
      catch(e){$f('listingStatus').textContent='Marketplace backend issue: '+e.message;}
    }else {rows=localListings.filter(x=>filter==='all'||x.listing_type===filter);$f('listingStatus').textContent='Local preview only. Configure Supabase and sign in to publish listings to other farmers.';}
    rows=rows.filter(x=>(x.title+' '+x.category+' '+x.village+' '+x.description).toLowerCase().includes(query));
    box.innerHTML=rows.length?rows.map(x=>`<article class="listing"><h3>${x.listing_type==='equipment'?'🚜':x.listing_type==='inputs'?'🌱':'🌾'} ${escF(x.title)}</h3><div class="price">₹${Number(x.price||0).toLocaleString('en-IN')}</div><div class="meta">${escF(x.village||'')} · ${escF(x.category||'General')} · ${escF(x.quantity||'')}${x.profiles?.display_name?` · Seller: ${escF(x.profiles.display_name)}`:''}</div><p>${escF(x.description||'')}</p>${marketplaceReady()?`<button class="btn" data-listing-inquiry="${x.id}">Send inquiry</button>`:''}</article>`).join(''):'<p class="note">No listings match your filter.</p>';
    await loadInquiries();
  }
  $f('listingPublish')?.addEventListener('click',async()=>{
    const title=$f('listingTitle').value.trim(),price=Number($f('listingPrice').value);
    if(!title||!Number.isFinite(price)||price<0){$f('listingStatus').textContent='Enter a title and a valid non-negative price.';return;}
    const record={listing_type:$f('listingType').value,title,category:$f('listingCategory').value.trim(),quantity:$f('listingQty').value.trim(),price,village:$f('listingVillage').value.trim()||(typeof PROF!=='undefined'&&PROF.village)||'Village',description:$f('listingDesc').value.trim()};
    if(marketplaceReady()){
      const {error}=await sb.from('marketplace_listings').insert({...record,owner_id:communityUser.id});if(error){$f('listingStatus').textContent='Could not publish: '+error.message;return;}$f('listingStatus').textContent='Listing published successfully.';
    }else{
      localListings.unshift({...record,id:'local-'+Date.now(),seller_name:(typeof PROF!=='undefined'&&PROF.name)||'This device'});localStorage.setItem(LOCAL_LISTINGS,JSON.stringify(localListings));$f('listingStatus').textContent='Saved locally. Sign in to publish to other farmers.';
    }
    ['listingTitle','listingCategory','listingQty','listingPrice','listingDesc','listingVillage'].forEach(id=>$f(id).value='');await loadListings();
  });
  $f('listingRefresh')?.addEventListener('click',loadListings);$f('listingFilter')?.addEventListener('change',loadListings);$f('listingSearch')?.addEventListener('input',loadListings);
  $f('listingFeed')?.addEventListener('click',async e=>{const b=e.target.closest('[data-listing-inquiry]');if(!b)return;const msg=prompt('Write a short message to the seller:','Hello, I am interested in your listing.');if(!msg)return;const {error}=await sb.from('listing_inquiries').insert({listing_id:b.dataset.listingInquiry,sender_id:communityUser.id,owner_id:communityUser.id,message:msg,status:'new'});if(error){alert(error.message);return;}alert('Inquiry sent to the seller.');await loadInquiries();});
  $f('marketInquiries')?.addEventListener('click',async e=>{const b=e.target.closest('[data-inquiry-reply]');if(!b)return;const response=prompt('Write your private reply to this farmer:');if(!response)return;const {error}=await sb.from('listing_inquiries').update({response,status:'replied',responded_at:new Date().toISOString()}).eq('id',b.dataset.inquiryReply);if(error){alert(error.message);return;}alert('Reply saved.');await loadInquiries();});
  window.addEventListener('gramsutra-auth-ready',loadListings);window.addEventListener('gramsutra-auth-out',loadListings);loadListings();

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
  $f('schemeList').innerHTML=schemes.map(s=>`<div class="scheme"><h3>${escF(s[0])}</h3><p class="note">${escF(s[1])}</p>${s[0]==='Kisan Call Centre'?'<a href="tel:18001801551">Call 1800-180-1551</a>':'<a href="'+s[2]+'" target="_blank" rel="noopener">Open portal</a>'}</div>`).join('');

  // Multi-language voice input and spoken Pragati AI replies.
  const askCard=document.querySelector('#ask .card');
  if(askCard&&!$f('pragatiVoiceTools')){const tools=document.createElement('div');tools.id='pragatiVoiceTools';tools.className='callbar';tools.innerHTML='<button class="btn" id="pragatiSpeak">🔊 Read last reply</button><button class="btn" id="pragatiSave">💾 Save reply</button><label class="chk"><input type="checkbox" id="pragatiAutoSpeak"> Auto-speak replies</label>';askCard.appendChild(tools);}
  $f('pragatiSpeak')?.addEventListener('click',speakLastReply);
  const ADVICE_KEY='gs_saved_advice_v1';let savedAdvice=[];try{savedAdvice=JSON.parse(localStorage.getItem(ADVICE_KEY)||'[]');if(!Array.isArray(savedAdvice))savedAdvice=[];}catch(_){savedAdvice=[];}
  function renderSavedAdvice(){const box=$f('savedAdviceList');if(!box)return;box.innerHTML=savedAdvice.length?savedAdvice.map(n=>`<div class="listing"><div class="meta">${new Date(n.savedAt).toLocaleString('en-IN')}</div><p>${escF(n.text||'')}</p><button class="btn" data-advice-delete="${escF(n.id||'')}">Delete</button></div>`).join(''):'<p class="note">No saved advice yet.</p>';} 
  $f('pragatiSave')?.addEventListener('click',()=>{const last=[...$f('msgs').querySelectorAll('.msg.bot')].filter(x=>x.textContent.trim()&&x.textContent.trim()!=='Thinking…').pop();if(!last){if($f('gsVoiceStatus'))$f('gsVoiceStatus').textContent='There is no reply to save yet.';return;}const item={id:makeId(),savedAt:new Date().toISOString(),text:last.textContent.trim()};savedAdvice.unshift(item);localStorage.setItem(ADVICE_KEY,JSON.stringify(savedAdvice));renderSavedAdvice();if($f('gsVoiceStatus'))$f('gsVoiceStatus').textContent='Saved the latest AI reply for later.';});
  $f('savedAdviceList')?.addEventListener('click',e=>{const id=e.target.dataset.adviceDelete;if(id){savedAdvice=savedAdvice.filter(n=>n.id!==id);localStorage.setItem(ADVICE_KEY,JSON.stringify(savedAdvice));renderSavedAdvice();}});
  renderSavedAdvice();

  const autoKey='gs_pragati_auto_speak';if($f('pragatiAutoSpeak')){$f('pragatiAutoSpeak').checked=localStorage.getItem(autoKey)==='1';$f('pragatiAutoSpeak')?.addEventListener('change',e=>localStorage.setItem(autoKey,e.target.checked?'1':'0'));}

  if (Recognition) {
    if (micButton) {
      micButton.style.display = '';
      micButton.title = 'Speak in your selected language';
      micButton.addEventListener('click', () => startListeningFor(getLang()));
    }
  }

  const baseShow=typeof show==='function'?show:null;
  if(baseShow){show=function(id){baseShow(id);if(id==='fieldhealth')setTimeout(loadLeaflet,140);if(id==='marketplace')loadListings();};}

  // Useful status hints and avoid presenting the illustrative dashboard values as live.
  const demoNote=document.querySelector('#home .map-note');if(demoNote)demoNote.textContent='Illustrative field-health preview · use Live satellite health to analyse a drawn field';
  if($f('top-village') && typeof PROF!=='undefined' && PROF.village)$f('top-village').textContent=PROF.village;
  const hash=location.hash.slice(1);if(extraModules.some(m=>m[0]===hash)){show(hash);if(hash==='fieldhealth')setTimeout(loadLeaflet,150);}
})();
