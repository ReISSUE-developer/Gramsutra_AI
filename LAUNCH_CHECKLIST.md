# GramSutra AI: launch checklist (Play Store and App Store)

Checked 1 Nov 2026. Store rules and free-tier limits change, so confirm in each console.

## 1. Turn on the live data (all keys live on the server, never in public/)
| Data | Source | What to set |
|---|---|---|
| Temperature, humidity, rain, wind | Open-Meteo | Nothing (no key). See licence note below. |
| Mandi prices | data.gov.in Agmarknet | DATA_GOV_IN_API_KEY (free key from data.gov.in) |
| Satellite crop health (NDVI) | Sentinel Hub | SENTINELHUB_CLIENT_ID and SENTINELHUB_CLIENT_SECRET |
| Pragati AI chat and app translation | Groq (preferred), Gemini fallback | GROQ_API_KEY, GROQ_MODEL; optional GEMINI_API_KEY |
| Crop photo diagnosis | Groq Vision (preferred), Gemini fallback | GROQ_API_KEY, GROQ_VISION_MODEL; optional GEMINI_API_KEY |
| Community accounts and chat | Supabase | public/supabase-config.js, run supabase/schema.sql |
| In-app account deletion | Supabase admin API | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server only) |

Field area: the farmer taps the boundary points on the satellite map and the app calculates the area. The app does not automatically recognise land parcels, and there is no public API for official land records. Say "draw your field" in the store text, not "detects your land".

Open-Meteo licence: the free service is for non-commercial use only (under 10,000 calls a day). If you charge, show ads or run this as a business, take its paid plan or use another weather source.

## 2. Host the server (Render free plan is fine for testing)
Follow HOSTING_STEPS.md. Move to an always-on paid plan before a public launch, because the free plan sleeps.

## 3. Wrap the app for phones
1. Install Node.js 18+, then in this folder run: `npm install`
2. Set `window.GRAMSUTRA_API = 'https://YOUR-SERVICE.onrender.com'` in public/api-config.js
3. Run `npm run cap:add`, then `npm run cap:sync`
4. Set compileSdk and targetSdk to 36 in android/variables.gradle (Google requires API 36 or higher for new apps).

## 4. Google Play
- Play Console account: one-time US$25 plus identity verification.
- Personal accounts created after 13 Nov 2023 need a closed test with 12 or more testers for 14 days before production. Organization accounts are exempt.
- Build a signed .aab in Android Studio (Build > Generate Signed Bundle). Back up the keystore and passwords.
- Fill in: privacy policy URL (your-site/privacy.html), Data safety (location, photos and messages are sent to the server; accounts optional; no ads), content rating, target audience.

## 5. Apple App Store
- Apple Developer Program: US$99 per year.
- You need a Mac with Xcode (or a cloud Mac build service) to build the iOS app.
- Guideline 4.2 (minimum functionality): Apple rejects apps that feel like a repackaged website. Before submitting, add real phone features: native location permission, camera for crop photos (both plugins are already in package.json), offline-friendly screens with a friendly message instead of a browser error, and optional push alerts for rain warnings.
- Guideline 5.1.1(v): apps with account creation must let people delete the account inside the app. The "Delete my account" button added in this build does this. Test it.
- Fill in App Privacy labels to match privacy.html, add screenshots, and put test steps in the review notes. Make sure every screen works without sign-in.
- Typical review takes 1 to 3 days, and first submissions are often rejected once, so leave time.

## 6. Before you press Submit
- Replace every [bracket] in public/privacy.html (name, email) and host the page on a public address.
- Replace all sample data. Reviewers and farmers will notice invented prices or fake weather.
- Keep disclaimers: guidance only, not certified agronomic, legal or financial advice.
- Test on a real Android phone and a real iPhone: GPS permission, camera, no internet, slow internet.

## 7. Extras added in this version
- Communities: run the new block at the end of supabase/schema.sql. Apple (Guideline 1.2) expects apps with user-generated content to offer reporting, a way to block abusive users, and a contact address. Reporting is built in. Add blocking and a moderator who reviews the community_reports table before you submit to Apple.
- Camera: after `npm run cap:add`, add `<uses-permission android:name="android.permission.CAMERA"/>` and the location permissions to android/app/src/main/AndroidManifest.xml. In ios/App/App/Info.plist add NSCameraUsageDescription, NSPhotoLibraryUsageDescription and NSLocationWhenInUseUsageDescription with a plain sentence explaining why.
- Satellite map: Home uses Esri World Imagery tiles with attribution. Check Esri's terms for a commercial store app, or switch to a paid tile provider such as MapTiler or Mapbox.
- App icon: see assets/ (icon-only.png, icon-foreground.png, icon-background.png, splash.png). Run `npm install` then `npm run assets` to generate every Android and iOS icon size.
