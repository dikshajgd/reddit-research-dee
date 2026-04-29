import { NextResponse } from "next/server";
import { blobPath, putText } from "@/lib/blob";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function PUT(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const editedPersonas: string | undefined = body.personas;
  const editedVoc: string | undefined = body.voc;

  if (typeof editedPersonas !== "string") {
    return NextResponse.json({ error: "personas markdown required" }, { status: 400 });
  }

  const personasUrl = await putText(blobPath(runId, "step4-edited.md"), editedPersonas);
  let vocUrl: string | undefined;
  if (typeof editedVoc === "string" && editedVoc.trim()) {
    vocUrl = await putText(blobPath(runId, "step3-edited.md"), editedVoc);
  }

  const updated = await updateRun(runId, (s) => {
    s.step4.blobUrl = personasUrl;
    if (vocUrl) s.step3.blobUrl = vocUrl;
    s.review = { submitted: true, editedAt: Date.now() };
    appendLog(s, "info", "Manual review saved.");
  });
  return NextResponse.json(updated);
}
