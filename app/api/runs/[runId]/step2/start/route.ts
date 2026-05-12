import { NextResponse } from "next/server";
import { buildSearchUrls, chunkUrls } from "@/lib/search-urls";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = state.step1.parsed;
  if (!parsed) {
    return NextResponse.json({ error: "Step 1 must complete first" }, { status: 400 });
  }

  // First pass: passIndex = 0.
  const urls = buildSearchUrls(parsed, 0);
  if (!urls.length) {
    const updated = await updateRun(runId, (s) => {
      s.step2.status = "failed";
      s.step2.error = "No search URLs from Step 1 data";
      appendLog(s, "warn", "Step 2: no search URLs to scrape.");
    });
    return NextResponse.json(updated, { status: 400 });
  }

  const batches = chunkUrls(urls);

  const updated = await updateRun(runId, (s) => {
    s.step2 = {
      status: "running",
      method: "apify",
      plannedBatches: batches.length,
      completedBatches: 0,
      threadCount: 0,
      startedAt: Date.now(),
      passCount: 1,
    };
    appendLog(s, "info", `Step 2 pass 1 planned ${batches.length} Apify batches.`);
  });

  return NextResponse.json({ ...updated, batches, pass: 1 });
}
