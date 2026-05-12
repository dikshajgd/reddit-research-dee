import { NextResponse } from "next/server";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/runs/{runId}/resume
// Re-enables the driver. The client picks up where it left off, advancing
// any pending step (Step 2 batch, Step 3 chunk, etc.).
export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (state.control === "stopped") {
    return NextResponse.json(
      { error: "Run was stopped; start a new one to continue." },
      { status: 400 },
    );
  }
  if (state.control === "running") {
    return NextResponse.json(state);
  }

  const updated = await updateRun(runId, (s) => {
    s.control = "running";
    appendLog(s, "info", "Run resumed.");
  });
  return NextResponse.json(updated);
}
