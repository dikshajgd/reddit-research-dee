import { NextResponse } from "next/server";
import { listRuns } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await listRuns(200);
  return NextResponse.json({ runs });
}
