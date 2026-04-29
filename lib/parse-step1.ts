// Direct port of step1_keyword_gen.py:parse_subreddits / parse_keywords.
import type { KeywordMap, SubredditMap } from "./types";

const TIER_PATTERNS = [
  "core niche",
  "adjacent problem",
  "identity/demographic",
  "identity",
  "demographic",
  "review & shopping",
  "review",
  "shopping",
  "general rant",
  "general discussion",
  "rant/discussion",
];

export function parseSubreddits(text: string): SubredditMap {
  const tiers: SubredditMap = {};
  let currentTier: string | null = null;

  for (const line of text.split("\n")) {
    const lineLower = line.toLowerCase().trim();

    for (const pattern of TIER_PATTERNS) {
      if (
        lineLower.includes(pattern) &&
        (lineLower.startsWith("#") || lineLower.startsWith("**") || lineLower.startsWith("-"))
      ) {
        if (lineLower.includes("core")) currentTier = "core";
        else if (lineLower.includes("adjacent")) currentTier = "adjacent";
        else if (lineLower.includes("identity") || lineLower.includes("demographic"))
          currentTier = "identity";
        else if (lineLower.includes("review") || lineLower.includes("shopping"))
          currentTier = "shopping";
        else if (lineLower.includes("rant") || lineLower.includes("general"))
          currentTier = "general";

        if (currentTier && !(currentTier in tiers)) tiers[currentTier] = [];
        break;
      }
    }

    const matches = [...line.matchAll(/r\/([A-Za-z0-9_]+)/g)];
    if (matches.length && currentTier) {
      for (const m of matches) {
        const sub = m[1];
        if (!tiers[currentTier].includes(sub)) tiers[currentTier].push(sub);
      }
    }
  }

  return tiers;
}

const CATEGORY_MARKERS: Array<[string, string]> = [
  ["pain point", "pain_points"],
  ["product frustration", "product_frustrations"],
  ["skin/user-type", "user_type"],
  ["user-type", "user_type"],
  ["desired outcome", "desired_outcomes"],
  ["i wish", "desired_outcomes"],
  ["purchase hesitation", "objections"],
  ["objection", "objections"],
  ["competitor", "competitors"],
  ["adjacent product", "competitors"],
  ["shopping behavior", "shopping"],
  ["decision", "shopping"],
];

const HEADING_PREFIXES = ["#", "**", "a.", "b.", "c.", "d.", "e.", "f.", "g."];

export function parseKeywords(text: string): KeywordMap {
  const categories: KeywordMap = {};
  let current: string | null = null;

  for (const line of text.split("\n")) {
    const lineLower = line.toLowerCase().trim();

    for (const [marker, key] of CATEGORY_MARKERS) {
      if (lineLower.includes(marker) && HEADING_PREFIXES.some((p) => lineLower.startsWith(p))) {
        current = key;
        if (!(current in categories)) categories[current] = [];
        break;
      }
    }

    if (!current) continue;

    const stripped = line.trim();
    const isListItem =
      stripped.startsWith("-") ||
      stripped.startsWith("*") ||
      stripped.startsWith("\u2022") ||
      /^\d+[.)]\s/.test(stripped);

    if (!isListItem) continue;

    let keyword = stripped
      .replace(/^[\-*\u2022]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/\*\*(.+?)\*\*/g, "$1");

    const quoted = [...keyword.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
    if (quoted.length) {
      for (const q of quoted) {
        if (q && q.length > 2) categories[current].push(q);
      }
      continue;
    }

    keyword = keyword.replace(/^["']|["']$/g, "").trim();

    for (const sep of [" \u2014 ", " -- ", " (", " / "]) {
      if (keyword.includes(sep)) {
        const parts = keyword.split(sep);
        keyword = parts[0].trim();
        if (sep === " / " && parts.length > 1) {
          const alt = parts[1].trim().replace(/^["']|["']$/g, "");
          if (alt && alt.length > 2) categories[current].push(alt);
        }
        break;
      }
    }

    if (keyword && keyword.length > 2) categories[current].push(keyword);
  }

  return categories;
}
