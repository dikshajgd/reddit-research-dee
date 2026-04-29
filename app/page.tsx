import PipelineForm from "@/components/PipelineForm";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Reddit VOC Research Pipeline</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Generate keywords + subreddit map, scrape Reddit, extract VOC, and cluster personas.
        </p>
      </header>
      <PipelineForm />
    </main>
  );
}
