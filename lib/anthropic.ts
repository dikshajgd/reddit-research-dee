import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

const PREAMBLE_SUFFIX =
  "\n\nIMPORTANT: Output ONLY the requested document. " +
  "No introductory text, no preamble, no conversational filler. " +
  "Start directly with the document content.";

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 16000,
): Promise<string> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = res.content[0];
  if (!block || block.type !== "text") return "";
  return block.text;
}

export function withNoPreamble(systemPrompt: string): string {
  return systemPrompt + PREAMBLE_SUFFIX;
}

// Strip Claude's conversational preamble before the actual content.
// Mirrors strip_preamble() in lib/claude_client.py.
export function stripPreamble(text: string): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (s.startsWith("#") || s === "---") {
      return lines.slice(i).join("\n");
    }
  }
  return text;
}
