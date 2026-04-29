// Port of step2_scrape.py:parse_uploaded_threads + helpers.
import { createHash } from "node:crypto";
import type { RedditThread } from "./types";

function md5short(s: string): string {
  return createHash("md5").update(s).digest("hex").slice(0, 10);
}

function normalizeComments(comments: unknown): RedditThread["comments"] {
  if (!Array.isArray(comments)) return [];
  const out: RedditThread["comments"] = [];
  for (const c of comments) {
    if (typeof c === "string") {
      out.push({ author: "unknown", body: c, score: 0, upVotes: 0 });
    } else if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      const body = (o.body ?? o.text ?? o.content ?? "") as string;
      const score = Number(o.score ?? o.upVotes ?? 0);
      out.push({
        author: (o.author as string) ?? "unknown",
        body,
        score,
        upVotes: Number(o.upVotes ?? o.score ?? 0),
      });
    }
  }
  return out;
}

function parseJsonThreads(text: string): RedditThread[] {
  const data = JSON.parse(text);
  let arr: unknown[];
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const candidate = o.threads ?? o.data ?? o.posts ?? data;
    arr = Array.isArray(candidate) ? candidate : [candidate];
  } else {
    arr = [data];
  }

  const threads: RedditThread[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = (o.title as string) ?? "";
    const selfText =
      (o.selfText as string) ??
      (o.selftext as string) ??
      (o.body as string) ??
      (o.text as string) ??
      "";
    if (!title && !selfText) continue;
    threads.push({
      id: (o.id as string) ?? md5short(JSON.stringify(item)),
      title,
      selfText,
      author: (o.author as string) ?? "unknown",
      subreddit:
        (o.subreddit as string) ?? (o.communityName as string) ?? "unknown",
      score: Number(o.score ?? o.upVotes ?? o.ups ?? 0),
      upVotes: Number(o.upVotes ?? o.score ?? o.ups ?? 0),
      url: (o.url as string) ?? (o.permalink as string) ?? "",
      numComments: Number(o.numComments ?? o.num_comments ?? 0),
      created: Number(o.created ?? o.created_utc ?? 0),
      comments: normalizeComments(o.comments),
    });
  }
  return threads;
}

function parseMarkdownThreads(text: string): RedditThread[] {
  const threads: RedditThread[] = [];
  const blocks = text.split(/\n---+\n|(?=^### )/m);

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block || block.length < 20) continue;

    const titleMatch = block.match(/^###?\s*(?:Thread:\s*)?(.+?)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const subMatch = block.match(/r\/(\w+)/);
    const subreddit = subMatch ? subMatch[1] : "unknown";

    const scoreMatch = block.match(/(?:upvotes?|score)\s*:?\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

    const urlMatch = block.match(/(https?:\/\/(?:www\.|old\.)?reddit\.com\/r\/\S+)/);
    const url = urlMatch ? urlMatch[1] : "";

    const bodyLines: string[] = [];
    const comments: RedditThread["comments"] = [];
    let inComments = false;

    for (const line of block.split("\n")) {
      const stripped = line.trim();
      if (titleMatch && stripped === titleMatch[0].trim()) continue;

      if (/^[-*\u2022]\s*(?:u\/|\*\*u\/)/.test(stripped)) {
        inComments = true;
        const commentText = stripped
          .replace(/^[-*\u2022]\s*(?:\*\*)?u\/\S+(?:\*\*)?\s*(?:\(\d+\s*upvotes?\))?\s*:?\s*/, "");
        const authorMatch = stripped.match(/u\/(\S+)/);
        const cscoreMatch = stripped.match(/\((\d+)\s*upvotes?\)/);
        if (commentText) {
          const cscore = cscoreMatch ? parseInt(cscoreMatch[1], 10) : 0;
          comments.push({
            author: authorMatch ? authorMatch[1] : "unknown",
            body: commentText,
            score: cscore,
            upVotes: cscore,
          });
        }
        continue;
      }
      if (!inComments && !stripped.startsWith("**") && stripped) bodyLines.push(stripped);
    }

    const body = bodyLines.join("\n").trim();
    if (title || body) {
      threads.push({
        id: md5short(`${title}${body.slice(0, 100)}`),
        title,
        selfText: body,
        author: "unknown",
        subreddit,
        score,
        upVotes: score,
        url,
        numComments: comments.length,
        created: 0,
        comments,
      });
    }
  }
  return threads;
}

function parsePlaintextThreads(text: string): RedditThread[] {
  const threads: RedditThread[] = [];
  for (const rawBlock of text.split(/\n\n+/)) {
    const block = rawBlock.trim();
    if (!block || block.length < 20) continue;
    const lines = block.split("\n");
    const title = lines[0].trim();
    const body = lines.slice(1).join("\n").trim();
    const subMatch = block.match(/r\/(\w+)/);
    threads.push({
      id: md5short(title),
      title,
      selfText: body,
      author: "unknown",
      subreddit: subMatch ? subMatch[1] : "unknown",
      score: 0,
      upVotes: 0,
      url: "",
      numComments: 0,
      created: 0,
      comments: [],
    });
  }
  return threads;
}

export function parseUploadedThreads(text: string, fileType = "md"): RedditThread[] {
  const trimmed = text.trim();

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return parseJsonThreads(trimmed);
    } catch {
      // fall through
    }
  }

  if (fileType === "json") {
    try {
      return parseJsonThreads(trimmed);
    } catch {
      // fall through
    }
  }

  if (fileType === "md" || fileType === "markdown" || trimmed.includes("###") || trimmed.includes("---")) {
    return parseMarkdownThreads(trimmed);
  }

  return parsePlaintextThreads(trimmed);
}
