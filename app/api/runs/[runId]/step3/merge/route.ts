import { NextResponse } from "next/server";
import { callClaude, stripPreamble, withNoPreamble } from "@/lib/anthropic";
import { blobPath, fetchText, putText } from "@/lib/blob";
import { loadVocPrompt } from "@/lib/load-prompt";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

// Port of step3_extract_voc.py:merge_chunks.
export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Single-chunk runs already finalized in /chunk.
  if (state.step3.status === "complete") return NextResponse.json(state);

  const urls = state.step3.chunkBlobUrls.filter(Boolean);
  if (!urls.length) {
    return NextResponse.json({ error: "no chunk results to merge" }, { status: 400 });
  }
  if (urls.length === 1) {
    const updated = await updateRun(runId, (s) => {
      s.step3.blobUrl = urls[0];
      s.step3.status = "complete";
      s.step3.completedAt = Date.now();
      appendLog(s, "info", "Step 3 complete (single chunk, no merge).");
    });
    return NextResponse.json(updated);
  }

  try {
    const partials = await Promise.all(urls.map((u) => fetchText(u)));
    const combined = partials.join("\n\n---\n\n");

    const { product, industry } = state.input;
    const systemPrompt = withNoPreamble(loadVocPrompt({ product, industry }));

    const userMessage =
      `You previously analyzed Reddit data about ${product} in the ${industry} space ` +
      `in ${partials.length} separate batches. Below are all the partial results.\n\n` +
      `Your job is to merge and deduplicate these into a SINGLE cohesive VOC document ` +
      `following the exact format specified above.\n\n` +
      `Rules for merging:\n` +
      `- Combine all quotes from all batches\n` +
      `- Remove exact duplicate quotes\n` +
      `- Re-rank the TOP 15 COPY-READY PHRASES across all batches\n` +
      `- Update frequency tags based on combined data ([HIGH] if 3+ across all batches)\n` +
      `- Write a unified RECURRING THEMES SUMMARY and COMPETITOR PERCEPTION MAP\n\n` +
      `Here are the partial results:\n\n${combined}`;

    const raw = await callClaude(systemPrompt, userMessage, 16000);
    const merged = stripPreamble(raw);

    const blobUrl = await putText(blobPath(runId, "step3.md"), merged);

    const updated = await updateRun(runId, (s) => {
      s.step3.blobUrl = blobUrl;
      s.step3.status = "complete";
      s.step3.completedAt = Date.now();
      appendLog(s, "info", `Step 3 merge complete (${merged.length} chars).`);
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const updated = await updateRun(runId, (s) => {
      s.step3.status = "failed";
      s.step3.error = msg;
      s.step3.completedAt = Date.now();
      appendLog(s, "error", `Step 3 merge failed: ${msg}`);
    });
    return NextResponse.json(updated, { status: 500 });
  }
}
