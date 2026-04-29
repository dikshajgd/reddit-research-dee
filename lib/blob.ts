import { put } from "@vercel/blob";

export async function putText(
  pathname: string,
  body: string,
  contentType = "text/markdown",
): Promise<string> {
  const result = await put(pathname, body, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return result.url;
}

export async function putJson(pathname: string, body: unknown): Promise<string> {
  return putText(pathname, JSON.stringify(body), "application/json");
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch blob ${url}: ${res.status}`);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch blob ${url}: ${res.status}`);
  return (await res.json()) as T;
}

// Internal blob path for a run's artifact. Friendly download names are
// applied via Content-Disposition in the download route.
export function blobPath(runId: string, name: string): string {
  return `runs/${runId}/${name}`;
}
