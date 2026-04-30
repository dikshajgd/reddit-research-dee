import { NextResponse } from "next/server";
import { callClaude, stripPreamble, withNoPreamble } from "@/lib/anthropic";
import { putText, blobPath } from "@/lib/blob";
import { loadKeywordPrompt } from "@/lib/load-prompt";
import { parseKeywords, parseSubreddits } from "@/lib/parse-step1";
import { appendLog, getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (state.step1.status === "skipped" || state.step1.status === "complete") {
    return NextResponse.json(state);
  }

  await updateRun(runId, (s) => {
    s.step1.status = "running";
    s.step1.startedAt = Date.now();
    appendLog(s, "info", "Starting Step 1: Keyword & Subreddit Generation...");
  });

  try {
    const { product, industry, brandUrl, extraKeywords } = state.input;
    const systemPrompt = withNoPreamble(
      loadKeywordPrompt({ product, industry, brandUrl, extraKeywords }),
    );

    let userMessage =
      `Generate a comprehensive Reddit keyword and subreddit targeting plan for:\n\n` +
      `Product/Category: ${product}\n` +
      `Industry: ${industry}\n`;
    if (brandUrl) userMessage += `Brand URL: ${brandUrl}\n`;
    if (extraKeywords) userMessage += `Extra Keywords: ${extraKeywords}\n`;
    userMessage +=
      "\nBe thorough and exhaustive. Include all subreddit tiers and all 7 keyword categories " +
      "with 15-30 keywords each. Also include non-obvious angles.";

    const raw = await callClaude(systemPrompt, userMessage);
    const md = stripPreamble(raw);

    const subreddits = parseSubreddits(md);
    const keywords = parseKeywords(md);
    const totalSubs = Object.values(subreddits).reduce((a, v) => a + v.length, 0);
    const totalKws = Object.values(keywords).reduce((a, v) => a + v.length, 0);

    const blobUrl = await putText(blobPath(runId, "step1.md"), md);

    const updated = await updateRun(runId, (s) => {
      const startedAt = s.step1.startedAt;
      s.step1 = {
        status: "complete",
        parsed: { subreddits, keywords },
        blobUrl,
        startedAt,
        completedAt: Date.now(),
      };
      appendLog(s, "info", `Step 1 complete. Found ${totalSubs} subreddits, ${totalKws} keywords.`);
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const updated = await updateRun(runId, (s) => {
      s.step1.status = "failed";
      s.step1.error = msg;
      s.step1.completedAt = Date.now();
      appendLog(s, "error", `Step 1 failed: ${msg}`);
    });
    return NextResponse.json(updated, { status: 500 });
  }
}
