# Reddit VOC Tool — Self-Hosting Handoff

This is a complete, self-contained guide for standing up the Reddit VOC Tool on the receiver's own accounts. It is written for an AI coding agent (e.g. Claude Code) to read once and execute end-to-end. No prior context on the codebase is assumed.

---

## What this is

A Next.js 15 (App Router) web app that runs a 5-step voice-of-customer (VOC) research pipeline against Reddit:

1. **Keyword & Subreddit Generation** — single Claude call → `SUBREDDIT NAMES {product}.md`
2. **Reddit Scraping** — Apify actor `trudax/reddit-scraper-lite`, batched, capped, dedup'd
3. **VOC Extraction** — single Claude call when input ≤ 400 k chars; otherwise chunk-by-50 + merge call
4. **Persona Clustering** — single Claude call → `PERSONAS {product}.md`
5. **Manual Review** — edit the generated markdown in-browser, save back to Blob

Each step is its own serverless API route capped at 300 s; the client drives the pipeline forward and polls for state. The full architecture is described in `README.md`.

---

## Prerequisites — accounts to provision

Before doing anything, create accounts on:

1. **GitHub** — to host the source.
2. **Vercel** (Pro plan required) — the Hobby plan caps function timeout at 60 s; this app needs `maxDuration = 300` for Step 2 (Apify) and Step 3 (chunked Claude calls). Sign up at vercel.com.
3. **Anthropic Console** — for the Claude API key. Sign up at console.anthropic.com. Add at least a small amount of credit to the account.
4. **Apify** — for Reddit scraping. Sign up at apify.com. The free tier works for small tests but production usage will require pay-as-you-go credit. Note the API token under Settings → Integrations → API tokens.

Have a billing-enabled card on Anthropic and Apify before the first run, or the pipeline will fail at Step 1 / Step 2 respectively.

---

## Step 1 — Push the code to a new GitHub repo

From inside the extracted project directory (`reddit-voc-tool-next/`):

```bash
git init
git add .
git commit -m "Initial commit"
```

On github.com:
- Click **New repository**
- Name it whatever (suggested: `reddit-voc-tool`)
- Keep it **Private** unless there's a reason to make it public
- **Do not** check "Add README" / `.gitignore` / license — the project already has them
- Click **Create repository**

Back in the terminal:

```bash
git remote add origin https://github.com/<your-account>/<repo-name>.git
git branch -M main
git push -u origin main
```

If `git push` prompts for credentials and the password field doesn't accept a real password, generate a **classic Personal Access Token** at github.com → Settings → Developer settings → Personal access tokens → Tokens (classic), with the `repo` scope, and paste it as the password.

---

## Step 2 — Import into Vercel and add the two API keys

On vercel.com (logged in with the same GitHub account, or one that has access to the repo):

