import Link from "next/link";
import { StatusBadge, dateLabel, reasons } from "./ui";

export default function RequestList({ items }) {
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {[
                "Reference",
                "Customer / order",
                "Item",
                "Reason",
                "Status",
                "Created",
                "",
              ].map((label, i) => (
                <th key={i} scope="col" className="px-5 py-3 font-medium">
                  {label || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-5 font-mono text-xs font-semibold text-teal-800">
                  <Link
                    href={`/requests/${row.id}`}
                    className="hover:underline"
                  >
                    {row.reference}
                  </Link>
                </td>
                <td className="max-w-52 break-words px-5 py-5">
                  <p className="font-medium text-slate-900">
                    {row.customerName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{row.orderId}</p>
                </td>
                <td className="max-w-44 break-words px-5 py-5 text-slate-700">
                  {row.itemName}
                  <span className="mt-1 block text-xs text-slate-500">
                    Qty {row.quantity}
                  </span>
                </td>
                <td className="px-5 py-5 text-slate-600">
                  {reasons[row.reason]}
                </td>
                <td className="px-5 py-5">
                  <StatusBadge status={row.status} />
                </td>
                <td className="whitespace-nowrap px-5 py-5 text-xs text-slate-500">
                  {dateLabel(row.createdAt)}
                </td>
                <td className="px-5 py-5">
                  <Link
                    className="font-semibold text-teal-800 hover:underline"
                    href={`/requests/${row.id}`}
                    aria-label={`View ${row.reference}`}
                  >
                    View <span aria-hidden="true">↗</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-200 lg:hidden">
        {items.map((row) => (
          <article key={row.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/requests/${row.id}`}
                className="font-mono text-xs font-semibold text-teal-800 hover:underline"
              >
                {row.reference}
              </Link>
              <StatusBadge status={row.status} />
            </div>
            <div className="break-words">
              <h3 className="font-semibold text-slate-900">
                {row.customerName}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{row.orderId}</p>
              <p className="mt-2 text-sm text-slate-700">
                {row.itemName} · Qty {row.quantity}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{reasons[row.reason]}</span>
              <span>{dateLabel(row.createdAt)}</span>
            </div>
            <Link
              href={`/requests/${row.id}`}
              className="inline-flex min-h-10 items-center text-sm font-semibold text-teal-800"
              aria-label={`View ${row.reference}`}
            >
              View request{" "}
              <span className="ml-2" aria-hidden="true">
                →
              </span>
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
