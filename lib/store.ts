import { kv } from "@vercel/kv";
import type { BatchRecord, ChunkRecord, LogEntry, RunState, RunSummary } from "./types";

// Transient working state (per-batch / per-chunk records) expires after 14d.
// Run state itself is kept indefinitely so the global sessions index always works.
const TRANSIENT_TTL_SECONDS = 60 * 60 * 24 * 14;

const RUNS_INDEX = "runs:index";
const runKey = (runId: string) => `run:${runId}`;
const batchKey = (runId: string, pass: number, i: number) =>
  `run:${runId}:step2:pass:${pass}:batch:${i}`;
const chunkKey = (runId: string, i: number) => `run:${runId}:step3:chunk:${i}`;

// Self-heal known stale-state shapes. Downstream-complete + upstream-running
// is logically impossible (downstream only fires after upstream completes), so
// fold the upstream forward.
function repairRunState(state: RunState): { state: RunState; changed: boolean } {
  let changed = false;
  const now = Date.now();

  if (
    state.step4.status === "complete" &&
    state.step3.status !== "complete" &&
    state.step3.status !== "failed" &&
    state.step3.status !== "skipped"
  ) {
    state.step3.status = "complete";
    state.step3.completedAt =
      state.step3.completedAt ?? state.step4.startedAt ?? now;
    if (state.step3.plannedChunks > 0) {
      state.step3.completedChunks = state.step3.plannedChunks;
    }
    changed = true;
  }

  if (
    state.step3.status === "complete" &&
    state.step2.status !== "complete" &&
    state.step2.status !== "failed" &&
    state.step2.status !== "skipped" &&
    state.step2.status !== "uploaded"
  ) {
    state.step2.status = "complete";
    state.step2.completedAt =
      state.step2.completedAt ?? state.step3.startedAt ?? now;
    if (state.step2.plannedBatches > 0) {
      state.step2.completedBatches = state.step2.plannedBatches;
    }
    // Clear any orphaned Apify tracking marker.
    if (state.step2.activeApifyRunId) state.step2.activeApifyRunId = undefined;
    changed = true;
  }

  if (
    state.step2.status === "complete" &&
    state.step1.status !== "complete" &&
    state.step1.status !== "failed" &&
    state.step1.status !== "skipped"
  ) {
    state.step1.status = "complete";
    state.step1.completedAt =
      state.step1.completedAt ?? state.step2.startedAt ?? now;
    changed = true;
  }

  return { state, changed };
}

export async function getRun(runId: string): Promise<RunState | null> {
  const raw = await kv.get<RunState>(runKey(runId));
  if (!raw) return null;
  const { state, changed } = repairRunState(raw);
  if (changed) {
    // Best-effort persist so subsequent reads see the cleaned state.
    try {
      await kv.set(runKey(state.runId), state);
    } catch {
      // ignore — the in-memory state is still correct for this response
    }
  }
  return state;
}

export async function setRun(state: RunState): Promise<void> {
  // No TTL — runs persist indefinitely for the sessions index.
  await kv.set(runKey(state.runId), state);
}

export async function updateRun(
  runId: string,
  mutator: (state: RunState) => void,
): Promise<RunState> {
  const state = await getRun(runId);
  if (!state) throw new Error(`Run ${runId} not found`);
  mutator(state);
  await setRun(state);
  return state;
}

export function appendLog(state: RunState, level: LogEntry["level"], msg: string): void {
  state.logs.push({ ts: Date.now(), level, msg });
  if (state.logs.length > 500) state.logs = state.logs.slice(-500);
}

export async function getBatch(
  runId: string,
  pass: number,
  i: number,
): Promise<BatchRecord | null> {
  return (await kv.get<BatchRecord>(batchKey(runId, pass, i))) ?? null;
}

export async function setBatch(
  runId: string,
  pass: number,
  i: number,
  rec: BatchRecord,
): Promise<void> {
  await kv.set(batchKey(runId, pass, i), rec, { ex: TRANSIENT_TTL_SECONDS });
}

