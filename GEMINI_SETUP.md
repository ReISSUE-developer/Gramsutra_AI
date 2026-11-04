# Optional Google Gemini fallback

GramSutra AI now uses Groq by default for Pragati AI chat, app translations and crop-photo diagnosis. You do not need a Gemini key if `GROQ_API_KEY` is configured.

If you want Google Gemini as a fallback, create a key at https://aistudio.google.com/app/apikey and add it to Render as `GEMINI_API_KEY`. Optionally set `GEMINI_MODEL` to a model enabled for your account. Keep the key server-side only.

Groq is preferred whenever `GROQ_API_KEY` is present. Gemini is used only when the Groq key is absent. See `GROQ_SETUP.md` for the primary setup instructions.
