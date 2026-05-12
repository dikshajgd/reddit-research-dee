import { NextResponse } from "next/server";
import { buildSearchUrls, chunkUrls } from "@/lib/search-urls";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/runs/{runId}/step2/more
// Starts another scrape pass that reuses the priority pairs but advances the
// keyword slice. Existing threads stay in the blob; the batch route's dedup
// step prevents duplicates from inflating the thread count.
export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = state.step1.parsed;
  if (!parsed) {
    return NextResponse.json({ error: "Step 1 must complete first" }, { status: 400 });
  }
  if (state.step2.status !== "complete" && state.step2.status !== "uploaded") {
    return NextResponse.json(
      { error: "Cannot scrape more — current pass is not complete" },
      { status: 400 },
    );
  }
  if (state.step2.method === "uploaded") {
    return NextResponse.json(
      { error: "Cannot scrape more on uploaded data" },
      { status: 400 },
    );
  }

  const prevPass = state.step2.passCount ?? 1;
  const nextPass = prevPass + 1;
  const urls = buildSearchUrls(parsed, nextPass - 1);

  if (!urls.length) {
    return NextResponse.json(
      { error: "No additional keywords available — every priority pair is exhausted." },
      { status: 400 },
    );
  }

  const batches = chunkUrls(urls);

  const updated = await updateRun(runId, (s) => {
    // Reset step2 progress for the new pass but KEEP threads + threadCount.
    s.step2.status = "running";
    s.step2.method = "apify";
    s.step2.plannedBatches = batches.length;
    s.step2.completedBatches = 0;
    s.step2.startedAt = Date.now();
    s.step2.completedAt = undefined;
    s.step2.error = undefined;
    s.step2.passCount = nextPass;
    appendLog(
      s,
      "info",
      `Step 2 pass ${nextPass} planned ${batches.length} Apify batches (current threads: ${s.step2.threadCount}).`,
    );
  });

  return NextResponse.json({ ...updated, batches, pass: nextPass });
}
