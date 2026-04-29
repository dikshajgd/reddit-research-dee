# Reddit VOC Tool — Next.js

Next.js 15 (App Router) port of the Streamlit `reddit-voc-tool/` pipeline.
Identical pipeline logic and Claude prompts — only the UI and infra change.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Anthropic TypeScript SDK (`@anthropic-ai/sdk`), model `claude-sonnet-4-6`
- Apify Node SDK (`apify-client`) for Reddit scraping
- Vercel Blob for pipeline artifacts (markdown + JSON)
- Vercel KV for run state across steps
- `@uiw/react-md-editor` for the manual review step

## Pipeline (5 steps)

1. **Keyword & Subreddit Generation** — single Claude call → `SUBREDDIT NAMES {product}.md`
2. **Reddit Scraping** — Apify `trudax/reddit-scraper-lite`, batched 6 URLs at a time
3. **VOC Extraction** — single Claude call when input ≤400k chars; otherwise chunk-by-50 + merge call
4. **Persona Clustering** — single Claude call → `PERSONAS {product}.md`
5. **Manual Review** — edit markdown, save back to Blob

## Architecture

- Each step is its own API route with `maxDuration = 300`.
- Step 2 (Apify) and Step 3 (chunking) split work into per-batch / per-chunk requests, driven from the client. Each batch/chunk is idempotent (KV record per index).
- Run state is a single JSON blob in KV at `run:{runId}`; per-batch and per-chunk records at `run:{runId}:step2:batch:{i}` and `run:{runId}:step3:chunk:{i}`.
- Artifacts live in Blob under `runs/{runId}/...`. Friendly download names (`SUBREDDIT NAMES …`, `REDDIT VOC …`, `PERSONAS …`) are applied via `Content-Disposition` in `/api/runs/{runId}/download/{file}`.
- Client polls `GET /api/runs/{runId}` every 2s while a step is running.

## Env vars

```
ANTHROPIC_API_KEY=
APIFY_API_TOKEN=
BLOB_READ_WRITE_TOKEN=
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Deploy to Vercel

1. Create the project, link this directory.
2. Add a **Vercel KV** store and a **Vercel Blob** store; both auto-inject the env vars above.
3. Set `ANTHROPIC_API_KEY` and `APIFY_API_TOKEN` in Project Settings → Environment Variables.
4. Deploy. Pipeline routes need the **Pro** plan for the 300s `maxDuration`.

## Differences from the Streamlit version

- **Web-search fallback dropped.** The Python version shells out to the `claude` CLI when Apify fails; this can't run on Vercel. Recovery UI (retry / upload your own Reddit data) is preserved.
- **Outputs go to Vercel Blob** instead of a local `outputs/` folder. Filenames are normalized internally; download endpoints serve them with the original Streamlit names.
- **State lives in Vercel KV** (keyed by `runId`) instead of `st.session_state`.
- **Model:** uses `claude-sonnet-4-6` everywhere.
