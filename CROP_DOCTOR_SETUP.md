# Pragati AI Crop Doctor

The Crop Doctor lets a farmer take or upload a crop photo, preview it, and ask a vision model to review visible symptoms. The result is decision support, not a confirmed diagnosis.

## Render environment

For the Groq vision path, set these environment variables in Render → your web service → Environment:

- `GROQ_API_KEY`: your private Groq API key (keep it on the server; never put it in `public/` or commit it).
- `GROQ_VISION_MODEL`: `qwen/qwen3.8-27b` (default in this project).

The server uses Groq Vision when `GROQ_API_KEY` is present. If it is absent, it falls back to `GEMINI_API_KEY` and `GEMINI_MODEL`.

After changing environment variables, redeploy the service. Check `/api/health`; look for `cropDiagnosisConfigured: true` and `cropVisionProvider`.

## How farmers use it

1. Open Explore → AI crop photo check (or the Crop Doctor shortcut).
2. Enter the crop name and describe what changed.
3. Take a photo or choose a clear JPEG, PNG, or WEBP image (up to 7 MB).
4. Check the preview and select Analyse crop photo.
5. Read the possible causes and safe first steps. Ask a local KVK/agriculture officer to confirm before treatment.

For better results, photograph the affected leaf close-up in natural light and include a second photo of the whole plant. Avoid blurry, dark, or heavily filtered images.

## Safety

The model must report uncertainty, describe visible observations and possible causes, and avoid prescribing pesticide products or chemical doses. Similar symptoms can have different causes; a photo alone cannot confirm a disease.
