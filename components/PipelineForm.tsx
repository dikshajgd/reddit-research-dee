"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Slider } from "./ui/primitives";

export default function PipelineForm() {
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [industry, setIndustry] = useState("");
  const [brandUrl, setBrandUrl] = useState("");
  const [extraKeywords, setExtraKeywords] = useState("");
  const [maxThreads, setMaxThreads] = useState(20);
  const [maxComments, setMaxComments] = useState(25);
  const [haveMap, setHaveMap] = useState(false);
  const [uploadedStep1Md, setUploadedStep1Md] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUploadStep1(file: File) {
    const text = await file.text();
    setUploadedStep1Md(text);
  }

  async function onSubmit() {
    setError(null);
    if (!product.trim() || !industry.trim()) {
      setError("Product and Industry are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          industry,
          brandUrl,
          extraKeywords,
          maxThreads,
          maxComments,
          uploadedStep1Md: haveMap ? uploadedStep1Md : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start run");
      router.push(`/runs/${data.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Product / Category *</Label>
          <Input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="e.g., tone adapting foundation, standing desk, greens powder"
          />
        </div>
        <div className="space-y-1">
          <Label>Industry / Niche *</Label>
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g., beauty/cosmetics, office furniture, health supplements"
          />
        </div>
        <div className="space-y-1">
          <Label>Brand URL (optional)</Label>
          <Input
            value={brandUrl}
            onChange={(e) => setBrandUrl(e.target.value)}
            placeholder="e.g., https://smooche.com"
          />
        </div>
        <div className="space-y-1">
          <Label>Extra Keywords (optional)</Label>
          <Input
            value={extraKeywords}
            onChange={(e) => setExtraKeywords(e.target.value)}
            placeholder="e.g., color changing, self-adjusting, pH reactive"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Slider
          value={maxThreads}
          onValueChange={setMaxThreads}
          min={10}
          max={200}
          label="Max threads per keyword"
        />
        <Slider
          value={maxComments}
          onValueChange={setMaxComments}
          min={10}
          max={200}
          label="Max comments per thread"
        />
      </div>

      <div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={haveMap}
            onChange={(e) => setHaveMap(e.target.checked)}
          />
          Already have a subreddit map?
        </label>
        {haveMap && (
          <div className="mt-2">
            <input
              type="file"
              accept=".md,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadStep1(f);
              }}
            />
            {uploadedStep1Md && (
              <p className="mt-1 text-xs text-green-700">
                Loaded {uploadedStep1Md.length} characters. Step 1 will be skipped.
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={onSubmit} disabled={submitting}>
        {submitting ? "Starting..." : "🚀 Run Pipeline"}
      </Button>
    </Card>
  );
}
