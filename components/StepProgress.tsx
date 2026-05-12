"use client";
import { useEffect, useState } from "react";
import type { RunState, StepStatus } from "@/lib/types";
import { elapsedMsForStep, expectedSeconds, formatMmSs, stepProgress } from "@/lib/timing";
import { ProgressBar } from "./ui/primitives";

const STEPS = [
  { num: 1 as const, title: "Keyword & Subreddit Generation" },
  { num: 2 as const, title: "Reddit Scraping" },
  { num: 3 as const, title: "VOC Extraction" },
  { num: 4 as const, title: "Persona Clustering" },
  { num: 5 as const, title: "Manual Review" },
];

function statusFor(state: RunState, num: number): StepStatus | "active" | "pending-review" {
  if (num === 1) return state.step1.status;
  if (num === 2) return state.step2.status;
  if (num === 3) return state.step3.status;
  if (num === 4) return state.step4.status;
  if (num === 5) {
    if (state.review.submitted) return "complete";
    if (state.step4.status === "complete") return "active";
    return "pending-review";
  }
  return "pending";
}

function icon(status: string): string {
  switch (status) {
    case "complete":
      return "✅";
    case "running":
    case "merging":
    case "active":
      return "⏳";
    case "failed":
      return "❌";
    case "skipped":
    case "uploaded":
      return "⏭️";
    case "paused":
      return "⏸️";
    case "stopped":
      return "⏹️";
    default:
      return "⬜";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "complete":
      return "Done";
    case "running":
      return "Running";
    case "merging":
      return "Merging";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "uploaded":
      return "Uploaded";
    case "active":
      return "Your turn";
    case "pending-review":
      return "Pending";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    default:
      return "Pending";
  }
}

function progressDetail(state: RunState, num: number): string | null {
  if (num === 2 && state.step2.status === "running") {
    return `${state.step2.completedBatches}/${state.step2.plannedBatches} batches`;
  }
  if (num === 3) {
    if (state.step3.status === "running" && state.step3.plannedChunks > 0) {
      return `${state.step3.completedChunks}/${state.step3.plannedChunks} chunks`;
    }
    if (state.step3.status === "merging") return "merging chunks…";
  }
  return null;
}

function isRunningStatus(s: string): boolean {
  return s === "running" || s === "merging";
}

export default function StepProgress({ state }: { state: RunState }) {
  const control = state.control ?? "running";
  // Tick every 1s while a step is running AND the user hasn't paused/stopped.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (control !== "running") return;
    const anyRunning =
      isRunningStatus(state.step1.status) ||
      isRunningStatus(state.step2.status) ||
      isRunningStatus(state.step3.status) ||
      isRunningStatus(state.step4.status);
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [control, state.step1.status, state.step2.status, state.step3.status, state.step4.status]);

  const totalElapsed = state.elapsedMs ?? Math.max(0, now - state.createdAt);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-neutral-700">Pipeline</span>
        <span className="text-neutral-600 tabular-nums">
          Total: <span className="font-mono">{formatMmSs(totalElapsed)}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {STEPS.map((s) => {
          const baseStatus = statusFor(state, s.num);
          // When the run is paused/stopped, present in-flight steps with that
          // label rather than a misleading "Running".
          const overlay =
            control !== "running" && (baseStatus === "running" || baseStatus === "merging")
              ? control
              : null;
          const status = overlay ?? baseStatus;
          const detail = progressDetail(state, s.num);

          // Manual review (step 5) doesn't get a timer/progress bar.
          if (s.num === 5) {
            return (
              <div key={s.num} className="rounded-md border border-neutral-200 bg-white p-3 space-y-1">
                <div className="text-base font-semibold">
                  {icon(status)} Step {s.num}
                </div>
                <div className="text-xs text-neutral-600">{s.title}</div>
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  {statusLabel(status)}
                </div>
              </div>
            );
          }

          const stepNum = s.num as 1 | 2 | 3 | 4;
          const elapsed = elapsedMsForStep(stepNum, state, now);
          const expectedS = expectedSeconds(stepNum, state);
          const progress = stepProgress(stepNum, state, now);

          const isComplete = status === "complete";
          const isFailed = status === "failed" || status === "stopped";
          const isPaused = status === "paused";
          const isRunning = status === "running" || status === "merging";

          // Pick a tone for the bar.
          const tone = isFailed
            ? "danger"
            : isComplete
            ? "success"
            : isPaused
            ? "muted"
            : "default";
          const barValue = isComplete ? 1 : progress ?? 0;
          const showBar =
            status !== "pending" && status !== "skipped" && status !== "uploaded";

          return (
            <div
              key={s.num}
              className="rounded-md border border-neutral-200 bg-white p-3 space-y-2"
            >
              <div className="flex items-baseline justify-between">
                <div className="text-base font-semibold">
                  {icon(status)} Step {s.num}
                </div>
                {elapsed !== null && (
                  <span className="font-mono text-xs tabular-nums text-neutral-700">
                    {formatMmSs(elapsed)}
                  </span>
                )}
              </div>

              <div className="text-xs text-neutral-600">{s.title}</div>

              <div className="flex items-center justify-between text-xs">
                <span className="uppercase tracking-wide text-neutral-500">
                  {statusLabel(status)}
                </span>
                {isRunning && (
                  <span className="text-neutral-500 tabular-nums">
                    ≈ {formatMmSs(expectedS * 1000)}
                  </span>
                )}
              </div>

              {showBar && <ProgressBar value={barValue} tone={tone} />}

              {detail && <div className="text-xs text-neutral-700">{detail}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
