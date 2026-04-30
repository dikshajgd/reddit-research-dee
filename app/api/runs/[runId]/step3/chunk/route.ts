import { NextResponse } from "next/server";
import { callClaude, stripPreamble, withNoPreamble } from "@/lib/anthropic";
import { blobPath, fetchJson, putText } from "@/lib/blob";
import {
  CHUNK_SIZE,
  chunkItems,
  formatScrapedData,
  MAX_INPUT_CHARS,
} from "@/lib/format-thread";
import { loadVocPrompt } from "@/lib/load-prompt";
import { appendLog, getChunk, getRun, setChunk, updateRun } from "@/lib/store";
import type { RedditThread } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/runs/{runId}/step3/chunk?i=N
// When plannedChunks === 1, runs the entire dataset in one call (Python parity).
export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const url = new URL(req.url);
  const i = Number(url.searchParams.get("i"));
  if (!Number.isInteger(i) || i < 0) {
    return NextResponse.json({ error: "missing chunk index ?i=" }, { status: 400 });
  }

  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!state.step2.threadsBlobUrl) {
    return NextResponse.json({ error: "Step 2 missing" }, { status: 400 });
  }

  const existing = await getChunk(runId, i);
  if (existing?.status === "complete" && existing.blobUrl) {
    return NextResponse.json({ ok: true, alreadyComplete: true });
  }

  const threads = await fetchJson<RedditThread[]>(state.step2.threadsBlobUrl);
  const { product, industry, brandUrl } = state.input;
  const systemPrompt = withNoPreamble(loadVocPrompt({ product, industry }));

  await setChunk(runId, i, { status: "running" });

  try {
    let userContent: string;
    let labelChunks = state.step3.plannedChunks;

    if (labelChunks === 1) {
      const fullText = formatScrapedData(threads);
      // Defensive: if dataset grew past the single-call threshold, bail.
      if (fullText.length > MAX_INPUT_CHARS) {
        return NextResponse.json(
          { error: "Dataset exceeds single-call limit; restart Step 3" },
          { status: 400 },
        );
      }
      userContent = "Here are the raw Reddit threads and comments to analyze.\n\n";
      if (brandUrl) userContent += `Brand context: ${brandUrl}\n\n`;
      userContent += fullText;
    } else {
      const chunks = chunkItems(threads, CHUNK_SIZE);
      const chunk = chunks[i];
      if (!chunk) return NextResponse.json({ error: "chunk index OOB" }, { status: 400 });
      const chunkText = formatScrapedData(chunk);
      userContent = `Analyze this batch of Reddit threads (batch ${i + 1} of ${chunks.length}).\n\n`;
      if (brandUrl) userContent += `Brand context: ${brandUrl}\n\n`;
      userContent += chunkText;
      labelChunks = chunks.length;
    }

    const raw = await callClaude(systemPrompt, userContent, 16000);
    const partial = stripPreamble(raw);

    const blobUrl = await putText(blobPath(runId, `step3-chunk-${i}.md`), partial);
    await setChunk(runId, i, { status: "complete", blobUrl });

    const updated = await updateRun(runId, (s) => {
      s.step3.completedChunks = Math.min(s.step3.completedChunks + 1, s.step3.plannedChunks);
      // Insert at correct position
      const arr = s.step3.chunkBlobUrls.slice();
      arr[i] = blobUrl;
      s.step3.chunkBlobUrls = arr;
      appendLog(s, "info", `Step 3 chunk ${i + 1}/${labelChunks} complete (${partial.length} chars).`);

      // Single-chunk path: this IS the final document.
      if (s.step3.plannedChunks === 1) {
        s.step3.blobUrl = blobUrl;
        s.step3.status = "complete";
        s.step3.completedAt = Date.now();
        appendLog(s, "info", "Step 3 complete (single call).");
      } else if (s.step3.completedChunks >= s.step3.plannedChunks) {
        s.step3.status = "merging";
      }
    });

    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setChunk(runId, i, { status: "failed", error: msg });
    const updated = await updateRun(runId, (s) => {
      s.step3.status = "failed";
      s.step3.error = msg;
      s.step3.completedAt = Date.now();
      appendLog(s, "error", `Step 3 chunk ${i + 1} failed: ${msg}`);
    });
    return NextResponse.json(updated, { status: 500 });
  }
}
