// GramSutra AI server: serves the app and forwards Pragati AI requests to Gemini.
// Your API key stays on this server and is never sent to the browser.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Lightweight .env reader so local Node deployments need no extra dependency.
// Existing environment variables always take precedence over values in .env.
(function loadLocalEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    process.env[match[1]] = value;
  }
})();

const PORT = process.env.PORT || 3000;
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
const safeText = (v, max=80) => String(v || '').trim().slice(0, max);
async function getWeather(url) { const r = await fetch(url, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error('Weather provider returned ' + r.status); return r.json(); }

// Simple per-IP limit: 30 chat calls per 10 minutes.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 600000);
  list.push(now); hits.set(ip, list);
  return list.length > 30;
}

function geminiErrorMessage(status, data) {
  const providerMessage = data?.error?.message || 'Google Gemini rejected the request.';
  if (status === 400) return 'Gemini could not process this request: ' + providerMessage;
  if (status === 401 || status === 403) return 'Google Gemini rejected the API key or project permissions. Create/check the key in Google AI Studio and confirm the Gemini API is enabled.';
  if (status === 404) return 'The configured Gemini model was not found. Check GEMINI_MODEL against the models available to your API key.';
  if (status === 429) return 'Gemini API quota or rate limit reached. Check Google AI Studio → Usage and Limits; wait for the quota window or review billing.';
  if (status >= 500) return 'Google Gemini is temporarily unavailable. Please retry shortly.';
  return providerMessage;
}

