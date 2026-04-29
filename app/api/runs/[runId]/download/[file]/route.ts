import { NextResponse } from "next/server";
import { fetchText } from "@/lib/blob";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";

// GET /api/runs/{runId}/download/{file}
// file: "subreddits" | "voc" | "personas" | "personas-cleaned"
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string; file: string }> },
) {
  const { runId, file } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  const product = state.input.product;
  let blobUrl: string | undefined;
  let filename: string;

  switch (file) {
    case "subreddits":
      blobUrl = state.step1.blobUrl;
      filename = `SUBREDDIT NAMES ${product}.md`;
      break;
    case "voc":
      blobUrl = state.step3.blobUrl;
      filename = `REDDIT VOC ${product}.md`;
      break;
    case "personas":
      blobUrl = state.step4.blobUrl;
      filename = `PERSONAS ${product}.md`;
      break;
    case "personas-cleaned":
      blobUrl = state.step4.blobUrl;
      filename = `PERSONAS ${product} - cleaned.md`;
      break;
    default:
      return NextResponse.json({ error: "unknown file" }, { status: 400 });
  }

  if (!blobUrl) return NextResponse.json({ error: "file not yet generated" }, { status: 404 });

  const text = await fetchText(blobUrl);
  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
    },
  });
}
