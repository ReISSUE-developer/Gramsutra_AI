// GramSutra AI server: serves the app and forwards Pragati AI requests to Groq.
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
const KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';
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

function groqErrorMessage(status, data) {
  const providerMessage = data?.error?.message || 'Groq rejected the request.';
  if (status === 400) return 'Groq could not process this request: ' + providerMessage;
  if (status === 401 || status === 403) return 'Groq rejected the API key. Create a valid key in Groq Console and set GROQ_API_KEY in Render.';
  if (status === 404) return 'The configured Groq model was not found. Check GROQ_MODEL against the models available to your Groq account.';
  if (status === 429) return 'Groq rate limit or quota reached. Check Groq Console usage and limits, then retry.';
  if (status >= 500) return 'Groq is temporarily unavailable. Please retry shortly.';
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
    if (!KEY) return json(res, 503, { error: 'Photo diagnosis is not configured: add GROQ_API_KEY to the server environment.' });
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many diagnosis requests. Please try later.' });
    try {
      const body = JSON.parse(await readBody(req, 12_000_000));
      const mime = String(body.mimeType || ''); const image = String(body.imageBase64 || '');
      if (!['image/jpeg','image/png','image/webp'].includes(mime) || !image || image.length > 10_000_000) return json(res, 400, { error: 'Upload a JPEG, PNG or WEBP image under 7 MB.' });
      const prompt = safeText(body.notes, 1000);
      const instructions = 'You are Pragati AI, a cautious Indian crop-health assistant. Inspect the supplied crop image. Give visible observations, 2-4 possible causes (not a definitive diagnosis), questions needed to distinguish them, safe non-chemical first steps, and when to contact a KVK/agriculture officer. Never prescribe pesticide products or doses. Mention image limitations and that leaf symptoms can overlap. Answer in the requested language if specified. Do not invent confidence or identify a disease as certain.';
      const upstream = await fetch('https://api.groq.com/openai/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: JSON.stringify({ model: VISION_MODEL, instructions, input: [{ role: 'user', content: [{ type: 'input_text', text: 'Crop: ' + safeText(body.crop, 60) + '. Language: ' + safeText(body.language, 40) + '. Farmer notes: ' + prompt + '. Please inspect cautiously.' }, { type: 'input_image', image_url: 'data:' + mime + ';base64,' + image, detail: 'auto' }] }], max_output_tokens: 900 }), signal: AbortSignal.timeout(90000) });
      const out = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return json(res, upstream.status, { error: groqErrorMessage(upstream.status, out) });
      const text = out.output_text || (out.output || []).flatMap(x => x.content || []).map(x => x.text || '').filter(Boolean).join('\n');
      return json(res, 200, { text, model: VISION_MODEL, advisory: 'AI suggestions are not a confirmed diagnosis. Verify with a local agriculture expert before treatment.' });
    } catch (e) { const timeout = e.name === 'TimeoutError' || e.name === 'AbortError'; return json(res, timeout ? 504 : 502, { error: timeout ? 'Groq took too long to analyse the image. Please try again.' : 'Could not process the crop image: ' + e.message }); }
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
  if (req.method === 'GET' && parsedUrl.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'GramSutra API',
      chatConfigured: Boolean(process.env.GROQ_API_KEY),
      provider: 'Groq API',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      hint: process.env.GROQ_API_KEY ? 'Groq API key is configured.' : 'Add GROQ_API_KEY to the server environment and redeploy.'
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
    if (!KEY) return json(res, 503, { error: 'Pragati AI is not configured: GROQ_API_KEY is missing on the server. Add a Groq API key in Render → Environment, then redeploy.' });
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many requests from this connection. Please wait a few minutes and try again.' });
    let payload;
    try { payload = JSON.parse(await readBody(req, 1_500_000)); }
    catch (e) { return json(res, 400, { error: e.message === 'too large' ? 'Your chat message is too large. Please shorten it.' : 'The chat request was not valid JSON.' }); }
    if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) return json(res, 400, { error: 'The chat request is missing its conversation messages. Please send your question again.' });
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    try {
      const messages = [];
      if (payload.system) messages.push({ role: 'system', content: String(payload.system) });
      for (const message of payload.messages) {
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const source = message.content;
        if (typeof source === 'string') { if (source.trim()) messages.push({ role, content: source }); continue; }
        if (!Array.isArray(source)) continue;
        if (role === 'assistant') {
          const textParts = source.filter(b => b?.type === 'text' && b.text).map(b => String(b.text));
          const toolCalls = source.filter(b => b?.type === 'tool_use' && b.name).map(b => ({ id: String(b.id || crypto.randomUUID()), type: 'function', function: { name: String(b.name), arguments: JSON.stringify(b.input || {}) } }));
          if (textParts.length || toolCalls.length) messages.push({ role: 'assistant', ...(textParts.length ? { content: textParts.join('\n') } : { content: null }), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
        } else {
          for (const block of source) {
            if (block?.type === 'text' && block.text) messages.push({ role: 'user', content: String(block.text) });
            else if (block?.type === 'tool_result') {
              let result = block.content; if (typeof result !== 'string') result = JSON.stringify(result ?? null);
              messages.push({ role: 'tool', tool_call_id: String(block.tool_use_id || ''), content: result });
            }
          }
        }
      }
      const tools = Array.isArray(payload.tools) ? payload.tools.filter(t => t && t.name).map(t => ({ type: 'function', function: { name: String(t.name), description: String(t.description || ''), parameters: t.input_schema || { type: 'object', properties: {} } } })) : [];
      const requestBody = { model, messages, temperature: 0.4, max_tokens: 1200, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) };
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(90000) });
      const raw = await upstream.text(); let data; try { data = JSON.parse(raw); } catch { data = { error: { message: raw.slice(0, 500) || 'Groq returned an unreadable response.' } }; }
      if (!upstream.ok) { const message = groqErrorMessage(upstream.status, data); console.error('Groq API error', upstream.status, data?.error?.message || raw.slice(0, 300)); return json(res, upstream.status, { error: message, providerStatus: upstream.status, model }); }
      const choice = data.choices?.[0]?.message || {}; const content = [];
      if (typeof choice.content === 'string' && choice.content) content.push({ type: 'text', text: choice.content });
      for (const call of choice.tool_calls || []) {
        let input = {}; try { input = JSON.parse(call.function?.arguments || '{}'); } catch {}
        content.push({ type: 'tool_use', id: String(call.id || crypto.randomUUID()), name: String(call.function?.name || ''), input });
      }
      if (!content.length) return json(res, 502, { error: 'Groq returned no text or tool action. Please try again.' });
      return json(res, 200, { content, model, provider: 'Groq API' });
    } catch (e) {
      const timeout = e.name === 'TimeoutError' || e.name === 'AbortError'; console.error('Groq chat request failed:', e.message);
      return json(res, timeout ? 504 : 502, { error: timeout ? 'Groq took too long to respond. Please try again.' : 'The GramSutra server could not reach Groq. Check server internet access and try again.', detail: process.env.NODE_ENV === 'development' ? e.message : undefined });
    }
  }

  const file = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log('GramSutra AI listening on port ' + PORT));
