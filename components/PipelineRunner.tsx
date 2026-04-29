"use client";
import { useEffect, useRef, useState } from "react";
import type { RunState } from "@/lib/types";
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

export default function PipelineRunner({ initial }: { initial: RunState }) {
  const [state, setState] = useState<RunState>(initial);
  const [error, setError] = useState<string | null>(null);
  const driverStarted = useRef(false);

  // Poll while anything is in flight.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      while (alive) {
        try {
          const next = await fetchState(state.runId);
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
  }, [state.runId, state.step1.status, state.step2.status, state.step3.status, state.step4.status]);

  // Drive the pipeline forward from the client.
  useEffect(() => {
    if (driverStarted.current) return;
    driverStarted.current = true;
    void drive();
    async function drive() {
      try {
        const runId = state.runId;
        let s = state;

        // Step 1
        if (s.step1.status === "pending") {
          await postJson(`/api/runs/${runId}/step1`);
          s = await fetchState(runId);
          setState(s);
        }
        if (s.step1.status === "failed") return;

        // Step 2 — only auto-run on first attempt.
        if (s.step2.status === "pending") {
          const startRes = await postJson(`/api/runs/${runId}/step2/start`);
          const batches: string[][] = startRes.batches ?? [];
          for (let i = 0; i < batches.length; i++) {
            await postJson(`/api/runs/${runId}/step2/batch?i=${i}`);
          }
          s = await fetchState(runId);
          setState(s);
        }
        if (s.step2.status === "failed") return;
        if (s.step2.status !== "complete" && s.step2.status !== "uploaded") return;

        // Step 3
        if (s.step3.status === "pending") {
          const startRes = await postJson(`/api/runs/${runId}/step3/start`);
          const planned: number = startRes.plannedChunks ?? 1;
          for (let i = 0; i < planned; i++) {
            await postJson(`/api/runs/${runId}/step3/chunk?i=${i}`);
          }
          s = await fetchState(runId);
          if (s.step3.status === "merging") {
            await postJson(`/api/runs/${runId}/step3/merge`);
            s = await fetchState(runId);
          }
          setState(s);
        }
        if (s.step3.status !== "complete") return;

        // Step 4
        if (s.step4.status === "pending") {
          await postJson(`/api/runs/${runId}/step4`);
          s = await fetchState(runId);
          setState(s);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [state]);

  async function retryStep2() {
    setError(null);
    try {
      const startRes = await postJson(`/api/runs/${state.runId}/step2/start`);
      const batches: string[][] = startRes.batches ?? [];
      for (let i = 0; i < batches.length; i++) {
        await postJson(`/api/runs/${state.runId}/step2/batch?i=${i}`);
      }
      const next = await fetchState(state.runId);
      setState(next);
      driverStarted.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function uploadStep2(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const ext = file.name.includes(".") ? file.name.split(".").pop()! : "txt";
      await fetch(`/api/runs/${state.runId}/step2/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, fileType: ext }),
      });
      const next = await fetchState(state.runId);
      setState(next);
      driverStarted.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <StepProgress state={state} />

      {(error || state.step1.error || state.step2.error || state.step3.error || state.step4.error) && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">
            {error || state.step1.error || state.step2.error || state.step3.error || state.step4.error}
          </p>
        </Card>
      )}

      {state.step2.status === "failed" && (
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

      <ResultsTabs state={state} onStateChange={setState} />
    </div>
  );
}
