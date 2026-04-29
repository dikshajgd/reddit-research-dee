// Port of step3_extract_voc.py:format_thread / format_scraped_data.
import type { RedditThread } from "./types";

export const MAX_INPUT_CHARS = 400_000;
export const CHUNK_SIZE = 50;

export function formatThread(item: RedditThread): string {
  const parts: string[] = [];
  parts.push(`### Thread: ${item.title}`);
  parts.push(
    `**Subreddit:** r/${item.subreddit} | **Upvotes:** ${item.upVotes ?? item.score ?? 0} | **Author:** u/${item.author}`,
  );
  if (item.url) parts.push(`**URL:** ${item.url}`);
  if (item.selfText) parts.push(`\n${item.selfText}\n`);

  if (item.comments && item.comments.length) {
    parts.push("**Comments:**");
    for (const c of item.comments.slice(0, 20)) {
      if (c.body) {
        parts.push(`- u/${c.author} (${c.upVotes ?? c.score ?? 0} upvotes): ${c.body}`);
      }
    }
  }
  parts.push("---");
  return parts.join("\n");
}

export function formatScrapedData(items: RedditThread[]): string {
  return items.map(formatThread).join("\n\n");
}

export function chunkItems(items: RedditThread[], chunkSize = CHUNK_SIZE): RedditThread[][] {
  const out: RedditThread[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}
