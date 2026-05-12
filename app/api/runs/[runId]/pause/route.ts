import { NextResponse } from "next/server";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/runs/{runId}/pause
// Pauses the client driver. In-flight server work finishes naturally; no new
// steps fire until /resume is called.
export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (state.control === "stopped") {
    return NextResponse.json({ error: "Run is stopped; cannot pause." }, { status: 400 });
  }

  const updated = await updateRun(runId, (s) => {
    s.control = "paused";
    appendLog(s, "info", "Run paused.");
  });
  return NextResponse.json(updated);
}
