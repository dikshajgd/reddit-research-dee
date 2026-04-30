import { NextResponse } from "next/server";
import { callClaude, stripPreamble, withNoPreamble } from "@/lib/anthropic";
import { blobPath, fetchText, putText } from "@/lib/blob";
import { PERSONA_SYSTEM_PROMPT } from "@/lib/prompts/persona_cluster";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!state.step3.blobUrl) {
    return NextResponse.json({ error: "Step 3 must complete first" }, { status: 400 });
  }

  await updateRun(runId, (s) => {
    s.step4.status = "running";
    s.step4.startedAt = Date.now();
    appendLog(s, "info", "Starting Step 4: Persona & Awareness Level Clustering...");
  });

  try {
    const vocMd = await fetchText(state.step3.blobUrl);
    const { product, industry } = state.input;
    const systemPrompt = withNoPreamble(
      PERSONA_SYSTEM_PROMPT.replaceAll("{{BRAND_OR_PRODUCT}}", product).replaceAll(
        "{{INDUSTRY}}",
        industry,
      ),
    );

    const userContent =
      `Here is the complete Voice-of-Customer document to analyze.\n` +
      `Cluster all data into buyer personas and map to awareness levels.\n\n${vocMd}`;

    const raw = await callClaude(systemPrompt, userContent, 16000);
    const md = stripPreamble(raw);

    const blobUrl = await putText(blobPath(runId, "step4.md"), md);

    const elapsedMs = Date.now() - state.createdAt;
    const updated = await updateRun(runId, (s) => {
      const startedAt = s.step4.startedAt;
      s.step4 = {
        status: "complete",
        blobUrl,
        startedAt,
        completedAt: Date.now(),
      };
      s.elapsedMs = elapsedMs;
      appendLog(s, "info", `Step 4 complete (${md.length} chars).`);
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const updated = await updateRun(runId, (s) => {
      s.step4.status = "failed";
      s.step4.error = msg;
      s.step4.completedAt = Date.now();
      appendLog(s, "error", `Step 4 failed: ${msg}`);
    });
    return NextResponse.json(updated, { status: 500 });
  }
}
