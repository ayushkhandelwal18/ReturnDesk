"use client";

import { useState } from "react";
import { createInput } from "@/lib/validation";
import { Field, Notice, reasons } from "./ui";

const fields = [
  ["customerName", "Customer name", "text", 200],
  ["email", "Email address", "email", 254],
  ["phone", "Phone number", "tel", 32],
  ["orderId", "Order ID", "text", 100],
  ["itemId", "Item ID", "text", 100],
  ["itemName", "Item name", "text", 200],
];

export default function RequestForm({
  initial = {},
  onSave,
  onCancel,
  editing = false,
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries([
      ...fields.map(([key]) => [key, initial[key] ?? ""]),
      ["quantity", initial.quantity ?? 1],
      ["reason", initial.reason ?? ""],
    ]),
  );
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (event) =>
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));

  async function submit(event) {
    event.preventDefault();
    const result = createInput.safeParse({
      ...values,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      quantity: Number(values.quantity),
    });
    if (!result.success) {
      const issues = Object.fromEntries(
        result.error.issues.map((issue) => {
          const key = issue.path[0];
          const message =
            key === "reason"
              ? "Choose a return reason."
              : key === "quantity"
                ? "Enter a whole-number quantity of at least 1."
                : issue.code === "too_small"
                  ? "This field is required."
                  : issue.message;
          return [key, message];
        }),
      );
      setErrors(issues);
      setError("Please check the highlighted fields.");
      document
        .getElementById(`form-${result.error.issues[0].path[0]}`)
        ?.focus();
      return;
    }
    setErrors({});
    setError("");
    setSaving(true);
    try {
      await onSave(result.data);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Notice error>{error}</Notice>
      <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
        <legend className="sr-only">Customer and return details</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {fields.map(([key, label, type, maxLength]) => (
            <Field
              key={key}
              id={`form-${key}`}
              label={`${label}${["email", "phone"].includes(key) ? "" : " *"}`}
            >
              <input
                id={`form-${key}`}
                name={key}
                type={type}
                autoComplete={
                  key === "customerName"
                    ? "name"
                    : key === "email"
                      ? "email"
                      : key === "phone"
                        ? "tel"
                        : "off"
                }
                className="input"
                required={!["email", "phone"].includes(key)}
                maxLength={maxLength}
                value={values[key]}
                onChange={set}
                aria-invalid={!!errors[key]}
                aria-describedby={errors[key] ? `${key}-error` : undefined}
              />
              {errors[key] && (
                <p id={`${key}-error`} className="text-xs text-rose-700">
                  {errors[key]}
                </p>
              )}
            </Field>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Provide at least one email address or phone number. Fields marked *
          are required.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="form-quantity" label="Quantity *">
            <input
              id="form-quantity"
              name="quantity"
              type="number"
              min="1"
              max="2147483647"
              step="1"
              required
              className="input"
              value={values.quantity}
              onChange={set}
              aria-invalid={!!errors.quantity}
              aria-describedby={errors.quantity ? "quantity-error" : undefined}
            />
            {errors.quantity && (
              <p id="quantity-error" className="text-xs text-rose-700">
                {errors.quantity}
              </p>
            )}
          </Field>
          <Field id="form-reason" label="Return reason *">
            <select
              id="form-reason"
              name="reason"
              required
              className="input"
              value={values.reason}
              onChange={set}
              aria-invalid={!!errors.reason}
              aria-describedby={errors.reason ? "reason-error" : undefined}
            >
              <option value="">Choose a reason</option>
              {Object.entries(reasons).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
            {errors.reason && (
              <p id="reason-error" className="text-xs text-rose-700">
                {errors.reason}
              </p>
            )}
          </Field>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5">
          <button className="button primary" type="submit">
            {saving
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Create return request"}
          </button>
          {onCancel && (
            <button
              className="button secondary"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
