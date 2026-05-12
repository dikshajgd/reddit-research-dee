"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunControl, RunState } from "@/lib/types";
import StepProgress from "./StepProgress";
import ResultsTabs from "./ResultsTabs";
import { Button, Card } from "./ui/primitives";

const POLL_MS = 2000;

async function fetchState(runId: string): Promise<RunState> {
  const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch run: ${res.status}`);
  return res.json();
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function controlOf(s: RunState): RunControl {
  return s.control ?? "running";
}

class PipelineHaltedError extends Error {
  constructor(public reason: RunControl) {
    super(`pipeline ${reason}`);
  }
}

export default function PipelineRunner({ initial }: { initial: RunState }) {
  const [state, setState] = useState<RunState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [scrapingMore, setScrapingMore] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const driverBusy = useRef(false);
  const runId = state.runId;

  // Poll while anything is in flight. Stop once everything settles or run is paused/stopped.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      while (alive) {
        try {
          const next = await fetchState(runId);
          if (!alive) return;
          setState(next);
          const inFlight =
            next.step1.status === "running" ||
            next.step2.status === "running" ||
            next.step3.status === "running" ||
            next.step3.status === "merging" ||
            next.step4.status === "running";
          if (!inFlight) return;
        } catch {
          // ignore transient errors and keep polling
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    };
    tick();
    return () => {
      alive = false;
    };
  }, [
    runId,
    state.step1.status,
    state.step2.status,
    state.step3.status,
    state.step4.status,
    state.control,
  ]);

  // Before each step transition, fetch fresh state. Bail if the user paused
  // or stopped the run in the meantime.
  const checkpoint = useCallback(async (): Promise<RunState> => {
    const fresh = await fetchState(runId);
    setState(fresh);
    const c = controlOf(fresh);
    if (c !== "running") throw new PipelineHaltedError(c);
    return fresh;
  }, [runId]);

  // Main driver. Handles both initial start and resume-from-anywhere.
  // Returns when no more work can be done (gate reached, paused, stopped, or finished).
  const drive = useCallback(async () => {
    if (driverBusy.current) return;
    driverBusy.current = true;
    try {
      let s = await fetchState(runId);
      setState(s);
      if (controlOf(s) !== "running") return;

      // Step 1
      if (s.step1.status === "pending") {
        await postJson(`/api/runs/${runId}/step1`);
        s = await checkpoint();
      }
      if (s.step1.status === "failed") return;

      // Step 2: kick off first pass, OR resume an in-progress pass.
      if (s.step2.status === "pending") {
        const startRes = await postJson(`/api/runs/${runId}/step2/start`);
        const batches: string[][] = startRes.batches ?? [];
        const pass: number = startRes.pass ?? 1;
        for (let i = 0; i < batches.length; i++) {
          await checkpoint();
          await postJson(`/api/runs/${runId}/step2/batch?i=${i}&pass=${pass}`);
        }
        s = await fetchState(runId);
        setState(s);
      } else if (
        s.step2.status === "running" &&
        s.step2.plannedBatches > 0 &&
        s.step2.completedBatches < s.step2.plannedBatches
      ) {
        const pass = s.step2.passCount ?? 1;
        for (let i = s.step2.completedBatches; i < s.step2.plannedBatches; i++) {
          await checkpoint();
          await postJson(`/api/runs/${runId}/step2/batch?i=${i}&pass=${pass}`);
        }
        s = await fetchState(runId);
        setState(s);
      }

      // Gate: if Step 3 hasn't been kicked off yet, wait for the user.
      if (s.step3.status === "pending") return;

      // Step 3 chunks (resume from completedChunks).
      if (
        s.step3.status === "running" &&
        s.step3.completedChunks < s.step3.plannedChunks
      ) {
        for (let i = s.step3.completedChunks; i < s.step3.plannedChunks; i++) {
          await checkpoint();
          await postJson(`/api/runs/${runId}/step3/chunk?i=${i}`);
        }
        s = await checkpoint();
      }
      if (s.step3.status === "merging") {
        await postJson(`/api/runs/${runId}/step3/merge`);
        s = await checkpoint();
      }
      if (s.step3.status !== "complete") return;

      // Step 4
      if (s.step4.status === "pending") {
        await postJson(`/api/runs/${runId}/step4`);
        s = await fetchState(runId);
        setState(s);
      }
    } catch (e) {
      if (!(e instanceof PipelineHaltedError)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      driverBusy.current = false;
    }
  }, [runId, checkpoint]);

  // Kick off the driver on mount.
  useEffect(() => {
    void drive();
  }, [drive]);

  async function retryStep2() {
    setError(null);
    try {
      await checkpoint();
      const startRes = await postJson(`/api/runs/${runId}/step2/start`);
      const batches: string[][] = startRes.batches ?? [];
      const pass: number = startRes.pass ?? 1;
      for (let i = 0; i < batches.length; i++) {
        await checkpoint();
        await postJson(`/api/runs/${runId}/step2/batch?i=${i}&pass=${pass}`);
      }
      const next = await fetchState(runId);
      setState(next);
    } catch (e) {
      if (!(e instanceof PipelineHaltedError)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  async function uploadStep2(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const ext = file.name.includes(".") ? file.name.split(".").pop()! : "txt";
      await fetch(`/api/runs/${runId}/step2/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, fileType: ext }),
      });
      const next = await fetchState(runId);
      setState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onScrapeMore() {
    setError(null);
    setScrapingMore(true);
    try {
      await checkpoint();
      const startRes = await postJson(`/api/runs/${runId}/step2/more`);
      if (startRes.error) throw new Error(startRes.error);
      const batches: string[][] = startRes.batches ?? [];
      const pass: number = startRes.pass ?? 1;
      setState(await fetchState(runId));
      for (let i = 0; i < batches.length; i++) {
        await checkpoint();
        await postJson(`/api/runs/${runId}/step2/batch?i=${i}&pass=${pass}`);
      }
      setState(await fetchState(runId));
    } catch (e) {
      if (!(e instanceof PipelineHaltedError)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setScrapingMore(false);
    }
  }

  async function onContinueToExtraction() {
    setError(null);
    setContinuing(true);
    try {
      await checkpoint();
      const startRes = await postJson(`/api/runs/${runId}/step3/start`);
      const planned: number = startRes.plannedChunks ?? 1;
      for (let i = 0; i < planned; i++) {
        await checkpoint();
        await postJson(`/api/runs/${runId}/step3/chunk?i=${i}`);
      }
      let s = await checkpoint();
      if (s.step3.status === "merging") {
        await postJson(`/api/runs/${runId}/step3/merge`);
        s = await checkpoint();
      }
      if (s.step3.status === "complete" && s.step4.status === "pending") {
        await postJson(`/api/runs/${runId}/step4`);
        s = await fetchState(runId);
        setState(s);
      }
    } catch (e) {
      if (!(e instanceof PipelineHaltedError)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setContinuing(false);
    }
  }

  async function setControl(action: "pause" | "resume" | "stop") {
    if (controlBusy) return;
    setControlBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${action} failed`);
      setState(data);
      if (action === "resume") {
        // Re-engage the driver so it picks up wherever the run left off.
        void drive();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setControlBusy(false);
    }
  }

  const control = controlOf(state);

  const showStep2Gate =
    control === "running" &&
    (state.step2.status === "complete" || state.step2.status === "uploaded") &&
    state.step3.status === "pending" &&
    !continuing;
  const isApifyPass = state.step2.method === "apify";

  const anyInFlight =
    state.step1.status === "running" ||
    state.step2.status === "running" ||
    state.step3.status === "running" ||
    state.step3.status === "merging" ||
    state.step4.status === "running";
  const anyComplete = state.step4.status === "complete" || state.review.submitted;

  return (
    <div className="space-y-6">
      {/* Run controls */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-neutral-500">Run state: </span>
            <span
              className={
                control === "running"
                  ? "font-semibold text-green-700"
                  : control === "paused"
                  ? "font-semibold text-amber-700"
                  : "font-semibold text-red-700"
              }
            >
              {control === "running" ? "Running" : control === "paused" ? "Paused" : "Stopped"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {control === "running" && (
              <Button
                variant="secondary"
                onClick={() => setControl("pause")}
                disabled={controlBusy || anyComplete}
                title={anyComplete ? "Run already finished" : "Pause the driver"}
              >
                ⏸️ Pause
              </Button>
            )}
            {control === "paused" && (
              <Button onClick={() => setControl("resume")} disabled={controlBusy}>
                ▶️ Resume
              </Button>
            )}
            {control !== "stopped" && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (confirm("Stop this run? Any in-flight Apify scrape will be aborted.")) {
                    void setControl("stop");
                  }
                }}
                disabled={controlBusy || anyComplete}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                ⏹️ Stop
              </Button>
            )}
          </div>
        </div>
        {control === "paused" && (
          <p className="mt-2 text-xs text-neutral-600">
            Driver paused. Any in-flight server request will finish naturally; no new steps will start until you resume.
          </p>
        )}
        {control === "stopped" && (
          <p className="mt-2 text-xs text-red-700">
            Run stopped. Start a new run from the home page to try again.
          </p>
        )}
        {anyInFlight && control === "running" && (
          <p className="mt-2 text-xs text-neutral-500">
            A step is in flight. Pausing or stopping won&apos;t cancel the current server call, but will prevent the next one. Stop also aborts any Apify scrape mid-flight.
          </p>
        )}
      </Card>

      <StepProgress state={state} />

      {(error || state.step1.error || state.step2.error || state.step3.error || state.step4.error) && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">
            {error || state.step1.error || state.step2.error || state.step3.error || state.step4.error}
          </p>
        </Card>
      )}

      {state.step2.status === "failed" && control === "running" && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Step 2 recovery</h3>
          <p className="text-sm text-neutral-600">
            Apify returned no results. Retry, or upload your own Reddit data.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={retryStep2}>🔄 Retry from Step 2</Button>
            <label className="text-sm">
              <span className="mr-2">— or upload —</span>
              <input
                type="file"
                accept=".md,.txt,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadStep2(f);
                }}
              />
            </label>
          </div>
        </Card>
      )}

      {showStep2Gate && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Scraping done</h3>
            <p className="text-xs text-neutral-600">
              {state.step2.threadCount} unique threads collected
              {isApifyPass ? ` · ${state.step2.passCount ?? 1} pass${(state.step2.passCount ?? 1) > 1 ? "es" : ""}` : ""}
            </p>
          </div>
          <p className="text-sm text-neutral-600">
            Continue to VOC extraction, or grab more data first.
            {isApifyPass &&
              " Each extra pass uses a fresh slice of keywords and dedupes against what you already have."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onContinueToExtraction} disabled={continuing || scrapingMore}>
              ▶️ Continue to Step 3
            </Button>
            {isApifyPass && (
              <Button
                variant="secondary"
                onClick={onScrapeMore}
                disabled={scrapingMore || continuing}
              >
                {scrapingMore ? "Scraping…" : "➕ Scrape more"}
              </Button>
            )}
          </div>
        </Card>
      )}

      <ResultsTabs state={state} onStateChange={setState} />
    </div>
  );
}
