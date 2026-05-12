// Port of step2_scrape.py:format_search_term + build_search_urls.
import type { ParsedStep1 } from "./types";

const MAX_BATCHES = 4;
// Keywords pulled from each priority pair, per "pass". A "scrape more" run
// reuses the same pairs but advances to the next slice of keywords.
export const KEYWORDS_PER_PAIR_PER_PASS = 2;

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

// passIndex >= 0 selects which slice of keywords to use per priority pair.
// Pass 0 → keywords[0..2], pass 1 → keywords[2..4], etc.
export function buildSearchUrls(parsed: ParsedStep1, passIndex = 0): string[] {
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

  const startKw = passIndex * KEYWORDS_PER_PAIR_PER_PASS;
  const endKw = startKw + KEYWORDS_PER_PAIR_PER_PASS;

  const urls: string[] = [];
  const done = new Set<string>();

  for (const [tier, category] of priorityPairs) {
    if (urls.length >= MAX_BATCHES * KEYWORDS_PER_PAIR_PER_PASS) break;
    if (!subreddits[tier] || !keywords[category]) continue;

    const key = `${tier}:${category}`;
    if (done.has(key)) continue;
    done.add(key);

    const multi = subreddits[tier].slice(0, 5).join("+");

    const terms = keywords[category]
      .map((kw) => formatSearchTerm(kw.slice(0, 80)))
      .filter((t): t is string => t !== null);

    for (const term of terms.slice(startKw, endKw)) {
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
