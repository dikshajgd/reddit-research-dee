import { NextResponse } from "next/server";
import { addRunToIndex, newRun, setRun } from "@/lib/store";
import { parseSubreddits, parseKeywords } from "@/lib/parse-step1";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const product: string = body.product?.trim() ?? "";
  const industry: string = body.industry?.trim() ?? "";
  if (!product || !industry) {
    return NextResponse.json({ error: "product and industry are required" }, { status: 400 });
  }

  const state = newRun({
    product,
    industry,
    brandUrl: body.brandUrl?.trim() || undefined,
    extraKeywords: body.extraKeywords?.trim() || undefined,
    maxThreads: Number(body.maxThreads ?? 50),
    maxComments: Number(body.maxComments ?? 100),
  });

  // Optional: skip Step 1 by uploading an existing subreddit map.
  if (typeof body.uploadedStep1Md === "string" && body.uploadedStep1Md.trim()) {
    const md = body.uploadedStep1Md as string;
    const subs = parseSubreddits(md);
    const kws = parseKeywords(md);
    const totalSubs = Object.values(subs).reduce((a, v) => a + v.length, 0);
    const totalKws = Object.values(kws).reduce((a, v) => a + v.length, 0);
    if (totalSubs > 0 && totalKws > 0) {
      state.step1 = { status: "skipped", parsed: { subreddits: subs, keywords: kws } };
      state.logs.push({
        ts: Date.now(),
        level: "info",
        msg: `Step 1 skipped (uploaded). Using ${totalSubs} subreddits, ${totalKws} keywords.`,
      });
    }
  }

  await setRun(state);
  await addRunToIndex(state.runId, state.createdAt);
  return NextResponse.json({ runId: state.runId, state });
}
