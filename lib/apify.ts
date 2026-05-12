// Port of step2_scrape.py Apify path.
// Uses the official apify-client (Node SDK).
import { ApifyClient } from "apify-client";
import type { RedditThread } from "./types";

const APIFY_ACTOR = "trudax/reddit-scraper-lite";

function getClient(): ApifyClient {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new Error("APIFY_API_TOKEN not set");
  return new ApifyClient({ token });
}

function parseTimestamp(ts: string | undefined): number {
  if (!ts) return 0;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

type ApifyItem = Record<string, unknown>;

function normalizeApifyResults(items: ApifyItem[]): RedditThread[] {
  const posts = new Map<string, ApifyItem>();
  const commentsByPost = new Map<string, ApifyItem[]>();

  for (const item of items) {
    const dtype = item.dataType as string | undefined;
    if (dtype === "post") {
      const postId = (item.id as string) ?? "";
      posts.set(postId, item);
      if (!commentsByPost.has(postId)) commentsByPost.set(postId, []);
    } else if (dtype === "comment") {
      const postId = (item.postId as string) ?? "";
      if (!commentsByPost.has(postId)) commentsByPost.set(postId, []);
      commentsByPost.get(postId)!.push(item);
    }
  }

  const threads: RedditThread[] = [];
  for (const [postId, post] of posts) {
    const rawComments = commentsByPost.get(postId) ?? [];
    const subreddit = (
      (post.parsedCommunityName as string) ??
      (post.communityName as string) ??
      "unknown"
    ).replace(/^r\//, "");

    const thread: RedditThread = {
      id: (post.parsedId as string) ?? postId,
      title: (post.title as string) ?? "",
      selfText: (post.body as string) ?? "",
      author: (post.username as string) ?? "unknown",
      subreddit,
      score: Number(post.upVotes ?? 0),
      upVotes: Number(post.upVotes ?? 0),
      url: (post.url as string) ?? "",
      numComments: Number(post.numberOfComments ?? 0),
      created: parseTimestamp(post.createdAt as string | undefined),
      comments: rawComments
        .filter((c) => {
          const body = c.body as string | undefined;
          return body && body !== "[removed]" && body !== "[deleted]";
        })
        .map((c) => ({
          author: (c.username as string) ?? "unknown",
          body: (c.body as string) ?? "",
          score: Number(c.upVotes ?? 0),
          upVotes: Number(c.upVotes ?? 0),
        })),
    };
    if (thread.title) threads.push(thread);
  }
  return threads;
}

export type RunApifyBatchResult =
  | { aborted: true; threads: [] }
  | { aborted: false; threads: RedditThread[] };

export async function runApifyBatch(
  startUrls: string[],
  maxPosts: number,
  maxComments: number,
  opts?: { onStart?: (apifyRunId: string) => void | Promise<void> },
): Promise<RunApifyBatchResult> {
  const client = getClient();
  const input = {
    startUrls: startUrls.map((u) => ({ url: u })),
    maxItems: maxPosts + maxPosts * maxComments,
    maxPostCount: maxPosts,
    maxComments,
  };

  // Start the actor (non-blocking) so the caller can record the runId and
  // potentially abort it from another request.
  const started = await client.actor(APIFY_ACTOR).start(input);
  if (opts?.onStart) {
    try {
      await opts.onStart(started.id);
    } catch {
      // tracking-side failure shouldn't kill the scrape
    }
  }

  // Poll until the actor finishes (or hits the 280s budget).
  const finished = await client.run(started.id).waitForFinish({ waitSecs: 280 });
  if (!finished) return { aborted: false, threads: [] };

  if (finished.status === "ABORTED" || finished.status === "ABORTING") {
    return { aborted: true, threads: [] };
  }
  if (finished.status !== "SUCCEEDED") {
    return { aborted: false, threads: [] };
  }
  if (!finished.defaultDatasetId) return { aborted: false, threads: [] };

  const { items } = await client
    .dataset(finished.defaultDatasetId)
    .listItems({ limit: 1000 });
  return { aborted: false, threads: normalizeApifyResults(items as ApifyItem[]) };
}

export async function abortApifyRun(apifyRunId: string): Promise<void> {
  const client = getClient();
  try {
    await client.run(apifyRunId).abort();
  } catch {
    // best-effort; the run may already have finished
  }
}

export function deduplicateThreads(items: RedditThread[]): RedditThread[] {
  const seen = new Set<string>();
  const unique: RedditThread[] = [];
  for (const item of items) {
    if (item.id && !seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}
