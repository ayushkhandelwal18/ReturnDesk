# ReturnDesk

Phases 1–4 implement the PostgreSQL schema, backend APIs, database-backed listing, demo seed data and support-agent frontend. Deployment remains a later phase.

## Database setup

Use Node.js 24 LTS (`node --version`), run `npm ci` and set `DIRECT_URL` in `.env` to your Neon PostgreSQL connection string. Node's native TypeScript stripping loads the generated Prisma Client; all handwritten application and seed code is JavaScript. Never commit credentials. The existing `prisma7.config.ts` remains unchanged.

```sh
npx prisma validate --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
node prisma/verify.js
npm run dev
```

Verification rolls back its test rows. Sequences still advance, so gaps in references are expected.

## Schema decisions

- Two tables: `ReturnRequest` and `Note`. No separate customer, order, item or agent tables are needed for this scope.
- Requests include customer name, email/phone, order ID, item ID/name, quantity, reason, status, resolution, refund amount, unique reference, timestamps and nullable `deletedAt`. At least one nonblank email or phone is required. External identifiers and phone numbers are strings and case-sensitive.
- Reasons: Damaged, Wrong Item, Size Issue, Not As Described, Changed Mind. Statuses: Open, In Review, Approved, Rejected, Completed. Resolutions: Refund, Replacement, Store Credit. Enum values use uppercase underscores.
- Refunds use exact `Decimal(12,2)` amounts. A single store currency is assumed because the brief specifies none. Quantity must be positive and required text nonblank. Approved/completed requests require a resolution. Refunds require a positive amount; other resolutions require no refund amount.
- PostgreSQL generates references such as `RD-000000000001` with a noncycling sequence. A twelve-digit maximum prevents padding truncation. Unique references are safe under concurrent inserts, never reused, and may contain gaps.
- A partial unique index on `(orderId, itemId)` covers rows with no deletion timestamp and status Open, In Review or Approved. Completed, Rejected and soft-deleted rows allow a fresh request. Soft-deleted requests are considered off the desk.
- Notes have a foreign key, nonblank body and creation timestamp. The request/time/ID index supports stable chronological order. Request deletion is restricted when notes exist. Future server code must enforce append-only notes.
- Status/time and reason/time indexes support later filtering. Timestamps use PostgreSQL `timestamptz`. Prisma maintains `updatedAt`; raw SQL updates must set it explicitly.
- The custom partial index, checks and reference sequence live in migration SQL. Preserve them in future migrations; do not replace migrations with `db push`.

## Backend API (Phase 2)

All paths start with `/api/requests`. IDs in URLs are numeric database IDs. Responses use `{ "data": ... }` on success and `{ "error": { "code": "...", "message": "...", "details": [...] } }` on failure (`details` is optional). Refund amounts are returned as decimal strings.

| Method | Path | Input / behavior |
| --- | --- | --- |
| POST | `/api/requests` | Customer/item details; creates an Open request with generated reference (201). |
| GET | `/api/requests` | Search, filter, sort and page requests; returns items and pagination metadata (200). |
| GET | `/api/requests/:id` | Request with all notes ordered by creation time then ID (200). |
| PATCH | `/api/requests/:id` | Nonempty subset of customerName, email, phone, orderId, itemId, itemName, quantity, reason (200). |
| PATCH | `/api/requests/:id/status` | `status`, plus `resolution` and optional `refundAmount` only for approval (200). |
| POST | `/api/requests/:id/notes` | `{ "body": "Note text" }` (201). |
| DELETE | `/api/requests/:id` | Soft deletes Open or Rejected requests (200, `{ "data": { "id": 1, "deleted": true } }`). |

Create example:

```json
{
  "customerName": "Alex Smith",
  "email": "alex@example.com",
  "orderId": "ORDER-100",
  "itemId": "ITEM-10",
  "itemName": "Cotton shirt",
  "quantity": 1,
  "reason": "SIZE_ISSUE"
}
```

Approval example: `{ "status": "APPROVED", "resolution": "REFUND", "refundAmount": "25.50" }`. Decimal strings are recommended; numbers with at most two decimal places are also accepted. Non-refund resolutions accept an omitted or null refund amount. Notes are limited to 10,000 characters. Unknown input fields are rejected, including client-supplied references and status on create.

Malformed JSON returns 400; missing/deleted records return 404; illegal transitions, locked edits, forbidden removal and duplicate live items return 409; invalid field values return 422. Unexpected errors return a generic 500 and are logged on the server.

Every mutation of an existing request acquires a PostgreSQL row lock inside a Prisma transaction before checking state. This serializes competing transitions, detail edits, notes and deletion. Live order/item uniqueness is enforced by the existing database index on both create and edit. Notes have only an add endpoint. Deleted records are excluded from reads and all mutations. Prisma Client is reused during development; database connection configuration is unchanged (`DATABASE_URL`, falling back to `DIRECT_URL`).

### API tests

