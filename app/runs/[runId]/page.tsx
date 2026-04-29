import { notFound } from "next/navigation";
import PipelineRunner from "@/components/PipelineRunner";
import { getRun } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const state = await getRun(runId);
  if (!state) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Run · {state.input.product}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {state.input.industry} · runId {runId.slice(0, 8)}
          </p>
        </div>
        <a href="/" className="text-sm underline">
          ← New run
        </a>
      </header>
      <PipelineRunner initial={state} />
    </main>
  );
}
