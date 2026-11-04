GramSutra – Farmer Super-App Edition
GramSutra combines farm decision-support tools, Pragati AI, multilingual voice, satellite crop monitoring, live weather and mandi adapters, offline farm calendar, farmer marketplace/equipment rentals, government scheme links, and the existing Supabase community/private messaging/WebRTC calling module.
Run locally
Requirements: Node.js 18+.
```bash
npm start
```
Open http://localhost:3000. No npm dependencies are required by the Node server. The browser loads Supabase JS and Leaflet from their CDNs; the satellite basemap tiles come from Esri. The app shell, farm calendar and profile are cached/stored locally for offline use after the first successful load. Live APIs and cloud functions require a connection.
Configure the backend
For a local Node deployment, copy `.env.example` to `.env` in the project root and fill in the provider values. The server reads `.env` automatically (without an extra package); real host environment variables override `.env`. Keep `.env` private and never upload it to a public repository.

Pragati AI troubleshooting
Check `https://YOUR-SERVER/api/health` (replace with your deployed server URL). It reports whether the chat API key is configured, without revealing the key.
If it says `chatConfigured: false`, add `GROQ_API_KEY` in the Node host's environment-variable settings, or put it in `.env` for a local Node deployment. `GEMINI_API_KEY` is an optional fallback. Restart/redeploy the Node service after changing it.
Create the key in the Google AI Studio. Google AI Studio provides a free tier for eligible models with project-specific rate limits. Check AI Studio → Usage and the current pricing page; free-tier prompts may be used to improve Google products, so do not send sensitive personal information.
Run the app through the Node server (`npm start`, then open `http://localhost:3000`). Do not open `public/index.html` directly or host only the static `public/` folder: `/api/chat` must reach this Node server.
The API URL is configured in `public/api-config.js`. Leave it empty when the frontend and Node API are served by the same Render service. For Capacitor/Android or a separately hosted frontend, set `window.GRAMSUTRA_API = 'https://YOUR-SERVICE.onrender.com';` there, rebuild the Android app, and set `ALLOWED_ORIGINS` on the Node host to the exact frontend origin (for Capacitor, include `capacitor://localhost`).
If the browser reports `Failed to fetch`, open `https://YOUR-SERVICE.onrender.com/api/health`. If that URL does not load, the Node server is not deployed/reachable; if it loads but chat fails, check `chatConfigured` and the Render logs.
The chat now displays actionable server/provider errors (missing key, invalid key, unavailable model, usage/rate limit, or upstream outage) instead of one generic message. The server logs the upstream error status; never paste or share your secret API key when asking for help.
1. Supabase – accounts, community, listings, private inquiries and synced farm tasks
Create a project at https://supabase.com/.
Copy Project URL and anon/publishable key into `public/supabase-config.js`.
Run the complete `supabase/schema.sql` in Supabase SQL Editor. If you already ran the earlier community schema, re-run the updated file; it also updates the marketplace listing type constraint to include farm inputs.
In Database → Replication, enable Realtime for `public.messages`.
Configure email confirmation, production SMTP, authentication redirect URLs, CAPTCHA/rate limits and account deletion.
Never put the Supabase `service_role` key in the browser.
Marketplace listings for produce, seeds/farm inputs and equipment rentals are visible to signed-in members. Seller inquiries are private to the sender and listing owner. Farm calendar tasks are stored offline first and synced to the signed-in account when available.
2. Pragati AI and crop photo review
Set on the Node host:
`GROQ_API_KEY` – recommended for Pragati AI chat, app translation and crop-photo review. `GEMINI_API_KEY` is an optional fallback.
`GEMINI_MODEL` – optional; defaults to `gemini-3.8-flash` in this project. Set a model ID enabled for your Google Gemini account.
Crop photos are sent to the server and on to the configured AI vision provider (Groq by default, Gemini fallback) for visual analysis. The server does not intentionally persist the image or chat. Do not upload sensitive or identifying photos. AI crop review offers possible causes only, not a confirmed diagnosis or pesticide prescription.
3. Live mandi prices (Agmarknet via data.gov.in)
Request an API key at https://data.gov.in/ and set `DATA_GOV_IN_API_KEY` on the Node host. The app then queries the Agmarknet price/arrival dataset and can compare reported market records / show a descriptive recent trend. It does not predict future prices or guarantee a sale price. Without this key, the UI reports that live mandi prices are unavailable; it does not substitute demo prices.
4. Live weather
Weather uses the Open-Meteo forecast API and does not require an API key. The farmer must explicitly tap the location button and grant browser location permission. Coordinates are sent to this app server and then Open-Meteo to retrieve the forecast. Weather requests are not made automatically from stored coordinates.
5. Real satellite crop health (Sentinel-2 NDVI)
For actual vegetation-health imagery, create a Sentinel Hub OAuth client at https://www.sentinel-hub.com/ and set server-side:
`SENTINELHUB_CLIENT_ID`
`SENTINELHUB_CLIENT_SECRET`
The farmer draws a field polygon on the satellite map. The server requests the latest available Sentinel-2 L2A image with up to 35% cloud coverage from the last 45 days and returns an NDVI-derived color overlay. NDVI is a vegetation-greenness indicator, not a disease diagnosis, yield guarantee or direct irrigation instruction. Imagery can be unavailable because of clouds, revisit gaps, polygon size or account quota. Field coordinates are sent to Sentinel Hub for the analysis request.
The basemap uses Esri World Imagery tiles and requires an internet connection; observe Esri terms and attribution for production use.
6. Voice and language support
Pragati AI can use browser speech recognition and speech synthesis for supported languages. Availability and voice quality depend on the device/browser and language pack. Browser voice recognition may use the browser/platform's speech provider. The app does not record calls or retain voice recordings. The full app interface is not yet translated in every language; language selection controls Pragati AI and voice settings.
7. Voice/video calls
The existing community module uses WebRTC and Supabase Realtime signaling. STUN is enabled by default. For reliable cross-network calling, configure a coturn-compatible provider using:
`TURN_URLS` – comma-separated `turn:` / `turns:` URLs
`TURN_SHARED_SECRET` – server-only REST/shared secret
`TURN_TTL_SECONDS` – optional; defaults to 3600
Incoming calls while the app is closed/backgrounded need push-notification infrastructure and are not included in this browser build.
Deploy
Deploy this folder to a Node 18+ host with `npm start`, HTTPS, and the environment variables above. For Capacitor/mobile builds, set `window.GRAMSUTRA_API` in `public/index.html` to the deployed server URL, allow that origin using `ALLOWED_ORIGINS`, and ensure Supabase redirect URLs match. Do not expose API/TURN/Sentinel Hub secrets in frontend files.
Implemented modules and limitations
AI crop-photo review: functional when GROQ_API_KEY is configured (or GEMINI_API_KEY as fallback).
Satellite map: live Esri imagery base; user-drawn field boundary; true Sentinel-2 NDVI overlay when Sentinel Hub credentials are configured. Otherwise the app explains the missing setup.
Mandi: live Agmarknet records when `DATA_GOV_IN_API_KEY` is configured.
Weather: live Open-Meteo forecast after user-initiated geolocation.
Irrigation: explainable guidance based on farmer-entered root-zone moisture and rain chance; no sensor feed or automated irrigation control.
Marketplace/equipment rental: Supabase-backed member listings and private inquiries after database setup. Local previews remain on the current device only.
Farmer calendar: works offline in local storage; syncs to Supabase when signed in and online.
Government schemes: official portal links; eligibility and deadlines must be checked on those portals.
Voice: browser/device dependent; not all languages/devices offer speech recognition.
Community: sign-up, profiles, connections, private chat and WebRTC calls remain in the project. TURN and push notifications are separate deployment work.
Production checklist
Before public release: configure all providers; test with two farmer accounts and multiple phones/networks; verify RLS policies; test call TURN relay; add block/report/moderation and push notifications; finalize the publisher contact and privacy policy; run security, accessibility and performance checks; verify scheme links, data licensing and source dates; and complete Google Play Data Safety disclosures. Real farm boundaries, satellite data and prices must be checked before use in decisions. Never present demo dashboard metrics as live.
Quick hosting with Render (recommended for this build)
This repository includes `render.yaml`. It configures a Node web service in Render's Singapore region, runs `npm install` and `npm start`, and checks `/api/health`. It starts on Render's Free plan for testing; free services sleep after inactivity. Upgrade the service in Render before a public launch if you need always-on availability.
Extract this project and create a private GitHub repository. Upload the contents of this folder (the files `server.js`, `package.json`, `render.yaml`, `public/`, and `supabase/` should be at the repository root). Do not upload a real `.env` file. `.gitignore` excludes it.
Create a Render account, choose New → Blueprint, connect that GitHub repository, and deploy the detected `render.yaml`.
During Blueprint setup, enter your Groq API key when Render prompts for `GROQ_API_KEY`. Never place it in `public/`, `index.html`, `supabase-config.js`, or GitHub.
After deployment, open `https://YOUR-SERVICE.onrender.com/api/health`. Confirm that `ok` is `true` and `chatConfigured` is `true`.
Edit `public/supabase-config.js` with your Supabase Project URL and anon/public key (the anon key is intended for browser use; protect all tables with the supplied RLS policies). Run `supabase/schema.sql` in the Supabase SQL Editor, enable Realtime for `public.messages`, and add your deployed HTTPS URL to Supabase Auth's allowed redirect URLs/site URL. Commit and push this change to redeploy.
Add optional secrets in Render → your service → Environment: `DATA_GOV_IN_API_KEY` for mandi data; `SENTINELHUB_CLIENT_ID` and `SENTINELHUB_CLIENT_SECRET` for actual Sentinel-2 NDVI; `TURN_URLS` and `TURN_SHARED_SECRET` for better call connectivity. Redeploy after saving.
Test with two separate accounts and two phones on different networks: sign-up, connection request, chat, call, photo analysis, weather and any configured live data. Check Render Logs and `/api/health` if something fails.
For public launch, upgrade the Render service from Free to a paid always-on plan in the Render dashboard. Render's free web services sleep after 15 minutes idle and may take about a minute to wake, so this is not a good public-launch experience. A free service also has an ephemeral filesystem; keep user data in Supabase, not local files.
Costs and secret handling
Hosting, Groq (and optional Gemini) API use, Supabase limits/paid features, Sentinel Hub imagery and TURN relay traffic may have separate charges. Check each provider's current pricing before launch. Add optional variables only when you have created the relevant provider account. Do not send secret API keys in chat or commit them to GitHub.
