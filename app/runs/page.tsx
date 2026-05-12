import Link from "next/link";
import TopNav from "@/components/TopNav";
import { backfillIndexIfEmpty, listRuns } from "@/lib/store";
import { formatMmSs } from "@/lib/timing";
import type { RunSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

function statusBadge(status: RunSummary["finalStatus"]) {
  const map = {
    complete: { icon: "✅", label: "Complete", cls: "bg-green-50 text-green-800 border-green-200" },
    running: { icon: "⏳", label: "Running", cls: "bg-blue-50 text-blue-800 border-blue-200" },
    failed: { icon: "❌", label: "Failed", cls: "bg-red-50 text-red-800 border-red-200" },
    partial: { icon: "◐", label: "Partial", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  } as const;
  const b = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${b.cls}`}>
      <span>{b.icon}</span>
      {b.label}
    </span>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RunsIndexPage() {
  // Pick up any pre-existing runs that predate the index (one-shot, cheap once filled).
  await backfillIndexIfEmpty();
  const runs = await listRuns(200);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">All runs</h1>
          <p className="text-xs text-neutral-500">{runs.length} session{runs.length === 1 ? "" : "s"}</p>
        </header>

        {runs.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 bg-white p-12 text-center">
            <p className="text-sm text-neutral-600">
              No runs yet.{" "}
              <Link href="/" className="font-medium underline underline-offset-2">
                Start one from the home page
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Industry</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {runs.map((r) => (
                  <tr key={r.runId} className="hover:bg-neutral-50">
                    <td className="px-4 py-2 text-neutral-700 whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-4 py-2 font-medium text-neutral-900">{r.product}</td>
                    <td className="px-4 py-2 text-neutral-700">{r.industry}</td>
                    <td className="px-4 py-2">{statusBadge(r.finalStatus)}</td>
                    <td className="px-4 py-2 text-neutral-700 tabular-nums">
                      {r.elapsedMs ? formatMmSs(r.elapsedMs) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/runs/${r.runId}`}
                        className="font-medium text-neutral-900 underline underline-offset-2"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
