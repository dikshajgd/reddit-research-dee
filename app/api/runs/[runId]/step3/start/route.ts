import { NextResponse } from "next/server";
import { fetchJson } from "@/lib/blob";
import { CHUNK_SIZE, formatScrapedData, MAX_INPUT_CHARS } from "@/lib/format-thread";
import { appendLog, getRun, updateRun } from "@/lib/store";
import type { RedditThread } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!state.step2.threadsBlobUrl) {
    return NextResponse.json({ error: "Step 2 has no threads" }, { status: 400 });
  }

  const threads = await fetchJson<RedditThread[]>(state.step2.threadsBlobUrl);
  if (!threads.length) {
    return NextResponse.json({ error: "No threads to analyze" }, { status: 400 });
  }

  const fullText = formatScrapedData(threads);
  const planned =
    fullText.length <= MAX_INPUT_CHARS ? 1 : Math.ceil(threads.length / CHUNK_SIZE);

  const updated = await updateRun(runId, (s) => {
    s.step3 = {
      status: "running",
      plannedChunks: planned,
      completedChunks: 0,
      chunkBlobUrls: [],
    };
    appendLog(s, "info", `Step 3 planned ${planned} chunk(s). Total ${threads.length} threads.`);
  });

  return NextResponse.json({ ...updated, plannedChunks: planned, threadCount: threads.length });
}
