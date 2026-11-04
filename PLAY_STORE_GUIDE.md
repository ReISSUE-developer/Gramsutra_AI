# Publish GramSutra AI on Google Play

Facts below were checked on 1 Nov 2026. Google changes these rules, so confirm in Play Console.

## What Google requires (current)
- Play Console account: one-time US$25 fee plus identity verification.
- If your personal account was created after 13 Nov 2023: run a closed test with at least 12 testers opted in for 14 continuous days before you can apply for production. Organization accounts (need a D-U-N-S number) skip this.
- Upload an Android App Bundle (.aab), not an APK.
- New apps and updates must target Android 16 (API level 36) or higher.
- You also need: store listing, icon, screenshots, content rating, Data safety form, and a public privacy policy link.

## Step 1: Put the server online (needed for the Pragati AI chatbot)
1. Upload this folder to a Node host (Render, Railway or a VPS). Start command: `npm start`.
2. Set `GROQ_API_KEY` on the host for Pragati AI chat, app translations and crop-photo review. `GEMINI_API_KEY` is an optional fallback.
3. Optional integrations: `DATA_GOV_IN_API_KEY` for Agmarknet market data; `SENTINELHUB_CLIENT_ID` and `SENTINELHUB_CLIENT_SECRET` for Sentinel-2 NDVI; `TURN_URLS`, `TURN_SHARED_SECRET` and optionally `TURN_TTL_SECONDS` for reliable WebRTC calls. See README.md for setup. Never put provider secrets in the app.
4. You get an HTTPS address, e.g. https://gramsutra.onrender.com. Open it in Chrome and test each configured provider.
5. Your privacy policy is at https://YOUR-ADDRESS/privacy.html. Fill in the publisher/contact placeholders in public/privacy.html first.

## Step 2: Point the app at your server
In `public/index.html`, near the top, change
`window.GRAMSUTRA_API='';` to `window.GRAMSUTRA_API='https://YOUR-ADDRESS';`

## Step 3: Build the Android app (Android Studio, or any AI coding assistant or developer)
Install Node.js and Android Studio. Give the instruction below to your coding assistant or developer, working in this folder:

> Wrap this web app as an Android app with Capacitor using capacitor.config.json (appId com.gramsutra.ai, webDir public). Add the android platform, set compileSdk and targetSdk to 36 in android/variables.gradle, set versionCode 1 and versionName 1.0.0, create a launcher icon (bright green background with a white wheat symbol), and make sure the app builds. Then create an upload keystore, configure release signing with it, and build a signed release bundle (.aab). Tell me where the .aab and keystore are, and remind me to back up the keystore and its passwords.

Back up the keystore and passwords in a safe place. If you lose them you cannot update the app.

## Step 4: Play Console
1. Create the app: name GramSutra AI, language English, App (not game), Free.
2. Complete the Dashboard tasks: privacy policy URL, ads (No), app access (all features available, no login), content rating questionnaire, target audience (18+ is simplest), Data safety, government apps (No), financial features (No).
3. Data safety answers must match the services you actually enable. Potential data includes email/profile/village, private messages, marketplace listings and inquiries, farm calendar tasks, user-requested location coordinates, uploaded crop photos, AI chat context, and microphone/camera streams for calls. Depending on enabled integrations, data may be processed by Supabase, Groq, Google Gemini, Open-Meteo, data.gov.in, Sentinel Hub, Esri, a browser speech provider and a TURN relay. Complete the Data safety form after reviewing the deployed app and provider contracts; do not copy generic answers. Match the final disclosures to privacy.html and your retention/deletion practices.
4. Testing > Closed testing: create a track, upload the .aab, add 12 or more tester emails (or a Google Group), and send them the opt-in link. Ask them to install and open the app on several days. Keep it running 14 days in a row.
5. After 14 days, Dashboard > Apply for production, answer the questions, then create the production release with the same .aab.
6. Review usually takes a few days. Expect about three weeks in total on a new personal account.

## Store listing text (edit freely)
Short description (80 characters max): AI crop help, satellite insights, mandi prices and farmer community.

Full description: GramSutra is a multilingual farming companion for Indian farmers. Ask Pragati AI about crops, request a photo-based crop review, check local weather, explore satellite vegetation-health imagery, consult Agmarknet mandi records, plan irrigation, manage an offline farm calendar, save advice, list produce or rent equipment, explore official scheme portals, and connect with farmers through private messages and calls. Availability of live data and AI features depends on configured services and device support. Guidance only; not a confirmed crop diagnosis or certified agronomic, financial or legal advice.

## Before you submit, verify live integrations
Weather uses Open-Meteo after user-initiated location permission. Agmarknet needs a data.gov.in key. Satellite crop-health overlays need Sentinel Hub credentials and a farmer-drawn field boundary. Crop-photo review, Pragati AI chat and app translation need GROQ_API_KEY (or the optional GEMINI_API_KEY fallback). Marketplace and cloud task sync need Supabase configuration. The original dashboard illustration and manual demo controls are not live farm measurements. Test every enabled source and label unavailable/demo content clearly.

## Things to know
- Speech recognition and speech synthesis are device/browser-dependent and may not support every selected language.
- The shell, profile, farm calendar and saved Pragati AI answers are stored locally; calendar tasks sync to Supabase when signed in and online. Live weather, market records, AI, satellite overlays and community functions need internet.
- Crop photos are sent to the configured AI vision provider (Groq by default, or Google Gemini fallback) through the server for analysis. Location is sent only after the farmer taps a location/weather control.
- Marketplace listings and private inquiries require Supabase.
- Local due-task notifications are checked when the app is open; background push notifications for incoming calls/messages are not included.
- Each AI request costs money on the configured provider account. Add billing alerts and stronger abuse controls before launch.
