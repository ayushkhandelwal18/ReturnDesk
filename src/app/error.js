"use client";
import { Notice } from "@/components/ui";
export default function ErrorPage({ reset }) {
  return (
    <section className="panel space-y-4">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <Notice error>The page could not be displayed. Please try again.</Notice>
      <button className="button secondary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