export async function getChunk(runId: string, i: number): Promise<ChunkRecord | null> {
  return (await kv.get<ChunkRecord>(chunkKey(runId, i))) ?? null;
}

export async function setChunk(runId: string, i: number, rec: ChunkRecord): Promise<void> {
  await kv.set(chunkKey(runId, i), rec, { ex: TRANSIENT_TTL_SECONDS });
}

export async function addRunToIndex(runId: string, createdAt: number): Promise<void> {
  await kv.zadd(RUNS_INDEX, { score: createdAt, member: runId });
}

export async function removeRunFromIndex(runId: string): Promise<void> {
  await kv.zrem(RUNS_INDEX, runId);
}

// One-time scan that finds any `run:{uuid}` keys not yet present in the sorted
// set and adds them. Idempotent: calling it again is cheap once the index is
// populated because the early-exit on a non-empty index skips the SCAN.
export async function backfillIndexIfEmpty(): Promise<number> {
  const existing = await kv.zcard(RUNS_INDEX);
  if (existing > 0) return 0;

  let cursor: string | number = 0;
  let added = 0;
  do {
    const result = (await kv.scan(cursor as number, { match: "run:*", count: 200 })) as [
      string | number,
      string[],
    ];
    cursor = result[0];
    const keys = result[1] ?? [];
    for (const k of keys) {
      // Skip per-batch / per-chunk sub-keys (they contain extra colons).
      const rest = k.startsWith("run:") ? k.slice(4) : k;
      if (rest.includes(":")) continue;
      const state = await kv.get<RunState>(k);
      if (state?.runId && typeof state.createdAt === "number") {
        await kv.zadd(RUNS_INDEX, { score: state.createdAt, member: state.runId });
        added++;
      }
    }
  } while (cursor !== 0 && cursor !== "0");
  return added;
}

function summarize(state: RunState): RunSummary {
  const steps = [state.step1.status, state.step2.status, state.step3.status, state.step4.status];
  let finalStatus: RunSummary["finalStatus"];
  if (state.control === "stopped") {
    finalStatus = "failed"; // shown as a clear non-success state in the list
  } else if (state.control === "paused") {
    finalStatus = "partial";
  } else if (steps.some((s) => s === "running" || s === "merging")) {
    finalStatus = "running";
  } else if (state.step4.status === "complete") {
    finalStatus = "complete";
  } else if (steps.some((s) => s === "failed")) {
    finalStatus = "failed";
  } else {
    finalStatus = "partial";
  }
  return {
    runId: state.runId,
    createdAt: state.createdAt,
    product: state.input.product,
    industry: state.input.industry,
    finalStatus,
    elapsedMs: state.elapsedMs,
  };
}

export async function listRuns(limit = 100): Promise<RunSummary[]> {
  // Newest first.
  const ids = await kv.zrange<string[]>(RUNS_INDEX, 0, limit - 1, { rev: true });
  if (!ids?.length) return [];
  const keys = ids.map(runKey);
  const states = await kv.mget<RunState[]>(...keys);
  const summaries: RunSummary[] = [];
  for (const s of states) {
    if (s) summaries.push(summarize(s));
  }
  return summaries;
}

export function newRun(input: {
  product: string;
  industry: string;
  brandUrl?: string;
  extraKeywords?: string;
  maxThreads: number;
  maxComments: number;
}): RunState {
  return {
    runId: crypto.randomUUID(),
    createdAt: Date.now(),
    control: "running",
    input: {
      product: input.product,
      industry: input.industry,
      brandUrl: input.brandUrl,
      extraKeywords: input.extraKeywords,
    },
    config: { maxThreads: input.maxThreads, maxComments: input.maxComments },
    step1: { status: "pending" },
    step2: { status: "pending", plannedBatches: 0, completedBatches: 0, threadCount: 0 },
    step3: { status: "pending", plannedChunks: 0, completedChunks: 0, chunkBlobUrls: [] },
    step4: { status: "pending" },
    review: { submitted: false },
    logs: [],
  };
}
