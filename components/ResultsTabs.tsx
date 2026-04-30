"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RunState } from "@/lib/types";
import { Button, Card } from "./ui/primitives";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const PROSE_CLASS =
  "prose prose-sm max-w-none " +
  "prose-headings:mt-5 prose-headings:mb-2 prose-headings:font-semibold " +
  "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base " +
  "prose-p:my-2 prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 " +
  "prose-table:my-3 prose-table:border prose-table:border-neutral-200 " +
  "prose-th:bg-neutral-100 prose-th:px-3 prose-th:py-2 prose-th:text-left " +
  "prose-td:border-t prose-td:border-neutral-200 prose-td:px-3 prose-td:py-2 prose-td:align-top " +
  "prose-code:bg-neutral-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded " +
  "prose-blockquote:border-l-4 prose-blockquote:border-neutral-300 prose-blockquote:text-neutral-700";

const REMARK_PLUGINS = [remarkGfm];

type Tab = "subreddits" | "voc" | "personas" | "review" | "logs";

async function loadBlobText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load blob");
  return res.text();
}

export default function ResultsTabs({
  state,
  onStateChange,
}: {
  state: RunState;
  onStateChange: (s: RunState) => void;
}) {
  const [tab, setTab] = useState<Tab>("subreddits");
  const [step1Md, setStep1Md] = useState<string>("");
  const [step3Md, setStep3Md] = useState<string>("");
  const [step4Md, setStep4Md] = useState<string>("");
  const [editPersonas, setEditPersonas] = useState<string | undefined>(undefined);
  const [editVoc, setEditVoc] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.step1.blobUrl) loadBlobText(state.step1.blobUrl).then(setStep1Md).catch(() => {});
  }, [state.step1.blobUrl]);
  useEffect(() => {
    if (state.step3.blobUrl) loadBlobText(state.step3.blobUrl).then(setStep3Md).catch(() => {});
  }, [state.step3.blobUrl]);
  useEffect(() => {
    if (state.step4.blobUrl) loadBlobText(state.step4.blobUrl).then(setStep4Md).catch(() => {});
  }, [state.step4.blobUrl]);

  const hasResults =
    state.step1.blobUrl || state.step3.blobUrl || state.step4.blobUrl;
  if (!hasResults) return null;

  async function saveReview() {
    setSaving(true);
    try {
      const res = await fetch(`/api/runs/${state.runId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personas: editPersonas ?? step4Md,
          voc: editVoc,
        }),
      });
      const next: RunState = await res.json();
      onStateChange(next);
      // Re-load saved markdown.
      if (next.step4.blobUrl) loadBlobText(next.step4.blobUrl).then(setStep4Md).catch(() => {});
      if (next.step3.blobUrl) loadBlobText(next.step3.blobUrl).then(setStep3Md).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "subreddits", label: "📋 Subreddit Map" },
    { key: "voc", label: "📊 VOC Document" },
    { key: "personas", label: "🧑‍🤝‍🧑 Personas & Awareness" },
    { key: "review", label: "✏️ Manual Review" },
    { key: "logs", label: "📝 Logs" },
  ];

  const downloadHref = (file: string) => `/api/runs/${state.runId}/download/${file}`;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-2 border-b pb-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm px-3 py-1 rounded ${
              tab === t.key ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "subreddits" && (
        <div className="space-y-3">
          {step1Md ? (
            <>
              <a href={downloadHref("subreddits")}>
                <Button variant="secondary">⬇️ Download Subreddit Map (.md)</Button>
              </a>
              <article className={PROSE_CLASS}>
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{step1Md}</ReactMarkdown>
              </article>
            </>
          ) : (
            <p className="text-sm text-neutral-600">
              Subreddit map will appear here after Step 1 completes.
            </p>
          )}
        </div>
      )}

      {tab === "voc" && (
        <div className="space-y-3">
          {step3Md ? (
            <>
              <a href={downloadHref("voc")}>
                <Button variant="secondary">⬇️ Download VOC Document (.md)</Button>
              </a>
              <article className={PROSE_CLASS}>
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{step3Md}</ReactMarkdown>
              </article>
            </>
          ) : state.step3.status === "failed" ? (
            <p className="text-sm text-amber-700">
              Step 3 could not generate a VOC document. Check the Logs tab.
            </p>
          ) : (
            <p className="text-sm text-neutral-600">VOC document will appear here after Step 3.</p>
          )}
        </div>
      )}

      {tab === "personas" && (
        <div className="space-y-3">
          {step4Md ? (
            <>
              <a href={downloadHref("personas")}>
                <Button variant="secondary">⬇️ Download Personas (.md)</Button>
              </a>
              <article className={PROSE_CLASS}>
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{step4Md}</ReactMarkdown>
              </article>
            </>
          ) : state.step4.status === "failed" ? (
            <p className="text-sm text-amber-700">Step 4 could not generate personas.</p>
          ) : (
            <p className="text-sm text-neutral-600">Persona clustering will appear here after Step 4.</p>
          )}
        </div>
      )}

      {tab === "review" && (
        <div className="space-y-3">
          {step4Md ? (
            <>
              <p className="text-sm text-neutral-600">
                Review the personas and VOC. Remove low-quality entries, then save.
              </p>
              <div data-color-mode="light">
                <MDEditor
                  value={editPersonas ?? step4Md}
                  onChange={(v) => setEditPersonas(v ?? "")}
                  height={500}
                  preview="edit"
                />
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Edit VOC Document (optional)
                </summary>
                <div className="mt-2" data-color-mode="light">
                  <MDEditor
                    value={editVoc ?? step3Md}
                    onChange={(v) => setEditVoc(v ?? "")}
                    height={400}
                    preview="edit"
                  />
                </div>
              </details>
              <div className="flex flex-wrap gap-3">
                <Button onClick={saveReview} disabled={saving}>
                  {saving ? "Saving..." : "💾 Save Changes"}
                </Button>
                <a href={downloadHref("personas-cleaned")}>
                  <Button variant="secondary">⬇️ Download Cleaned Personas (.md)</Button>
                </a>
              </div>
              {state.review.submitted && <p className="text-sm text-green-700">Saved.</p>}
            </>
          ) : (
            <p className="text-sm text-neutral-600">
              Manual review unlocks after Step 4 completes.
            </p>
          )}
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-1 max-h-[500px] overflow-auto">
          {state.logs.length === 0 ? (
            <p className="text-sm text-neutral-600">Pipeline logs will appear here.</p>
          ) : (
            state.logs.map((l, i) => (
              <div
                key={i}
                className={`text-xs font-mono ${
                  l.level === "error"
                    ? "text-red-700"
                    : l.level === "warn"
                    ? "text-amber-700"
                    : "text-neutral-700"
                }`}
              >
                [{new Date(l.ts).toLocaleTimeString()}] {l.msg}
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