Start the local test server in one terminal:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Then run `npm run test:api`. Set `TEST_BASE_URL` to test a different local port. Use a development database with the migration applied. Tests exercise real HTTP handlers and PostgreSQL, including all 25 status pairs, resolution validation, duplicates, locked edits, deletion, final-state notes, errors, concurrent mutations, listing combinations and seed coverage/idempotency. Fixtures, including isolated seed records, are uniquely marked and removed after the run; reference sequence gaps remain. An interrupted run may leave marked fixtures.

Phase 3 verification: all 15 tests passed (0 failed), and the original `prisma/verify.js` database checks passed. `npm run lint` passed with 10 unused-disable warnings in generated Prisma files. The demo seed inserted 35 records; a second run inserted 0 and skipped 35.

## Listing (Phase 3)

Example: `/api/requests?search=RD-DEMO&status=OPEN&reason=DAMAGED&sortBy=createdAt&sortOrder=desc&page=1&limit=20`.

| Parameter | Default | Supported values |
| --- | --- | --- |
| search | empty | Case-insensitive literal substring of customer name, order ID or reference; max 200 characters. |
| status | none | One of the five status enum values. |
| reason | none | One of the five reason enum values. |
| sortBy | createdAt | createdAt, updatedAt, customerName, orderId, reference, quantity. |
| sortOrder | desc | asc (including oldest first), desc (including newest first). |
| page | 1 | Positive integer, maximum 1,000,000. |
| limit | 20 | Positive integer, maximum 100. |

Unknown, repeated and invalid parameters return the usual 422 validation error. Whitespace-only search means no search. Soft-deleted rows are excluded. The response is `{ "data": { "items": [], "total": 0, "page": 1, "limit": 20, "totalPages": 0 } }`. Out-of-range pages return an empty items array without clamping the page number.

Prisma sends search (`ILIKE`), filters, ordering, offset/limit and count to PostgreSQL. Every sort adds ID in the same direction as a tie-breaker. A repeatable-read transaction gives the page and count the same database snapshot. Separate page requests can still reflect intervening inserts or deletes; no historical snapshot is promised. Listing omits notes; the single-request endpoint returns them.

## Demo seed

After applying migrations and generating Prisma Client, run `npm run db:seed`. It inserts 35 requests across all five statuses, all five reasons and all three resolution types, with realistic customers/items and notes on some records. Refunds have positive exact amounts.

The seed is transactional and uses reserved order IDs `RD-DEMO-001` through `RD-DEMO-035`. Existing matching orders are skipped, including edited or soft-deleted records; nothing is reset, overwritten or deleted. Run it sequentially. Do not use this reserved prefix for real orders. Re-running preserves existing records and adds only missing demo orders. The seed can be used on a clean migrated database without any other data.

## Production build

Run `npm run build`. The layout now uses system sans/monospace stacks, avoiding build-time Google Fonts downloads. Tailwind and its existing Turbopack loader are retained; no styling pipeline or dependency has been removed. The existing stylesheet and utilities compile successfully with Tailwind's compiler directly. In this Windows execution environment, Turbopack's generated CSS-loader worker exits with code 0 before its local connection is established. This reproduces with elevated execution too; the production build remains blocked by that worker failure. API routes run successfully in development. No successful production build is claimed.

## Frontend (Phase 4)

- `/` displays a desktop table and mobile request cards. Search waits 350 ms after typing. Status/reason filters, sort options, page size and pagination use the listing API; no local filtering is performed. Superseded fetches are cancelled. Empty, loading and retryable error states are explicit.
- `/requests/new` creates a request using the existing create schema, with required fields, at least one contact method, inline validation, submission loading, server errors and generated-reference success feedback.
- `/requests/:id` shows all customer/item data, status, resolution, refund amount and chronological notes. The shared detail form is available only before a decision. Lifecycle actions follow the permitted transitions, with resolution/positive-amount validation for approval. Notes remain available in final states. Removal is offered only for Open/Rejected requests and requires an explicit confirmation in the UI.
- Shared buttons, fields, notices and status badges provide consistent styling, visible keyboard focus and accessible labels. Layouts adapt to 375 px width. Dates are displayed in IST; amounts use the store currency because the brief does not specify one.
- Listing now uses an interactive repeatable-read transaction with a 10-second connection wait, matching other API mutations. This fixes the connection-wait failures observed when opening the dashboard during concurrent Neon activity; query behavior and business rules are unchanged.

Phase 4 verification: all 15 API regression tests passed. Frontend source lint passed; full `npm run lint` passed with the same 10 warnings in generated Prisma files. Tailwind compiled the new shared styles successfully. The frontend runs in development; `npm run build` still encounters the CSS-worker failure described above.

Browser verification covered the dashboard at 375 px, required-field validation, create success/reference generation, editing quantity, Open → In Review → Approved (Refund) → Completed, notes on the completed request, and confirmation/success for removal of a second Open request. The two disposable browser-test records and their notes were cleaned up afterward. Backend responses supplied the displayed data throughout.

## Remaining work

Deployment remains. Resolve/verify the production build on the deployment environment before shipping. Record actual time spent and deployment details before submission.
