# Set up Groq for GramSutra AI

This build uses Groq by default for Pragati AI chat, app translations, and crop-photo diagnosis. Google Gemini remains an optional fallback when no Groq key is configured.

## 1. Create a Groq API key

1. Open https://console.groq.com/keys and sign in.
2. Create a new API key.
3. Copy it once and store it privately. Never paste it into the browser, `public/`, GitHub, or a chat message.

## 2. Add it to Render

1. Open https://dashboard.render.com/ and select the GramSutra web service.
2. Open **Environment** → **Environment Variables**.
3. Add `GROQ_API_KEY` and paste your Groq key as its value.
4. Keep `GROQ_MODEL` as `llama-3.3-70b-versatile` unless you have selected another chat model available to your Groq account.
5. Keep `GROQ_VISION_MODEL` as `qwen/qwen3.8-27b` for crop photo analysis, if that model is enabled for your account.
6. Save and redeploy.

## 3. Verify

Open `https://YOUR-SERVICE.onrender.com/api/health`. With Groq configured, expect `chatConfigured: true`, `translationConfigured: true`, and `provider: "Groq API"`.

Then test Pragati AI with a simple farming question, and select a non-English app language to test UI translation. Test Crop Doctor photo analysis separately.

## Notes

- Groq is selected when `GROQ_API_KEY` exists. If both Groq and Gemini keys exist, Groq is preferred for chat and translations. Crop photo analysis also prefers Groq Vision.
- Gemini is an optional fallback for chat and translation if `GROQ_API_KEY` is absent and `GEMINI_API_KEY` is configured.
- Keep all provider keys on the Node server in Render environment variables. Never place them in `public/` or frontend JavaScript.
- Model availability, rate limits, and account quotas are controlled by Groq. Check https://console.groq.com/docs/models and your GroqCloud console if a model is rejected.
