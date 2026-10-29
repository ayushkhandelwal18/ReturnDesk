# ReturnDesk

Phases 1 and 2 implement the PostgreSQL schema and backend APIs. The frontend remains the Next.js starter. Search, seed data and deployment remain for later phases.

## Database setup

Run `npm ci` and set `DIRECT_URL` in `.env` to your Neon PostgreSQL connection string. Never commit credentials. The existing `prisma7.config.ts` remains unchanged.

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

Then run `npm run test:api`. Set `TEST_BASE_URL` to test a different local port. Use a development database with the migration applied. Tests exercise real HTTP handlers and PostgreSQL, including all 25 status pairs, resolution validation, duplicates, locked edits, deletion, final-state notes, errors and concurrent mutations. Fixtures are uniquely marked and removed after the run; reference sequence gaps remain. An interrupted run may leave marked fixtures. No seed data is created.

## Remaining work

Server-side search/filter/sort/pagination, UI, the 30-request seed script and deployment are not implemented. Record actual time spent and deployment details before submission.
