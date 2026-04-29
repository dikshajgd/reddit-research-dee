// Port of step2_scrape.py:format_search_term + build_search_urls.
import type { ParsedStep1 } from "./types";

const MAX_BATCHES = 8;

export function formatSearchTerm(rawKeyword: string): string | null {
  let keyword = rawKeyword.replace(/^[*`]+|[*`]+$/g, "").trim();
  keyword = keyword.replace(/^["']|["']$/g, "").trim();

  for (const sep of [" \u2014 ", " -- ", ": "]) {
    if (keyword.includes(sep)) {
      keyword = keyword.split(sep)[0].trim();
    }
  }

  if (!keyword || keyword.length < 3) return null;
  return keyword;
}

export function buildSearchUrls(parsed: ParsedStep1): string[] {
  const subreddits = parsed.subreddits ?? {};
  const keywords = parsed.keywords ?? {};

  const priorityPairs: Array<[string, string]> = [
    ["core", "pain_points"],
    ["core", "product_frustrations"],
    ["adjacent", "desired_outcomes"],
    ["adjacent", "pain_points"],
    ["shopping", "objections"],
    ["identity", "user_type"],
    ["shopping", "shopping"],
    ["general", "pain_points"],
  ];

  const urls: string[] = [];
  const done = new Set<string>();

  for (const [tier, category] of priorityPairs) {
    if (urls.length >= MAX_BATCHES * 3) break;
    if (!subreddits[tier] || !keywords[category]) continue;

    const key = `${tier}:${category}`;
    if (done.has(key)) continue;
    done.add(key);

    const multi = subreddits[tier].slice(0, 5).join("+");

    const terms = keywords[category]
      .map((kw) => formatSearchTerm(kw.slice(0, 80)))
      .filter((t): t is string => t !== null);

    for (const term of terms.slice(0, 3)) {
      const encoded = encodeURIComponent(term);
      urls.push(
        `https://www.reddit.com/r/${multi}/search/?q=${encoded}&restrict_sr=1&sort=relevance&t=year`,
      );
    }
  }

  return urls;
}

// Slice URLs into batches of N (default 6, matching Python).
export function chunkUrls(urls: string[], batchSize = 6): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    out.push(urls.slice(i, i + batchSize));
  }
  return out;
}

export const MAX_TOTAL_THREADS = 200;
