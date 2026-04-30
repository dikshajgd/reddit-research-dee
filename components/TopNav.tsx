import Link from "next/link";

export default function TopNav() {
  return (
    <nav className="flex items-center gap-4 border-b border-neutral-200 bg-white px-4 py-3 text-sm">
      <Link href="/" className="font-semibold tracking-tight">
        Reddit VOC
      </Link>
      <span className="text-neutral-300">·</span>
      <Link href="/" className="text-neutral-700 hover:text-neutral-900">
        New run
      </Link>
      <Link href="/runs" className="text-neutral-700 hover:text-neutral-900">
        All runs
      </Link>
    </nav>
  );
}
