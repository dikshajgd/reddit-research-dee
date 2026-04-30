import PipelineForm from "@/components/PipelineForm";
import TopNav from "@/components/TopNav";

export default function HomePage() {
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-10 space-y-8">
        <header>
          <h1 className="text-3xl font-bold">Reddit VOC Research Pipeline</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Generate keywords + subreddit map, scrape Reddit, extract VOC, and cluster personas.
          </p>
        </header>
        <PipelineForm />
      </main>
    </>
  );
}
