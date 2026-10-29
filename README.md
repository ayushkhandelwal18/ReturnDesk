# ReturnDesk

## Project Overview

ReturnDesk is a returns management workspace developed for an SDE Intern take-home assignment. Support agents can raise a return against an order, review the customer and item details, decide on a refund, replacement or store credit, and keep a permanent note history until the case is closed.

The application uses PostgreSQL for persistence. Its API enforces the return lifecycle and editing/removal rules independently of the interface.

### Live Application

**Not deployed yet — replace this placeholder with the public Vercel URL before submission.**

Repository: [ayushkhandelwal18/ReturnDesk](https://github.com/ayushkhandelwal18/ReturnDesk)

## Tech Stack

| Area | Technology |
| --- | --- |
| Application | Next.js 16.4.3 App Router, React 19.3, JavaScript |
| Backend | Node.js, Next.js Route Handlers |
| Database | PostgreSQL hosted on Neon |
| Data access | Prisma ORM 7.10.1 with `@prisma/adapter-pg` and `pg` |
| Styling | Tailwind CSS 4, shared application components |
| Validation | Zod |
| Tests | Node.js built-in test runner, HTTP integration tests |
| Production bundler | Webpack, bundled with Next.js |

All handwritten application code is JavaScript. Prisma generates its own TypeScript client; `prisma7.config.ts` is the existing CLI configuration. Node.js 24 LTS is used for local scripts and verification.

## Features

- Create return requests with a database-generated unique reference.
- Find requests by customer name, order ID or reference; combine status/reason filters, sorting and server-side pagination.
- Read complete customer, contact, order and item information, current status, resolution and refund amount.
- Edit undecided requests, move through the permitted lifecycle, and approve with a refund, replacement or store credit.
- Validate quantities, contact details, approval resolutions and positive refund amounts.
- Add notes at any point and view them chronologically; no edit/delete note API is exposed.
- Remove eligible requests from the desk through soft deletion, retaining the underlying record.
- Use a desktop table or mobile cards, readable status badges, accessible forms and explicit loading, success, empty and error states.
- Search after a 350 ms typing pause; superseded browser fetches are cancelled.

## Business Rules

All five rules are enforced by the server. Buttons reflect the current state but are not the enforcement boundary.

1. **Fixed lifecycle.** Only Open → In Review, In Review → Approved, In Review → Rejected, and Approved → Completed are allowed. Rejected and Completed are terminal. Skipping, reversing or repeating a transition is refused.
2. **Approval requires a resolution.** Approval must specify Refund, Replacement or Store Credit. Refund requires an amount greater than zero; other resolutions cannot record a refund amount. The amount supports at most two decimal places.
3. **One live request per order/item.** A live request is an undeleted request that is Open, In Review or Approved. Another request for the same order and item is refused while one is live, including concurrent creates or edits. Rejected and Completed requests allow a new request.
4. **Details lock after a decision.** Customer, contact, order, item, quantity and reason fields can be edited only while Open or In Review. Approved, Rejected and Completed requests are locked. Notes remain available in every status.
5. **Removal retains the record.** Only Open or Rejected requests may be removed. Removal sets `deletedAt`; deleted records disappear from listing and cannot be fetched or mutated through normal APIs.

Every mutation of an existing request takes a PostgreSQL row lock within a Prisma transaction before checking its current state. Competing edits, transitions, notes and removal therefore cannot bypass the rules by reading stale state. The partial unique index separately protects live order/item uniqueness.

## Database Design

The schema contains two models:

| Model | Main fields and relationships |
| --- | --- |
| `ReturnRequest` | Integer primary key, unique reference, customer name, email/phone, order ID, item ID/name, quantity, reason, status, optional resolution/refund amount, `createdAt`, `updatedAt`, nullable `deletedAt`. |
| `Note` | Integer primary key, request foreign key, body, creation timestamp. Each note belongs to one request; a request can have many notes. |

- PostgreSQL enums store the five reasons, five statuses and three resolutions. The API uses uppercase underscore values.
- Quantities are positive integers. External IDs and phone numbers are strings. Required text is nonblank; at least one email or phone is required.
- Refunds use exact `Decimal(12,2)` amounts. SQL checks enforce positive refunds, resolution/amount consistency and a resolution for Approved/Completed rows.
- References such as `RD-000000000001` come from a PostgreSQL noncycling sequence and have a unique index. Inserts generate them automatically, including concurrent inserts. Gaps are expected after rollbacks; values are never reused. The sequence is capped at twelve digits to prevent padding truncation.
- A partial unique index on `(orderId, itemId)` applies when `deletedAt IS NULL` and status is Open, In Review or Approved. Soft-deleted requests do not occupy the live slot.
- Status/creation-time and reason/creation-time indexes support filtering and ordering. Notes have a request/creation-time/ID index for stable chronological order.
- Timestamps use `timestamptz`. Prisma maintains `updatedAt` on request updates. Raw SQL updates must set it explicitly.
- The note foreign key restricts hard deletion of a request with notes. Notes are append-only through the API; there are no database triggers preventing administrative SQL edits.

The custom sequence, check constraints and partial index are defined in the committed SQL migration. Preserve them in future migrations; do not replace migrations with `prisma db push`.

## API Documentation

Endpoints are rooted at `/api/requests`. The `:id` parameter is a positive integer database ID, not the human-readable reference. Requests and responses use JSON.

| Method | Endpoint | Input / purpose | Success |
| --- | --- | --- | --- |
| POST | `/api/requests` | Customer/contact and order/item fields; creates an Open request. | 201, request object |
| GET | `/api/requests` | Search, filters, sorting and pagination parameters below. | 200, items and pagination metadata |
| GET | `/api/requests/:id` | Read one undeleted request with all chronological notes. | 200, request object with `notes` |
| PATCH | `/api/requests/:id` | Nonempty subset of editable creation fields. | 200, updated request |
| PATCH | `/api/requests/:id/status` | `status`; approval also takes `resolution` and, for Refund, `refundAmount`. | 200, updated request |
| POST | `/api/requests/:id/notes` | `{ "body": "Customer provided photographs." }`; body is 1–10,000 characters after trimming. | 201, note object |
| DELETE | `/api/requests/:id` | Soft-delete an eligible request. | 200, `{ "data": { "id": 1, "deleted": true } }` |

### Creating and editing a request

```json
{
  "customerName": "Alex Smith",
  "email": "alex@example.com",
  "phone": null,
  "orderId": "ORDER-100",
  "itemId": "ITEM-10",
  "itemName": "Cotton shirt",
  "quantity": 1,
  "reason": "SIZE_ISSUE"
}
```

`customerName`, `orderId`, `itemId`, `itemName`, `quantity` and `reason` are required on create. At least one email or phone is required. Email and phone may be omitted or null; non-null values must be valid/nonblank. Text is bounded to 200 characters for names, 100 for identifiers, 254 for email and 32 for phone. Quantity is an integer from 1 to 2,147,483,647.

Editable fields are the same fields shown above. A partial update is validated together with the stored contact information, so it cannot remove both contact methods. Client-supplied references, statuses on create, and unknown body fields are rejected.

| Enum | Values |
| --- | --- |
| Reason | `DAMAGED`, `WRONG_ITEM`, `SIZE_ISSUE`, `NOT_AS_DESCRIBED`, `CHANGED_MIND` |
| Status | `OPEN`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `COMPLETED` |
| Resolution | `REFUND`, `REPLACEMENT`, `STORE_CREDIT` |

### Status changes

Begin review with `{ "status": "IN_REVIEW" }`. Approval example:

```json
{
  "status": "APPROVED",
  "resolution": "REFUND",
  "refundAmount": "25.50"
}
```

Decimal strings are recommended. JSON numbers with at most two decimal places are also accepted. The maximum amount is `9999999999.99`. Non-refund approvals accept an omitted or null refund amount. Resolution/amount fields are accepted only when approving; completing the request preserves the approved resolution.

### Listing parameters

Example: `/api/requests?search=RD-DEMO&status=OPEN&reason=DAMAGED&sortBy=createdAt&sortOrder=desc&page=1&limit=20`.

| Parameter | Default | Values |
| --- | --- | --- |
| `search` | Empty | Case-insensitive literal substring of customer name, order ID or reference; maximum 200 characters. |
| `status` | No filter | A status enum value. |
| `reason` | No filter | A reason enum value. |
| `sortBy` | `createdAt` | `createdAt`, `updatedAt`, `customerName`, `orderId`, `reference`, `quantity`. |
| `sortOrder` | `desc` | `asc` or `desc`; use creation date for oldest/newest first. |
| `page` | `1` | Positive integer, maximum 1,000,000. |
| `limit` | `20` | Positive integer, maximum 100. |

Unknown, repeated or invalid query parameters return 422. Whitespace-only search means no search. All filtering, ordering, counting and offset/limit pagination run in PostgreSQL through Prisma. Each sort includes ID as a tie-breaker. Page/count queries share a repeatable-read snapshot.

```json
{
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  }
}
```

Listing omits notes; the single-request endpoint includes them ordered by creation timestamp, then ID. An out-of-range page returns an empty list without clamping the page number.

### Response and error conventions

Successful responses use `{ "data": ... }`. Request objects contain the fields described in Database Design, and refund amounts serialize as decimal strings. A note object contains `id`, `requestId`, `body` and `createdAt`.

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Cannot move from OPEN to COMPLETED."
  }
}
```

Validation errors may also include `details`, an array of `{ "path": ["quantity"], "message": "..." }` entries.

| HTTP status | Meaning / representative codes |
| --- | --- |
| 400 | Malformed JSON: `INVALID_JSON`. |
| 404 | Missing or soft-deleted request: `NOT_FOUND`. |
| 409 | `INVALID_TRANSITION`, `DETAILS_LOCKED`, `REMOVAL_NOT_ALLOWED`, `DUPLICATE_REQUEST`, or retryable `CONCURRENT_CHANGE`. |
| 422 | Invalid parameters/body: `VALIDATION_ERROR`; expected database value constraints: `INVALID_DATA`. |
| 500 | Unexpected server failure: `INTERNAL_ERROR`, with details logged only on the server. |

Failed operations never use a success status. The frontend displays the server's reason for refusing an action.

## Local Setup

### Prerequisites

- Node.js **24 LTS** and npm.
- Git and access to a PostgreSQL database. The verified setup uses Neon.
- A database role allowed to create tables, enums, sequences and indexes through migrations.

### Install and configure

```sh
git clone https://github.com/ayushkhandelwal18/ReturnDesk.git
cd ReturnDesk
npm ci
cp .env.example .env
```

On PowerShell, `Copy-Item .env.example .env` also works. In Neon, create a project/database and copy its pooled and direct PostgreSQL connection strings into `.env`. Both must point to the same database and branch. Retain the provider's SSL settings; the example uses certificate verification.

### Initialize the database

The CLI configuration has a custom filename, so keep `--config prisma7.config.ts` on Prisma commands:

```sh
npx prisma validate --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run db:seed
node prisma/verify.js
```

These commands work with an empty PostgreSQL database. Migrations create the schema; client generation creates `src/generated/prisma`, which is deliberately ignored by Git. No reset is required.

### Run locally

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). For the local production server:

```sh
npm run build
npm start
```

The build command is `next build --webpack`; the existing Tailwind loader also preprocesses CSS for Webpack. This avoids the observed Turbopack CSS-worker startup failure while preserving compiled styling. Development still uses Turbopack.

## Environment Variables

Copy the safe placeholders in [.env.example](.env.example). Never commit credentials or prefix database URLs with `NEXT_PUBLIC_`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Neon connection for application queries and the seed script. Runtime access falls back to `DIRECT_URL` if absent, but configure both for deployment. |
| `DIRECT_URL` | Direct PostgreSQL connection required by `prisma7.config.ts`, migrations, database checks and integration-test fixture setup. |
| `TEST_BASE_URL` | Optional HTTP target for integration tests; defaults to `http://127.0.0.1:3100`. |

