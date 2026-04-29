// Read prompt files from disk at runtime. Files live under lib/prompts/
// and are bundled into the deployment via the outputFileTracingIncludes in
// next.config (Next 15 traces them automatically when imported by path).
import { readFileSync } from "node:fs";
import path from "node:path";

const PROMPTS_DIR = path.join(process.cwd(), "lib", "prompts");

export function loadKeywordPrompt(opts: {
  product: string;
  industry: string;
  brandUrl?: string;
  extraKeywords?: string;
}): string {
  const raw = readFileSync(path.join(PROMPTS_DIR, "keyword_cluster.md"), "utf-8");
  return raw
    .replaceAll("{{PRODUCT_OR_CATEGORY}}", opts.product)
    .replaceAll("{{BRAND_URL_OR_NONE}}", opts.brandUrl || "None")
    .replaceAll("{{INDUSTRY}}", opts.industry)
    .replaceAll("{{EXTRA_KEYWORDS_OR_NONE}}", opts.extraKeywords || "None");
}

export function loadVocPrompt(opts: { product: string; industry: string }): string {
  const raw = readFileSync(path.join(PROMPTS_DIR, "voc_extraction.md"), "utf-8");
  return raw
    .replaceAll("{{BRAND_OR_PRODUCT}}", opts.product)
    .replaceAll("{{INDUSTRY}}", opts.industry);
}
