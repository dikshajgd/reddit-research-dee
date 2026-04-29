import { kv } from "@vercel/kv";
import type { BatchRecord, ChunkRecord, LogEntry, RunState } from "./types";

const RUN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

const runKey = (runId: string) => `run:${runId}`;
const batchKey = (runId: string, i: number) => `run:${runId}:step2:batch:${i}`;
const chunkKey = (runId: string, i: number) => `run:${runId}:step3:chunk:${i}`;

export async function getRun(runId: string): Promise<RunState | null> {
  return (await kv.get<RunState>(runKey(runId))) ?? null;
}

export async function setRun(state: RunState): Promise<void> {
  await kv.set(runKey(state.runId), state, { ex: RUN_TTL_SECONDS });
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

export async function getBatch(runId: string, i: number): Promise<BatchRecord | null> {
  return (await kv.get<BatchRecord>(batchKey(runId, i))) ?? null;
}

export async function setBatch(runId: string, i: number, rec: BatchRecord): Promise<void> {
  await kv.set(batchKey(runId, i), rec, { ex: RUN_TTL_SECONDS });
}

export async function getChunk(runId: string, i: number): Promise<ChunkRecord | null> {
  return (await kv.get<ChunkRecord>(chunkKey(runId, i))) ?? null;
}

export async function setChunk(runId: string, i: number, rec: ChunkRecord): Promise<void> {
  await kv.set(chunkKey(runId, i), rec, { ex: RUN_TTL_SECONDS });
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
