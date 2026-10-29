"use client";

import RequestList from "./request-list";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useResource } from "./use-resource";
import { Field, Loading, Notice, PageHeading, reasons, statuses } from "./ui";

const sorts = {
  newest: ["createdAt", "desc"],
  oldest: ["createdAt", "asc"],
  updated: ["updatedAt", "desc"],
  customer: ["customerName", "asc"],
  order: ["orderId", "asc"],
};

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({
    search: "",
    status: "",
    reason: "",
    sort: "newest",
    page: 1,
    limit: 10,
  });
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((current) =>
          current.search === search.trim()
            ? current
            : { ...current, search: search.trim(), page: 1 },
        ),
      350,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const [sortBy, sortOrder] = sorts[query.sort];
  const params = new URLSearchParams({
    page: query.page,
    limit: query.limit,
    sortBy,
    sortOrder,
  });
  for (const key of ["search", "status", "reason"])
    if (query[key]) params.set(key, query[key]);
  const { data, error, loading, refresh } = useResource(`?${params}`);
  const update = (field, value) =>
    setQuery((current) => ({ ...current, [field]: value, page: 1 }));
  const reset = () => {
    setSearch("");
    setQuery({
      search: "",
      status: "",
      reason: "",
      sort: "newest",
      page: 1,
      limit: 10,
    });
  };

  return (
    <>
      <PageHeading
        eyebrow="Support workspace"
        title="Return requests"
        description="A clear view of every return. Review the details, find a resolution, and keep customers informed."
        action={
          <Link className="button primary" href="/requests/new">
            <span aria-hidden="true">＋</span> New request
          </Link>
        }
      />
      <section
        aria-label="Find requests"
        className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
          <Field id="search" label="Search requests">
            <input
              id="search"
              type="search"
              className="input"
              placeholder="Customer, order or reference"
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Field id="status" label="Status">
            <select
              id="status"
              className="input"
              value={query.status}
              onChange={(event) => update("status", event.target.value)}
            >
              <option value="">All statuses</option>
              {Object.entries(statuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="reason" label="Return reason">
            <select
              id="reason"
              className="input"
              value={query.reason}
              onChange={(event) => update("reason", event.target.value)}
            >
              <option value="">All reasons</option>
              {Object.entries(reasons).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="sort" label="Sort by">
            <select
              id="sort"
              className="input"
              value={query.sort}
              onChange={(event) => update("sort", event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="updated">Recently updated</option>
              <option value="customer">Customer A–Z</option>
              <option value="order">Order A–Z</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            Search by customer name, order ID or request reference.
          </p>
          <button
            className="text-sm font-medium text-teal-800 hover:underline"
            onClick={reset}
          >
            Clear filters
          </button>
        </div>
      </section>
      {error ? (
        <div className="space-y-3">
          <Notice error>{error.message}</Notice>
          <button className="button secondary" onClick={refresh}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <Loading />
      ) : (
        data && (
          <section
            aria-label="Request results"
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-800">
                All requests{" "}
                <span
                  className="ml-2 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600"
                  aria-live="polite"
                >
                  {data.total}
                </span>
              </h2>
              <span className="text-xs text-slate-500">
                {data.items.length
                  ? `${(data.page - 1) * data.limit + 1}–${(data.page - 1) * data.limit + data.items.length} of ${data.total}`
                  : `${data.total} total results`}
              </span>
            </div>
            {data.items.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <h3 className="font-semibold text-slate-800">
                  No requests found
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Try another search or clear the filters to see more requests.
                </p>
                <button onClick={reset} className="button secondary mt-5">
                  Reset view
                </button>
              </div>
            ) : (
              <RequestList items={data.items} />
            )}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 p-4">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Per page
                <select
                  className="input w-auto"
                  value={query.limit}
                  onChange={(event) =>
                    update("limit", Number(event.target.value))
                  }
                >
                  {[10, 20, 50].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <nav
                aria-label="Pagination"
                className="flex flex-wrap items-center gap-3"
              >
                <button
                  className="button secondary"
                  disabled={query.page <= 1}
                  onClick={() =>
                    setQuery((current) => ({
                      ...current,
                      page: current.page - 1,
                    }))
                  }
                >
                  Previous
                </button>
                <span className="text-xs text-slate-600">
                  Page {data.page} of {Math.max(1, data.totalPages)}
                </span>
                <button
                  className="button secondary"
                  disabled={data.page >= data.totalPages}
                  onClick={() =>
                    setQuery((current) => ({
                      ...current,
                      page: current.page + 1,
                    }))
                  }
                >
                  Next
                </button>
              </nav>
            </div>
          </section>
        )
      )}
    </>
  );
}
