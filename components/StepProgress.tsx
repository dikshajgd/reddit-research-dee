"use client";
import type { RunState } from "@/lib/types";

const STEPS = [
  { num: 1, title: "Keyword & Subreddit Generation" },
  { num: 2, title: "Reddit Scraping" },
  { num: 3, title: "VOC Extraction" },
  { num: 4, title: "Persona Clustering" },
  { num: 5, title: "Manual Review" },
];

function statusFor(state: RunState, num: number): string {
  if (num === 1) return state.step1.status;
  if (num === 2) return state.step2.status;
  if (num === 3) return state.step3.status;
  if (num === 4) return state.step4.status;
  if (num === 5) {
    if (state.review.submitted) return "complete";
    if (state.step4.status === "complete") return "running";
    return "pending";
  }
  return "pending";
}

function icon(status: string): string {
  switch (status) {
    case "complete":
      return "✅";
    case "running":
    case "merging":
      return "⏳";
    case "failed":
      return "❌";
    case "skipped":
    case "uploaded":
      return "⏭️";
    default:
      return "⬜";
  }
}

function progressDetail(state: RunState, num: number): string | null {
  if (num === 2 && state.step2.status === "running") {
    return `${state.step2.completedBatches}/${state.step2.plannedBatches} batches`;
  }
  if (num === 3 && (state.step3.status === "running" || state.step3.status === "merging")) {
    if (state.step3.status === "merging") return "merging chunks...";
    return `${state.step3.completedChunks}/${state.step3.plannedChunks} chunks`;
  }
  return null;
}

export default function StepProgress({ state }: { state: RunState }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {STEPS.map((s) => {
        const status = statusFor(state, s.num);
        const detail = progressDetail(state, s.num);
        return (
          <div key={s.num} className="rounded-md border border-neutral-200 bg-white p-3">
            <div className="text-lg font-semibold">
              {icon(status)} Step {s.num}
            </div>
            <div className="text-xs text-neutral-600">{s.title}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">{status}</div>
            {detail && <div className="mt-1 text-xs text-neutral-700">{detail}</div>}
          </div>
        );
      })}
    </div>
  );
}