function readBody(req, max = 300000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > max) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://localhost,capacitor://localhost,http://localhost').split(',').map(x => x.trim()).filter(Boolean);
http.createServer(async (req, res) => {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const parsedUrl = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && parsedUrl.pathname === '/api/weather') {
    const lat = Number(parsedUrl.searchParams.get('lat')), lon = Number(parsedUrl.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json(res, 400, { error: 'Valid latitude and longitude are required.' });
    try {
      const q = new URL('https://api.open-meteo.com/v1/forecast');
      q.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m', hourly: 'precipitation_probability,precipitation,temperature_2m', daily: 'precipitation_probability_max,temperature_2m_max,temperature_2m_min,weather_code', forecast_days: '3', timezone: 'auto' }).toString();
      const data = await getWeather(q);
      return json(res, 200, { source: 'Open-Meteo', fetchedAt: new Date().toISOString(), data });
    } catch (e) { return json(res, 502, { error: 'Live weather is temporarily unavailable.', detail: e.message }); }
  }
  if (req.method === 'GET' && parsedUrl.pathname === '/api/market') {
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many market-data requests. Please try later.' });
    const apiKey = process.env.DATA_GOV_IN_API_KEY;
    if (!apiKey) return json(res, 503, { error: 'Mandi prices need a data.gov.in API key. Add DATA_GOV_IN_API_KEY on the server.' });
    const commodity = safeText(parsedUrl.searchParams.get('commodity'), 60), state = safeText(parsedUrl.searchParams.get('state'), 60), district = safeText(parsedUrl.searchParams.get('district'), 60);
    const q = new URL('https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070');
    q.searchParams.set('api-key', apiKey); q.searchParams.set('format', 'json'); q.searchParams.set('limit', '100'); q.searchParams.set('sort[Arrival_Date]', 'desc');
    if (commodity) q.searchParams.set('filters[commodity]', commodity);
    if (state) q.searchParams.set('filters[state]', state);
    if (district) q.searchParams.set('filters[district]', district);
    try { const r = await fetch(q, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error('data.gov.in returned ' + r.status); const data = await r.json(); return json(res, 200, { source: 'data.gov.in Agmarknet', fetchedAt: new Date().toISOString(), records: data.records || [], total: data.total || 0 }); }
    catch (e) { return json(res, 502, { error: 'Mandi price provider is temporarily unavailable.', detail: e.message }); }
  }
  if (req.method === 'POST' && parsedUrl.pathname === '/api/crop-diagnose') {
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!groqKey && !geminiKey) return json(res, 503, { error: 'Photo diagnosis is not configured. Add GROQ_API_KEY (recommended) or GEMINI_API_KEY to the server environment.' });
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many diagnosis requests. Please try later.' });
    try {
      const body = JSON.parse(await readBody(req, 12_000_000));
      const mime = String(body.mimeType || ''); const image = String(body.imageBase64 || '');
      if (!['image/jpeg','image/png','image/webp'].includes(mime) || !image || image.length > 10_000_000) return json(res, 400, { error: 'Upload a JPEG, PNG or WEBP image under 7 MB.' });
      const crop = safeText(body.crop, 60), notes = safeText(body.notes, 1000), language = safeText(body.language, 40) || 'English';
      const system = 'You are Pragati AI, a cautious Indian crop-health assistant. Inspect the supplied crop image. The first line of your reply must be exactly one of: VERDICT: HEALTHY, VERDICT: NEEDS_ATTENTION, VERDICT: UNHEALTHY, VERDICT: UNSURE (use UNSURE if the image is unclear or not a crop plant). Then use clear headings: What I can see; Possible causes (2-4, never claim certainty); What to check next; Safe first steps; When to contact an expert. Give practical, low-risk steps. Never prescribe pesticide products, chemical names, or doses. Explain that similar symptoms can have different causes and a photo cannot confirm a diagnosis. If the image is unclear, ask for a sharper close-up and a whole-plant photo. Answer entirely in the requested language.';
      let text = '', model = '';
      if (groqKey) {
        model = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + groqKey },
          body: JSON.stringify({ model, messages: [
            { role: 'system', content: system },
            { role: 'user', content: [
              { type: 'text', text: 'Crop: ' + (crop || 'not specified') + '. Farmer observations: ' + (notes || 'not provided') + '. Reply in ' + language + '. Examine the attached image cautiously.' },
              { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + image } }
            ] }
          ], temperature: 0.2, max_completion_tokens: 1000 }), signal: AbortSignal.timeout(90000)
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = out?.error?.message || 'Groq vision request failed.';
          return json(res, r.status, { error: r.status === 401 || r.status === 403 ? 'Groq rejected the API key. Check GROQ_API_KEY in Render.' : r.status === 429 ? 'Groq rate limit or quota reached. Please try again later.' : 'Crop photo analysis failed: ' + msg });
        }
        text = out.choices?.[0]?.message?.content || '';
      } else {
        model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: 'Crop: ' + (crop || 'not specified') + '. Language: ' + language + '. Farmer notes: ' + (notes || 'not provided') + '. Please inspect cautiously.' }, { inlineData: { mimeType: mime, data: image } }] }], generationConfig: { maxOutputTokens: 1000, temperature: 0.2 } }), signal: AbortSignal.timeout(90000) });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) return json(res, r.status, { error: geminiErrorMessage(r.status, out) });
        text = (out.candidates?.[0]?.content?.parts || []).map(x => x.text || '').filter(Boolean).join('\n');
      }
      if (!text) return json(res, 502, { error: 'The AI returned an empty result. Please try a clearer crop photo.' });
      return json(res, 200, { text, model, provider: groqKey ? 'Groq Vision' : 'Google Gemini', advisory: 'AI suggestions are not a confirmed diagnosis. Verify with a local KVK or agriculture officer before treatment.' });
    } catch (e) { const timeout = e.name === 'TimeoutError' || e.name === 'AbortError'; return json(res, timeout ? 504 : 502, { error: timeout ? 'AI took too long to analyse the image. Please try again.' : 'Could not process the crop image: ' + e.message }); }
  }
  if (req.method === 'POST' && parsedUrl.pathname === '/api/satellite/ndvi') {
    const clientId = process.env.SENTINELHUB_CLIENT_ID, clientSecret = process.env.SENTINELHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return json(res, 503, { error: 'Live crop-health imagery needs Sentinel Hub client credentials configured on the server.' });
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many satellite-analysis requests. Please try later.' });
    try {
      const body = JSON.parse(await readBody(req, 100000)); const coords = body.geometry?.coordinates?.[0];
      if (!Array.isArray(coords) || coords.length < 4 || coords.length > 200) return json(res, 400, { error: 'Draw a field boundary with at least three points first.' });
      for (const pair of coords) if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite) || Math.abs(pair[0]) > 180 || Math.abs(pair[1]) > 90) return json(res, 400, { error: 'Invalid field boundary coordinates.' });
      const lons=coords.map(p=>p[0]), lats=coords.map(p=>p[1]);
      if (Math.max(...lons)-Math.min(...lons) > 0.25 || Math.max(...lats)-Math.min(...lats) > 0.25) return json(res, 400, { error: 'For performance and cost control, analyse a single field boundary no larger than about 25 km across.' });
      const tokenRes = await fetch('https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }) });
      const tokenData = await tokenRes.json(); if (!tokenRes.ok) throw new Error('Sentinel Hub authentication failed: ' + (tokenData.error_description || tokenRes.status));
      const to = new Date().toISOString(), from = new Date(Date.now() - 45*86400000).toISOString();
      const evalscript = `//VERSION=3\nfunction setup(){return {input:[{bands:["B04","B08"],units:"REFLECTANCE"}],output:{bands:4,sampleType:"UINT8"}};}\nfunction evaluatePixel(s){let d=s.B08+s.B04;if(d<=0)return [0,0,0,0];let n=(s.B08-s.B04)/d;if(n<0.15)return [210,45,45,210];if(n<0.30)return [239,130,40,210];if(n<0.45)return [238,207,55,210];if(n<0.60)return [143,190,72,210];return [28,145,67,210];}`;
      const processRes = await fetch('https://services.sentinel-hub.com/api/v1/process', { method: 'POST', headers: { authorization: 'Bearer ' + tokenData.access_token, 'content-type': 'application/json', accept: 'image/png' }, body: JSON.stringify({ input: { bounds: { geometry: { type: 'Polygon', coordinates: [coords] }, properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' } }, data: [{ type: 'sentinel-2-l2a', dataFilter: { timeRange: { from, to }, maxCloudCoverage: 35, mosaickingOrder: 'leastCC' } }] }, output: { width: 512, height: 512, responses: [{ identifier: 'default', format: { type: 'image/png' } }] }, evalscript }) });
      if (!processRes.ok) { const msg = await processRes.text(); throw new Error('Sentinel Hub imagery unavailable: ' + msg.slice(0, 500)); }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-imagery-source': 'Sentinel-2 L2A / Sentinel Hub', 'x-analysis-window': '45 days' }); return res.end(Buffer.from(await processRes.arrayBuffer()));
    } catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (req.method === 'POST' && parsedUrl.pathname === '/api/account/delete') {
    const base = process.env.SUPABASE_URL, svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !svc) return json(res, 503, { error: 'Account deletion is not configured on the server.' });
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many requests. Please try later.' });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(res, 401, { error: 'Please sign in first.' });
    try {
      const who = await fetch(base + '/auth/v1/user', { headers: { apikey: svc, authorization: 'Bearer ' + token } });
      if (!who.ok) return json(res, 401, { error: 'Your session expired. Sign in again, then retry.' });
      const user = await who.json();
      const del = await fetch(base + '/auth/v1/admin/users/' + encodeURIComponent(user.id), { method: 'DELETE', headers: { apikey: svc, authorization: 'Bearer ' + svc } });
      if (!del.ok) return json(res, 502, { error: 'Could not delete the account. Please try again.' });
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 502, { error: 'Could not reach the account service.' }); }
  }
  if (req.method === 'GET' && parsedUrl.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'GramSutra API',
      chatConfigured: Boolean(process.env.GEMINI_API_KEY),
      provider: 'Google Gemini API',
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      cropDiagnosisConfigured: Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY),
      cropVisionProvider: process.env.GROQ_API_KEY ? 'Groq Vision' : (process.env.GEMINI_API_KEY ? 'Google Gemini Vision' : null),
      cropVisionModel: process.env.GROQ_API_KEY ? (process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b') : (process.env.GEMINI_MODEL || 'gemini-3.8-flash'),
      hint: process.env.GEMINI_API_KEY ? 'Gemini chat key is configured.' : 'Add GEMINI_API_KEY for chat. Crop photo diagnosis can use GROQ_API_KEY or GEMINI_API_KEY.'
    });
  }
  if (req.method === 'GET' && req.url === '/api/ice-config') {
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    const turnUrls = (process.env.TURN_URLS || '').split(',').map(x => x.trim()).filter(Boolean);
    const sharedSecret = process.env.TURN_SHARED_SECRET;
    if (turnUrls.length && sharedSecret) {
      const ttl = Math.max(300, Math.min(86400, Number(process.env.TURN_TTL_SECONDS || 3600)));
      const username = `${Math.floor(Date.now() / 1000) + ttl}:gramsutra`;
      const credential = crypto.createHmac('sha1', sharedSecret).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ iceServers, turnConfigured: iceServers.length > 2 }));
  }
  if (req.method === 'POST' && parsedUrl.pathname === '/api/chat') {
    if (!process.env.GEMINI_API_KEY) {
      return json(res, 503, { error: 'Pragati AI is not configured: GEMINI_API_KEY is missing on the server. Add a Gemini API key in Render → Environment, then redeploy.' });
    }
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many requests from this connection. Please wait a few minutes and try again.' });
    let payload;
    try { payload = JSON.parse(await readBody(req, 1_500_000)); }
    catch (e) { return json(res, 400, { error: e.message === 'too large' ? 'Your chat message is too large. Please shorten it.' : 'The chat request was not valid JSON.' }); }
    if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
      return json(res, 400, { error: 'The chat request is missing its conversation messages. Please send your question again.' });
    }
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    try {
      const contents = [];
      const toolNames = new Map();
      for (const message of payload.messages) {
        if (message.role === 'assistant' && Array.isArray(message.content)) {
          for (const block of message.content) if (block?.type === 'tool_use' && block.id && block.name) toolNames.set(String(block.id), String(block.name));
        }
        const role = message.role === 'assistant' ? 'model' : 'user';
        const source = message.content;
        const parts = [];
        if (typeof source === 'string') {
          if (source.trim()) parts.push({ text: source });
        } else if (Array.isArray(source)) {
          for (const block of source) {
            if (!block || typeof block !== 'object') continue;
            if (block.type === 'text' && block.text) parts.push({ text: String(block.text) });
            else if (block.type === 'tool_use' && block.name) parts.push({ functionCall: { id: String(block.id || crypto.randomUUID()), name: String(block.name), args: block.input || {} } });
            else if (block.type === 'tool_result') {
              let result = block.content;
              if (typeof result === 'string') { try { result = JSON.parse(result); } catch { result = { text: result }; } }
              parts.push({ functionResponse: { id: String(block.tool_use_id || ''), name: String(block.name || toolNames.get(String(block.tool_use_id || '')) || 'tool_result'), response: { result: result ?? null } } });
            }
          }
        }
        if (parts.length) contents.push({ role, parts });
      }
      const tools = Array.isArray(payload.tools) ? payload.tools.filter(t => t && t.name).map(t => ({ name: String(t.name), description: String(t.description || ''), parameters: t.input_schema || { type: 'object', properties: {} } })) : [];
      const requestBody = {
        systemInstruction: { parts: [{ text: String(payload.system || '') }] },
        contents,
        generationConfig: { maxOutputTokens: 1200 },
        ...(tools.length ? { tools: [{ functionDeclarations: tools }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } } : {})
      };
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
      const upstream = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(90000) });
      const raw = await upstream.text();
      let data; try { data = JSON.parse(raw); } catch { data = { error: { message: raw.slice(0, 500) || 'Gemini returned an unreadable response.' } }; }
      if (!upstream.ok) {
        const message = geminiErrorMessage(upstream.status, data);
        console.error('Gemini API error', upstream.status, data?.error?.message || raw.slice(0, 300));
        return json(res, upstream.status, { error: message, providerStatus: upstream.status, model });
      }
      const parts = data.candidates?.[0]?.content?.parts || [];
      const content = [];
      for (const part of parts) {
        if (typeof part.text === 'string' && part.text) content.push({ type: 'text', text: part.text });
        if (part.functionCall?.name) content.push({ type: 'tool_use', id: String(part.functionCall.id || crypto.randomUUID()), name: part.functionCall.name, input: part.functionCall.args || {} });
      }
      if (!content.length && data.promptFeedback?.blockReason) return json(res, 400, { error: 'Gemini blocked this request (' + data.promptFeedback.blockReason + '). Please rephrase your question.' });
      if (!content.length) return json(res, 502, { error: 'Gemini returned no text or tool action. Please try again.' });
      return json(res, 200, { content, model, provider: 'Google Gemini API' });
    } catch (e) {
      const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
      console.error('Gemini chat request failed:', e.message);
      return json(res, timeout ? 504 : 502, { error: timeout ? 'Gemini took too long to respond. Please try again.' : 'The GramSutra server could not reach Google Gemini. Check server internet access and try again.', detail: process.env.NODE_ENV === 'development' ? e.message : undefined });
    }
  }

  const file = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log('GramSutra AI listening on port ' + PORT));
