// Hardcoded baseline durations (seconds) used to render expected-time hints
// and indeterminate progress bars. Derived from typical observed runs;
// can be replaced with rolling averages from history later.
import type { RunState } from "./types";

export const STEP_BASELINES_SECONDS = {
  step1: 45,
  step2PerBatch: 150, // ~2.5 min per Apify batch
  step3PerChunk: 60,
  step3Merge: 90,
  step4: 45,
} as const;

export function expectedSeconds(step: 1 | 2 | 3 | 4, state: RunState): number {
  switch (step) {
    case 1:
      return STEP_BASELINES_SECONDS.step1;
    case 2: {
      const n = Math.max(1, state.step2.plannedBatches || 1);
      return STEP_BASELINES_SECONDS.step2PerBatch * n;
    }
    case 3: {
      const planned = Math.max(1, state.step3.plannedChunks || 1);
      const merge = planned > 1 ? STEP_BASELINES_SECONDS.step3Merge : 0;
      return STEP_BASELINES_SECONDS.step3PerChunk * planned + merge;
    }
    case 4:
      return STEP_BASELINES_SECONDS.step4;
  }
}

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Compute a 0..1 progress value for a given step. Returns null when no
// reasonable progress can be derived (e.g. step is pending).
export function stepProgress(step: 1 | 2 | 3 | 4, state: RunState, now: number): number | null {
  const stepState =
    step === 1 ? state.step1 : step === 2 ? state.step2 : step === 3 ? state.step3 : state.step4;
  const status = stepState.status;

  if (status === "pending") return null;
  if (status === "complete" || status === "skipped" || status === "uploaded") return 1;

  if (step === 2) {
    const planned = state.step2.plannedBatches || 1;
    return Math.min(1, state.step2.completedBatches / planned);
  }
  if (step === 3) {
    const planned = state.step3.plannedChunks || 1;
    if (planned > 1) {
      // Reserve one extra "slot" for the merge phase.
      const slots = planned + 1;
      const filled = state.step3.completedChunks + (status === "merging" ? 0.5 : 0);
      return Math.min(1, filled / slots);
    }
    // Single-chunk path: indeterminate via elapsed/expected.
  }

  // Fall through: indeterminate-via-elapsed (steps 1, 4, single-chunk step 3).
  const expected = expectedSeconds(step, state);
  const startedAt = stepState.startedAt;
  if (!startedAt) return null;
  const elapsed = (now - startedAt) / 1000;
  return Math.min(0.95, elapsed / expected);
}

export function elapsedMsForStep(
  step: 1 | 2 | 3 | 4,
  state: RunState,
  now: number,
): number | null {
  const s =
    step === 1 ? state.step1 : step === 2 ? state.step2 : step === 3 ? state.step3 : state.step4;
  if (!s.startedAt) return null;
  const end = s.completedAt ?? now;
  return Math.max(0, end - s.startedAt);
}
