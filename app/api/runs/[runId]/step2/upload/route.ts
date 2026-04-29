import { NextResponse } from "next/server";
import { blobPath, putJson } from "@/lib/blob";
import { parseUploadedThreads } from "@/lib/parse-uploaded";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const text: string = body.text ?? "";
  const fileType: string = body.fileType ?? "md";
  if (!text.trim()) return NextResponse.json({ error: "empty upload" }, { status: 400 });

  const threads = parseUploadedThreads(text, fileType);
  if (!threads.length) {
    return NextResponse.json(
      { error: "Could not parse any threads from uploaded file" },
      { status: 400 },
    );
  }

  const threadsBlobUrl = await putJson(blobPath(runId, "step2-threads.json"), threads);

  const updated = await updateRun(runId, (s) => {
    s.step2 = {
      status: "uploaded",
      method: "uploaded",
      plannedBatches: 0,
      completedBatches: 0,
      threadCount: threads.length,
      threadsBlobUrl,
    };
    appendLog(s, "info", `Step 2 bypassed (uploaded). Using ${threads.length} threads.`);
  });

  return NextResponse.json(updated);
}
