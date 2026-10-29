import Link from "next/link";

export const reasons = {
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  SIZE_ISSUE: "Size issue",
  NOT_AS_DESCRIBED: "Not as described",
  CHANGED_MIND: "Changed mind",
};
export const statuses = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
};
export const resolutions = {
  REFUND: "Refund",
  REPLACEMENT: "Replacement",
  STORE_CREDIT: "Store credit",
};
const badgeStyles = {
  OPEN: "bg-blue-50 text-blue-800 ring-blue-200",
  IN_REVIEW: "bg-amber-50 text-amber-900 ring-amber-200",
  APPROVED: "bg-violet-50 text-violet-800 ring-violet-200",
  REJECTED: "bg-rose-50 text-rose-800 ring-rose-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${badgeStyles[status]}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-current"
      />
      {statuses[status]}
    </span>
  );
}

export function dateLabel(value, time = false) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    ...(time ? { timeStyle: "short" } : {}),
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function Notice({ children, error = false }) {
  if (!children) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`rounded-xl border p-4 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
    >
      {children}
    </div>
  );
}

export function Field({ label, id, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function BackLink() {
  return (
    <Link
      href="/"
      className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
    >
      <span aria-hidden="true">←</span> All requests
    </Link>
  );
}

export function Loading({ label = "Loading requests…" }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500"
    >
      {label}
    </div>
  );
}
