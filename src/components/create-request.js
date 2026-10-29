"use client";

import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "@/lib/browser-api";
import RequestForm from "./request-form";
import { BackLink, Notice, PageHeading } from "./ui";

export default function CreateRequest() {
  const [created, setCreated] = useState(null);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink />
      <PageHeading
        eyebrow="New return"
        title="Create a request"
        description="Capture the customer and item details. A unique reference will be generated when you save."
      />
      <section className="panel">
        {created ? (
          <div className="space-y-5">
            <Notice>
              Request {created.reference} was created successfully.
            </Notice>
            <h2 className="text-xl font-semibold">Ready for review</h2>
            <p className="text-sm text-slate-600">
              The request is Open. You can add notes or move it into review from
              its detail page.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="button primary" href={`/requests/${created.id}`}>
                View request
              </Link>
              <Link className="button secondary" href="/">
                Back to requests
              </Link>
            </div>
          </div>
        ) : (
          <RequestForm
            onSave={async (data) =>
              setCreated(await apiRequest("", { method: "POST", body: data }))
            }
          />
        )}
      </section>
    </div>
  );
}
