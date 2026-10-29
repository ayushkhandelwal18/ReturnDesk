import Link from "next/link";
export default function NotFound() {
  return (
    <section className="panel space-y-4">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-slate-600">
        This page is unavailable. Return to your requests to continue.
      </p>
      <Link className="button primary" href="/">
        Back to requests
      </Link>
    </section>
  );
}