1. Click **Add New… → Project**
2. Find the repo just pushed → click **Import**
3. Framework Preset will auto-detect as **Next.js**. Leave **Root Directory** as `./`
4. **Before clicking Deploy**, expand **Environment Variables** and add these two for **All Environments** (Production, Preview, Development):

   | Name | Value source |
   |---|---|
   | `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys → Create Key (starts with `sk-ant-...`) |
   | `APIFY_API_TOKEN`   | apify.com → Settings → Integrations → API tokens (starts with `apify_api_...`) |

5. Click **Deploy**. The build will succeed but the app will not yet be functional — three more env vars come from Storage in the next steps.

---

## Step 3 — Add Vercel Blob storage

In the new Vercel project:

1. Click the **Storage** tab in the top nav
2. **Create Database → Blob**
3. Name: anything (e.g. `voc-blob`)
4. Region: default `iad1` (Washington, D.C.) is fine unless most users are elsewhere
5. **Access: Public** — the app uses public URLs with UUID-based `runId` paths; privacy comes from the fact that the URLs are unguessable. Do not pick Private; the code does not handle signed URL retrieval.
6. **Create**
7. When prompted to **Connect Project**, pick this Vercel project. Leave **Custom Prefix empty**.
8. This auto-injects `BLOB_READ_WRITE_TOKEN` into the project's env vars.

---

## Step 4 — Add Upstash Redis (replacement for the deprecated Vercel KV)

Vercel KV is end-of-life; this app uses `@vercel/kv` against an Upstash-backed Redis store via the Vercel Marketplace.

1. **Storage → Create Database → Browse Marketplace**
2. Pick **Upstash → Redis** (under "Marketplace Database Providers"). **Do not pick the standalone "Redis" provider** — that one is Redis Cloud and injects a `REDIS_URL` connection string, which `@vercel/kv` cannot use.
3. Configuration:
   - **Primary Region**: same as Blob (`iad1` default).
   - **Read Regions**: leave empty.
   - **Eviction**: off — the app sets its own TTLs.
   - **Plan**: Free is enough to start (500k monthly commands).
4. Continue → confirm → **Create**.
5. When prompted to connect to a project, pick this Vercel project. Leave **Custom Prefix empty**. This injects:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - plus `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` — the app ignores these but they are harmless.

---

## Step 5 — Verify environment variables

In the Vercel project → **Settings → Environment Variables** → confirm these **five** keys are listed (the order doesn't matter):

- `ANTHROPIC_API_KEY`
- `APIFY_API_TOKEN`
- `BLOB_READ_WRITE_TOKEN`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

If any is missing, go back to the step that should have created it. The two manually-added keys (Anthropic, Apify) should be enabled for All Environments; the three storage-injected keys are usually set to All Environments by default.

---

## Step 6 — Redeploy

The env vars added after the initial deploy do not take effect until the next build.

- **Deployments** tab → click the latest deployment row → on the deployment page click the **⋮** (top-right) → **Redeploy** → confirm.
- Wait ~2 min for build + deploy to finish (status: **Ready**).

---

## Step 7 — Smoke test

Open the deployment URL (visible on the project's overview page, e.g. `<repo-name>-<hash>.vercel.app`).

1. Form should render with title "Reddit VOC Research Pipeline".
2. Fill in a small test:
   - **Product / Category**: `greens powder`
   - **Industry / Niche**: `health supplements`
   - Leave Brand URL and Extra Keywords blank.
   - Slide **Max threads per keyword** to `20` and **Max comments per thread** to `25` (cheap, fast).
3. Click **🚀 Run Pipeline**. The browser navigates to `/runs/<uuid>`.
4. Expected timeline:
   - Step 1 finishes in ~30–60 s (✅).
   - Step 2 runs ~3–10 min (varies with Apify). The batch counter ticks up `0/4 → 4/4`.
   - When Step 2 finishes, a "Scraping done" card appears with **Continue to Step 3** and **➕ Scrape more** buttons. Click **Continue to Step 3**.
   - Step 3 runs ~30–90 s.
   - Step 4 runs ~30–60 s.
   - The Manual Review tab unlocks.

If anything fails, see **Troubleshooting** below.

---

## Architecture quick-reference

For the AI agent running this handoff, here are the key files when debugging or extending:

- `lib/types.ts` — `RunState` schema (the per-step state stored in Redis)
- `lib/store.ts` — Redis key layout (`run:{runId}`, `runs:index` sorted set, per-batch / per-chunk records) and the `backfillIndexIfEmpty()` helper
- `lib/anthropic.ts` — Anthropic SDK wrapper; model is `claude-sonnet-4-6` (configurable in one place)
- `lib/apify.ts` — Apify wrapper with `start() + waitForFinish()` + abort support
- `lib/timing.ts` — hardcoded per-step baseline durations for the "≈ N min" UI hint
- `lib/prompts/keyword_cluster.md`, `lib/prompts/voc_extraction.md`, `lib/prompts/persona_cluster.ts` — verbatim prompts for Steps 1, 3, 4
- `components/PipelineRunner.tsx` — client-side driver that walks the pipeline, with pause/resume/stop wiring
- `components/StepProgress.tsx` — the 5 step cards with timers + progress bars
- `app/api/runs/[runId]/step2/batch/route.ts` — Apify call site; caps posts-per-URL at 10
- `app/api/runs/[runId]/step3/chunk/route.ts` + `merge/route.ts` — chunked VOC extraction
- Each `app/api/runs/[runId]/...` route exports `maxDuration = 300`

Run state lives in Redis at `run:{runId}` indefinitely. Per-batch and per-chunk records have a 14-day TTL. Artifacts (markdown + scraped JSON) live in Blob under `runs/{runId}/...`. The browser polls `GET /api/runs/{runId}` every 2 s while a step is running.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Step 2 times out at ~60 s | Vercel project is on the Hobby plan | Upgrade to Pro. The app needs `maxDuration = 300`. |
| Logs show `ANTHROPIC_API_KEY not set` | Env var not applied to the current deployment | Confirm it's set under Settings → Environment Variables, then redeploy (Step 6). |
| Logs show `APIFY_API_TOKEN not set` | Same as above | Same fix. |
| Step 2 finishes with `Apify returned no results` | Real possibility on niche queries; or Apify account has no credit | Use the **Retry from Step 2** button, or upload a manual JSON/markdown dump via the recovery card. |
| `/runs` page shows fewer runs than expected | Sessions index hasn't been backfilled for runs created before the index existed | The page calls `backfillIndexIfEmpty()` automatically on first load; if it still looks wrong, inspect Redis via Upstash console for the `runs:index` sorted set. |
| Apify spend higher than expected | Too many threads × too many comments × too many batches | Lower the sliders on the form (defaults are 20 threads × 25 comments). Cost is roughly linear in `threads × comments × URLs scraped`. The code caps posts-per-URL at 10 in `app/api/runs/[runId]/step2/batch/route.ts`. |
| Step 2 stuck `running` with downstream steps already `complete` | Stale state from a previous "Scrape more" pass that didn't finish | `getRun()` in `lib/store.ts` auto-repairs this on the next read (folds upstream forward to `complete`). Reload the page once. |
| Pause/Resume seems to do nothing | A long-running Apify call or Claude call is in flight; pause prevents the **next** request but doesn't kill the current one | Wait for the current call to drain (or click **Stop**, which also aborts an active Apify run). |

---

## For the sender (operator handing this off)

Skip this section if you're the receiver.

To package the project for handoff, run from the **parent** directory of `reddit-voc-tool-next/`:

```bash
tar --exclude='reddit-voc-tool-next/.git' \
    --exclude='reddit-voc-tool-next/node_modules' \
    --exclude='reddit-voc-tool-next/.next' \
    --exclude='reddit-voc-tool-next/.vercel' \
    --exclude='reddit-voc-tool-next/.env*' \
    -czf reddit-voc-tool-next-handoff.tar.gz reddit-voc-tool-next/
```

Send the resulting `reddit-voc-tool-next-handoff.tar.gz` to the receiver, with the instruction:

> Extract this, `cd` into `reddit-voc-tool-next/`, and follow `HANDOFF.md` top to bottom.