Standalone Prisma, seed and test scripts load `.env` with dotenv; Next.js loads environment variables for its own runtime. Environment files, build output, dependencies and generated Prisma output are ignored. `.env.example` is intentionally included in the repository.

## Seed Data

```sh
npm run db:seed
```

The transactional script creates **35 requests**: seven in each status and seven for each return reason. It uses seven customers/items, all three resolution types, valid positive refund amounts, different orders and notes on some records.

Demo order IDs are reserved as `RD-DEMO-001` through `RD-DEMO-035`. Re-running skips existing matching orders, including edited or soft-deleted demos, and inserts only missing orders. It does not reset the database, delete existing data or overwrite records. Run the seed sequentially and do not use that prefix for real orders. Seeding is an explicit command, not part of normal application startup.

## Testing

Use a development/test database, with both connection URLs pointing to it. Tests exercise real HTTP handlers and PostgreSQL rather than mocking the business rules.

In one terminal, start a server on the default test port:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
```

Alternatively, use `npm run dev -- --hostname 127.0.0.1 --port 3100`. In a second terminal:

```sh
npm run test:api
npm run lint
npx prisma validate --config prisma7.config.ts
node prisma/verify.js
```

The 15 integration tests cover all 25 status pairs, approval/refund validation, duplicate create/edit conflicts, concurrent decisions/removal, locked details, notes in final states, soft-deletion visibility, malformed/invalid input and response shapes. Listing tests cover customer/order/reference search, status/reason filters, supported sorts, stable pages and combined parameters. Seed tests verify all statuses/reasons/resolutions and preservation on rerun.

Test records use unique prefixes and are cleaned up afterward; the database verification script rolls back its records. PostgreSQL sequences still advance, so gaps in references are expected. An interrupted integration-test run may leave its marked fixtures.

### Latest Verification

Verified locally after cleanup:

| Check | Result |
| --- | --- |
| `npm ci` | Passed; lockfile unchanged; zero reported vulnerabilities. |
| `npm run build` | Passed using Webpack; compiled Tailwind styles verified. |
| `npm run test:api` | 15 passed, 0 failed, against the production server. |
| `npm run lint` | Passed with 0 errors and 0 warnings; generated client files are excluded. |
| Prisma validation and migration status | Schema valid; database up to date; migration files already tracked in Git. |
| `node prisma/verify.js` | Passed database connection and constraint checks. |
| `npm run db:seed` | Safe rerun: 0 inserted, 35 existing demo orders skipped. |
| Repository checks | Credentials/build/generated outputs ignored; no configured credentials found in surviving tracked files. |

Production dashboard, create/detail pages and listing API passed HTTP smoke checks. Manual browser verification covered the 375 px layout, form validation, create/edit, approval with a refund, completion, notes after completion and removal confirmation. GitHub's unauthenticated API confirmed public repository visibility. Vercel deployment has not been executed.

## Technical Design Decisions

- **Next.js Route Handlers:** UI and API share one application and deployment; a separate Express service is unnecessary for this scope.
- **PostgreSQL with Prisma:** relational records, exact decimal amounts, foreign keys and migrations fit the data, while Prisma keeps queries readable.
- **Database constraints:** a partial unique index handles duplicate races, and SQL checks protect core value integrity. Lifecycle/edit/removal rules remain explicit server logic.
- **Server-side listing:** Prisma sends search, filters, sorting and pagination to PostgreSQL; the browser only renders the returned page.
- **Soft deletion:** removing a request hides it from the desk without destroying the record.
- **Small modules:** route handlers parse inputs, shared schemas validate them, request functions apply business rules, and UI components consume the existing JSON API.

## Assumptions

- The store uses one currency; the interface labels amounts as store currency rather than inventing a currency code.
- At least one email or phone is required. Phone formatting is not restricted to one country.
- Order/item identifiers are case-sensitive. Their validity is not checked against an external order catalog because no such integration is specified.
- Removed requests are no longer live, so a fresh request may use their order/item pair.
- Dates are shown in IST. Notes with equal timestamps are ordered by ID.
- Numbered pages may reflect intervening changes between separate HTTP requests; stable ordering does not freeze the entire dataset across navigation.

## Known Limitations

- A public deployment and its URL are not yet verified. The live link and actual development hours still need filling in before submission.
- There is no authentication or agent-account system; this is a support-desk demo within the assignment's scope.
- Backend rules have automated integration coverage; browser usability was checked manually, including 375 px layout, rather than through a committed browser-test suite.

## Deployment

### Vercel and Neon

1. Import the repository into Vercel using the **Next.js** framework preset and repository root. Select **Node.js 24.x** in project settings, as supported by [Vercel's Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
2. Add `DATABASE_URL` and `DIRECT_URL` in [Vercel environment settings](https://vercel.com/docs/environment-variables) for the intended environment. Use a pooled runtime URL and a direct CLI URL for the same Neon database. Preview environments should use a separate database/branch if production data must remain isolated.
3. Use `npm ci` as the install command. Set the [Build Command](https://vercel.com/docs/builds/configure-a-build) to:

   ```sh
   npx prisma generate --config prisma7.config.ts && npm run build
   ```

   Prisma Client is ignored by Git and must be regenerated during builds, including cached deployments; see the [Prisma 7 Next.js deployment guidance](https://www.prisma.io/docs/orm/v7/more/troubleshooting/nextjs). `npm run build` retains the verified Webpack production configuration. Keep Vercel's default Next.js output settings.
4. Before triggering the deployment, apply migrations to the intended deployment database from a trusted terminal or deployment pipeline:

   ```sh
   npx prisma migrate deploy --config prisma7.config.ts
   ```

   Ensure that terminal/pipeline uses the deployment database's `DIRECT_URL`, not an unrelated local database. `migrate deploy` applies pending migrations and does not generate Prisma Client or seed data. Never use a database reset for deployment.
5. Run `npm run db:seed` once with both database URLs set to the intended demo database, then verify the deployed dashboard and API. Do not expose test-runner settings or credentials in client code.
6. Replace the Live Application placeholder above and add the deployed URL to the GitHub repository description. Confirm the repository is public before submitting both links.

These deployment steps are documented but have not been executed by this repository cleanup.

## Development Time

**Approximate actual hours spent: [fill in manually before submission].**
