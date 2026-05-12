export type SubredditMap = Record<string, string[]>;
export type KeywordMap = Record<string, string[]>;

export type ParsedStep1 = {
  subreddits: SubredditMap;
  keywords: KeywordMap;
};

export type RedditThread = {
  id: string;
  title: string;
  selfText: string;
  author: string;
  subreddit: string;
  score: number;
  upVotes: number;
  url: string;
  numComments: number;
  created: number;
  comments: Array<{
    author: string;
    body: string;
    score: number;
    upVotes: number;
  }>;
};

export type StepStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "skipped"
  | "uploaded"
  | "merging";

export type LogEntry = { ts: number; level: "info" | "warn" | "error"; msg: string };

export type RunControl = "running" | "paused" | "stopped";

export type RunState = {
  runId: string;
  createdAt: number;
  /** Whether the client driver should advance the pipeline. Defaults to "running". */
  control?: RunControl;
  input: {
    product: string;
    industry: string;
    brandUrl?: string;
    extraKeywords?: string;
  };
  config: { maxThreads: number; maxComments: number };

  step1: {
    status: StepStatus;
    parsed?: ParsedStep1;
    blobUrl?: string;
    error?: string;
    startedAt?: number;
    completedAt?: number;
  };
  step2: {
    status: StepStatus;
    method?: "apify" | "uploaded" | "none";
    plannedBatches: number;
    completedBatches: number;
    threadCount: number;
    threadsBlobUrl?: string;
    error?: string;
    startedAt?: number;
    completedAt?: number;
    /** Number of scrape passes attempted (1 = initial; >1 = "scrape more" passes). */
    passCount?: number;
    /** Apify actor run id currently in flight for this step, so /stop can abort it. */
    activeApifyRunId?: string;
  };
  step3: {
    status: StepStatus;
    plannedChunks: number;
    completedChunks: number;
    chunkBlobUrls: string[];
    blobUrl?: string;
    error?: string;
    startedAt?: number;
    completedAt?: number;
  };
  step4: {
    status: StepStatus;
    blobUrl?: string;
    error?: string;
    startedAt?: number;
    completedAt?: number;
  };
  review: { submitted: boolean; editedAt?: number };
  logs: LogEntry[];
  elapsedMs?: number;
};

export type RunSummary = {
  runId: string;
  createdAt: number;
  product: string;
  industry: string;
  finalStatus: "running" | "complete" | "failed" | "partial";
  elapsedMs?: number;
};

export type BatchRecord = {
  status: "pending" | "running" | "complete" | "failed";
  threadCount?: number;
  error?: string;
};

export type ChunkRecord = {
  status: "pending" | "running" | "complete" | "failed";
  blobUrl?: string;
  error?: string;
};
