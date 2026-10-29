"use client";

import { useState } from "react";
import { statusInput } from "@/lib/validation";
import { Field, Notice, resolutions } from "./ui";

export default function LifecycleActions({ request, busy, editing, perform }) {
  const [approving, setApproving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [resolution, setResolution] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const transition = (status) =>
    perform("/status", "PATCH", { status }, "Status updated successfully.");

  async function approve(event) {
    event.preventDefault();
    const result = statusInput.safeParse({
      status: "APPROVED",
      resolution,
      ...(resolution === "REFUND" ? { refundAmount: amount } : {}),
    });
    if (!result.success) {
      setError(result.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setError("");
    await perform(
      "/status",
      "PATCH",
      result.data,
      "Request approved successfully.",
    );
  }

  return (
    <section className="panel space-y-5">
      <div>
        <h2 className="section-title">Next steps</h2>
        <p className="mt-1 text-sm text-slate-500">
          Actions available for this request.
        </p>
      </div>
      <fieldset
        disabled={busy || editing}
        className="space-y-4 disabled:opacity-60"
      >
        <legend className="sr-only">Request actions</legend>
        {request.status === "OPEN" && (
          <button
            className="button primary w-full"
            onClick={() => transition("IN_REVIEW")}
          >
            Start review
          </button>
        )}
        {request.status === "IN_REVIEW" && (
          <>
            <button
              className="button primary w-full"
              onClick={() => {
                setApproving(!approving);
                setError("");
              }}
              aria-expanded={approving}
            >
              Approve request
            </button>
            <button
              className="button secondary w-full"
              onClick={() => transition("REJECTED")}
            >
              Reject request
            </button>
          </>
        )}
        {request.status === "APPROVED" && (
          <button
            className="button primary w-full"
            onClick={() => transition("COMPLETED")}
          >
            Mark as completed
          </button>
        )}
        {["COMPLETED", "REJECTED"].includes(request.status) && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            This request is closed. Notes can still be added.
          </p>
        )}
        {request.status === "IN_REVIEW" && approving && (
          <form
            className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/50 p-4"
            onSubmit={approve}
          >
            <Notice error>{error}</Notice>
            <Field id="resolution" label="Resolution *">
              <select
                id="resolution"
                className="input"
                required
                value={resolution}
                onChange={(event) => {
                  setResolution(event.target.value);
                  setAmount("");
                }}
              >
                <option value="">Choose a resolution</option>
                {Object.entries(resolutions).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {resolution === "REFUND" && (
              <Field
                id="refund"
                label="Refund amount *"
                hint="Use the store currency, with up to two decimal places."
              >
                <input
                  id="refund"
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-describedby="refund-hint"
                />
              </Field>
            )}
            <p className="text-xs text-slate-600">
              Approval locks customer and item details.
            </p>
            <button className="button primary w-full" type="submit">
              Confirm approval
            </button>
          </form>
        )}
        {["OPEN", "REJECTED"].includes(request.status) && (
          <div className="border-t border-slate-200 pt-4">
            {removing ? (
              <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm text-rose-900">
                  Remove this request from the desk? Its record is retained, but
                  it will no longer be accessible here.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="button danger"
                    onClick={() =>
                      perform("", "DELETE", undefined, "Request removed.")
                    }
                  >
                    Confirm removal
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setRemoving(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-sm font-medium text-rose-700 hover:underline"
                onClick={() => setRemoving(true)}
              >
                Remove request
              </button>
            )}
          </div>
        )}
      </fieldset>
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          Saving changes…
        </p>
      )}
    </section>
  );
}
