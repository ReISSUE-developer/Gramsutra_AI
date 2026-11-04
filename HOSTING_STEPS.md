# Publish GramSutra with Render (recommended first deployment)

This project is a Node.js web app. Deploy the whole project as a **Web Service**, not as a static site. The same Render service serves the website and `/api/chat`, which avoids the browser `Failed to fetch` problem caused by hosting only `public/`.

## A. Put the files in GitHub

1. Extract this ZIP on your computer.
2. On GitHub, create a **Private** repository named `gramsutra`.
3. Upload the contents of this extracted folder to the repository root. At the top level you must see `server.js`, `package.json`, `render.yaml`, `public/`, and `supabase/`.
4. Do not upload `.env` or any API secret. `.gitignore` excludes `.env`.

## B. Deploy to Render

1. Sign in at https://render.com/.
2. Choose **New → Blueprint** and connect GitHub if asked.
3. Select the `gramsutra` repository. Render reads `render.yaml` and creates the Node web service.
4. When prompted for `GROQ_API_KEY`, enter your key from https://console.groq.com/keys. You can optionally add `GEMINI_API_KEY` as a fallback. Do not put the key in GitHub or a browser file.
5. Complete deployment. Render assigns a free `onrender.com` subdomain automatically.
6. Open `https://YOUR-SERVICE.onrender.com/api/health`. Confirm `ok` is `true` and `chatConfigured` is `true`.
7. Open `https://YOUR-SERVICE.onrender.com` and send a test question to Pragati AI.

The included Render plan is Free for initial testing. Free web services sleep after 15 minutes without inbound traffic and may take about a minute to wake. Upgrade the service to an always-on paid plan before a public launch. Hosting and AI provider usage are separate; review Groq and any optional Gemini pricing and limits.

## C. Connect Supabase (community features)

1. Create a project at https://supabase.com/.
2. Copy the Project URL and anon/publishable key into `public/supabase-config.js` (not the service_role key).
3. In Supabase SQL Editor, run `supabase/schema.sql`.
4. Enable Realtime for `public.messages` and add the Render URL to Supabase Auth's Site URL / allowed redirect URLs.
5. Commit and push the changed `public/supabase-config.js` to GitHub; Render will redeploy.

## D. Android / Capacitor

For the web app opened at the Render URL, leave `public/api-config.js` empty: same-origin API calls work automatically. If you package the frontend in Android, set:

```js
window.GRAMSUTRA_API = 'https://YOUR-SERVICE.onrender.com';
```

in `public/api-config.js`, rebuild the Android app, and ensure the server's `ALLOWED_ORIGINS` includes `capacitor://localhost` if using that origin.

## Troubleshooting Pragati AI

- If `/api/health` does not open, the Node service is not deployed or is not running. Check Render → service → Logs.
- If `chatConfigured` is false, add/fix `GROQ_API_KEY` in Render → Environment and redeploy (or configure the optional `GEMINI_API_KEY` fallback).
- If `chatConfigured` is true but chat reports a provider error, inspect Render Logs and the Google AI Studio's API usage/billing.
- If the web app loads but chat says it cannot reach the server, make sure you opened the Render **Web Service** URL and not a GitHub Pages/static-site URL or a local `file://` copy.
