import { NextResponse } from "next/server";
import { abortApifyRun } from "@/lib/apify";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/runs/{runId}/stop
// Terminal halt. If an Apify actor is currently in flight, send it an abort.
// In-flight Vercel functions can't be killed mid-call (they'll drain on their
// own), but the driver gating in PipelineRunner prevents new requests.
export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (state.control === "stopped") {
    return NextResponse.json(state);
  }

  const apifyRunId = state.step2.activeApifyRunId;
  if (apifyRunId) {
    await abortApifyRun(apifyRunId);
  }

  const updated = await updateRun(runId, (s) => {
    s.control = "stopped";
    s.step2.activeApifyRunId = undefined;
    appendLog(s, "warn", "Run stopped by user.");
  });
  return NextResponse.json(updated);
}
