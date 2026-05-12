import { NextResponse } from "next/server";
import { deduplicateThreads, runApifyBatch } from "@/lib/apify";
import { blobPath, fetchJson, putJson } from "@/lib/blob";
import { buildSearchUrls, chunkUrls, MAX_TOTAL_THREADS } from "@/lib/search-urls";
import { appendLog, getBatch, getRun, setBatch, updateRun } from "@/lib/store";
import type { RedditThread } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/runs/{runId}/step2/batch?i=N&pass=P
// Idempotent: re-running a completed batch is a no-op.
// `pass` defaults to 1 for backward compatibility with pre-pass-aware clients.
export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const url = new URL(req.url);
  const i = Number(url.searchParams.get("i"));
  const passParam = url.searchParams.get("pass");
  const pass = Number.isInteger(Number(passParam)) ? Number(passParam) : 1;
  if (!Number.isInteger(i) || i < 0) {
    return NextResponse.json({ error: "missing batch index ?i=" }, { status: 400 });
  }
  if (pass < 1) {
    return NextResponse.json({ error: "invalid pass" }, { status: 400 });
  }

  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = state.step1.parsed;
  if (!parsed) return NextResponse.json({ error: "Step 1 incomplete" }, { status: 400 });

  const existing = await getBatch(runId, pass, i);
  if (existing?.status === "complete") {
    return NextResponse.json({ ok: true, alreadyComplete: true });
  }

  const allUrls = buildSearchUrls(parsed, pass - 1);
  const batches = chunkUrls(allUrls);
  const batchUrls = batches[i];
  if (!batchUrls) return NextResponse.json({ error: "batch index out of range" }, { status: 400 });

  await setBatch(runId, pass, i, { status: "running" });

  try {
    // Hard-cap posts-per-URL to keep Apify spend predictable.
    const items = await runApifyBatch(
      batchUrls,
      Math.min(10, state.config.maxThreads),
      state.config.maxComments,
    );

    // Merge into the run's accumulating thread list (stored in blob).
    let accumulated: RedditThread[] = [];
    const current = await getRun(runId);
    if (current?.step2.threadsBlobUrl) {
      try {
        accumulated = await fetchJson<RedditThread[]>(current.step2.threadsBlobUrl);
      } catch {
        accumulated = [];
      }
    }
    const merged = deduplicateThreads([...accumulated, ...items]).slice(0, MAX_TOTAL_THREADS);
    const newUnique = merged.length - accumulated.length;
    const threadsBlobUrl = await putJson(blobPath(runId, "step2-threads.json"), merged);

    await setBatch(runId, pass, i, { status: "complete", threadCount: items.length });

    const updated = await updateRun(runId, (s) => {
      s.step2.completedBatches = Math.min(s.step2.completedBatches + 1, s.step2.plannedBatches);
      s.step2.threadCount = merged.length;
      s.step2.threadsBlobUrl = threadsBlobUrl;
      appendLog(
        s,
        "info",
        `Step 2 pass ${pass} batch ${i + 1}: +${items.length} raw, +${newUnique} new unique (total ${merged.length}).`,
      );

      if (s.step2.completedBatches >= s.step2.plannedBatches) {
        s.step2.completedAt = Date.now();
        if (merged.length === 0) {
          s.step2.status = "failed";
          s.step2.method = "none";
          s.step2.error =
            "Apify returned no results. You can retry or upload your own Reddit data.";
          appendLog(s, "warn", "Step 2 finished with 0 threads.");
        } else {
          s.step2.status = "complete";
          s.step2.method = "apify";
          appendLog(s, "info", `Step 2 pass ${pass} complete. ${merged.length} threads total.`);
        }
      }
    });

    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setBatch(runId, pass, i, { status: "failed", error: msg });
    const updated = await updateRun(runId, (s) => {
      // Don't fail the whole step on one batch — surface the error in logs.
      appendLog(s, "error", `Step 2 pass ${pass} batch ${i + 1} failed: ${msg}`);
      s.step2.completedBatches = Math.min(s.step2.completedBatches + 1, s.step2.plannedBatches);
      if (s.step2.completedBatches >= s.step2.plannedBatches) {
        s.step2.completedAt = Date.now();
        if (s.step2.threadCount > 0) {
          s.step2.status = "complete";
          s.step2.method = "apify";
        } else {
          s.step2.status = "failed";
          s.step2.method = "none";
          s.step2.error = msg;
        }
      }
    });
    return NextResponse.json(updated, { status: 500 });
  }
}
