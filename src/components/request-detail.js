"use client";

import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "@/lib/browser-api";
import { useResource } from "./use-resource";
import RequestForm from "./request-form";
import LifecycleActions from "./lifecycle-actions";
import {
  BackLink,
  Loading,
  Notice,
  PageHeading,
  StatusBadge,
  dateLabel,
  reasons,
  resolutions,
} from "./ui";

function Info({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1.5 break-words text-sm font-medium text-slate-900">
        {children || "Not provided"}
      </dd>
    </div>
  );
}

export default function RequestDetail({ id }) {
  const {
    data: request,
    error: loadError,
    loading,
    refresh,
  } = useResource(`/${id}`);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [removed, setRemoved] = useState(false);
  const [note, setNote] = useState("");
  async function perform(path, method, body, message) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest(`/${id}${path}`, { method, body });
      setSuccess(message);
      if (method === "DELETE") setRemoved(true);
      else refresh();
      return true;
    } catch (caught) {
      setError(caught.message);
      if ([404, 409].includes(caught.status)) {
        setEditing(false);
        refresh();
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (removed)
    return (
      <div className="mx-auto max-w-2xl">
        <BackLink />
        <section className="panel space-y-4">
          <Notice>Request removed successfully.</Notice>
          <p className="text-sm text-slate-600">
            The record has been retained and is no longer on the desk.
          </p>
          <Link href="/" className="button primary">
            Back to requests
          </Link>
        </section>
      </div>
    );
  return (
    <>
      <BackLink />
      <div className="mb-5 space-y-3">
        <Notice error>{error}</Notice>
        <Notice>{success}</Notice>
      </div>
      {loading ? (
        <Loading label="Loading request details…" />
      ) : loadError ? (
        <section className="panel space-y-4">
          <h1 className="text-xl font-semibold">
            {loadError.status === 404
              ? "Request not found"
              : "Unable to load request"}
          </h1>
          <Notice error>{loadError.message}</Notice>
          <button className="button secondary" onClick={refresh}>
            Try again
          </button>
        </section>
      ) : (
        request && (
          <>
            <PageHeading
              eyebrow="Request details"
              title={request.reference}
              description={`Created ${dateLabel(request.createdAt, true)} · Times shown in IST`}
              action={<StatusBadge status={request.status} />}
            />
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-6">
                <section className="panel">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="section-title">Customer & item</h2>
                    {["OPEN", "IN_REVIEW"].includes(request.status) &&
                      !editing && (
                        <button
                          disabled={busy}
                          className="button secondary"
                          onClick={() => setEditing(true)}
                        >
                          Edit details
                        </button>
                      )}
                  </div>
                  {editing && ["OPEN", "IN_REVIEW"].includes(request.status) ? (
                    <RequestForm
                      editing
                      initial={request}
                      onCancel={() => setEditing(false)}
                      onSave={async (data) => {
                        setBusy(true);
                        try {
                          await apiRequest(`/${id}`, {
                            method: "PATCH",
                            body: data,
                          });
                          setEditing(false);
                          setSuccess("Details updated successfully.");
                          setError("");
                          refresh();
                        } catch (caught) {
                          if ([404, 409].includes(caught.status)) {
                            setError(caught.message);
                            setEditing(false);
                            refresh();
                          } else throw caught;
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  ) : (
                    <dl className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
                      <Info label="Customer">{request.customerName}</Info>
                      <Info label="Email">{request.email}</Info>
                      <Info label="Phone">{request.phone}</Info>
                      <Info label="Order ID">{request.orderId}</Info>
                      <Info label="Item">{request.itemName}</Info>
                      <Info label="Item ID">{request.itemId}</Info>
                      <Info label="Quantity">{request.quantity}</Info>
                      <Info label="Return reason">
                        {reasons[request.reason]}
                      </Info>
                    </dl>
                  )}
                </section>
                <section className="panel">
                  <div className="mb-5">
                    <h2 className="section-title">
                      Case notes{" "}
                      <span className="ml-1 text-sm font-normal text-slate-400">
                        ({request.notes.length})
                      </span>
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      A chronological record. Notes cannot be edited or removed.
                    </p>
                  </div>
                  {request.notes.length ? (
                    <ol className="mb-6 space-y-4">
                      {request.notes.map((entry) => (
                        <li
                          key={entry.id}
                          className="border-l-2 border-teal-200 pl-4"
                        >
                          <time
                            dateTime={entry.createdAt}
                            className="text-xs text-slate-500"
                          >
                            {dateLabel(entry.createdAt, true)}
                          </time>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                            {entry.body}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mb-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                      No notes yet. Add context for the next person handling
                      this request.
                    </p>
                  )}
                  <form
                    className="space-y-3 border-t border-slate-200 pt-5"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!note.trim()) return;
                      if (
                        await perform(
                          "/notes",
                          "POST",
                          { body: note.trim() },
                          "Note added successfully.",
                        )
                      )
                        setNote("");
                    }}
                  >
                    <label
                      htmlFor="note"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Add a note
                    </label>
                    <textarea
                      id="note"
                      className="input min-h-28 resize-y"
                      required
                      maxLength={10000}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Add context, updates or the next steps…"
                      disabled={busy || editing}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-slate-400">
                        {note.length.toLocaleString()} / 10,000
                      </span>
                      <button
                        className="button primary"
                        disabled={busy || editing || !note.trim()}
                        type="submit"
                      >
                        {busy ? "Saving…" : "Add note"}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
              <aside className="min-w-0 space-y-6">
                <LifecycleActions
                  key={request.status}
                  request={request}
                  busy={busy}
                  editing={editing}
                  perform={perform}
                />
                <section className="panel">
                  <h2 className="section-title mb-5">Resolution</h2>
                  <dl className="space-y-5">
                    <Info label="Resolution type">
                      {resolutions[request.resolution] || "Not decided"}
                    </Info>
                    {request.resolution === "REFUND" && (
                      <Info label="Refund amount (store currency)">
                        {Number(request.refundAmount).toFixed(2)}
                      </Info>
                    )}
                    <Info label="Last updated">
                      {dateLabel(request.updatedAt, true)}
                    </Info>
                  </dl>
                </section>
              </aside>
            </div>
          </>
        )
      )}
    </>
  );
}
