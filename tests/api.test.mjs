import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { seedRequests } from '../prisma/seed.mjs';
import { prisma } from '../src/lib/prisma.js';

// Run against a local Next.js server and the configured migrated database.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';
const prefix = `api-test-${randomUUID()}-`;
const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
let counter = 0;
const details = () => ({ customerName: 'Test Customer', email: 'test@example.com', orderId: `${prefix}${counter++}`, itemId: 'item', itemName: 'Item', quantity: 1, reason: 'DAMAGED' });

before(async () => { await db.connect(); });
after(async () => {
  // Only remove fixtures from this run, including notes and soft-deleted rows.
  try {
    await db.query('DELETE FROM "Note" WHERE "requestId" IN (SELECT id FROM "ReturnRequest" WHERE "orderId" LIKE $1)', [`${prefix}%`]);
    await db.query('DELETE FROM "ReturnRequest" WHERE "orderId" LIKE $1', [`${prefix}%`]);
  } finally { await db.end(); await prisma.$disconnect(); }
});

async function api(path = '', method = 'GET', body) {
  const response = await fetch(`${base}/api/requests${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.match(response.headers.get('content-type'), /application\/json/);
  const json = await response.json();
  if (response.ok) assert.deepEqual(Object.keys(json), ['data']);
  else {
    assert.deepEqual(Object.keys(json), ['error']);
    assert.equal(typeof json.error.code, 'string');
    assert.equal(typeof json.error.message, 'string');
    assert.ok(json.error.message.length);
  }
  return { status: response.status, ...json };
}

async function create() {
  const response = await api('', 'POST', details());
  assert.equal(response.status, 201);
  return response.data;
}

async function fixture(status) {
  const data = details();
  const result = await db.query(`INSERT INTO "ReturnRequest"
    ("customerName", email, "orderId", "itemId", "itemName", quantity, reason, status, resolution)
    VALUES ($1, $2, $3, $4, $5, 1, 'DAMAGED', $6::"RequestStatus", $7::"ResolutionType") RETURNING *`,
  [data.customerName, data.email, data.orderId, data.itemId, data.itemName, status, ['APPROVED', 'COMPLETED'].includes(status) ? 'REPLACEMENT' : null]);
  return result.rows[0];
}

test('creation generates a reference; notes are ordered; all fields are returned', async () => {
  const row = await create();
  assert.match(row.reference, /^RD-(?:\d{4}|[1-9]\d{4,})$/);
  assert.equal(row.status, 'OPEN');
  for (const body of ['First note', 'Second note']) {
    assert.equal((await api(`/${row.id}/notes`, 'POST', { body })).status, 201);
  }
  const response = await api(`/${row.id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.notes.map((note) => note.body), ['First note', 'Second note']);
});

test('all 25 status pairs allow exactly the four specified transitions', async () => {
  const statuses = ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'];
  const allowed = ['OPEN:IN_REVIEW', 'IN_REVIEW:APPROVED', 'IN_REVIEW:REJECTED', 'APPROVED:COMPLETED'];
  for (const from of statuses) {
    for (const to of statuses) {
      const row = await fixture(from);
      const response = await api(`/${row.id}/status`, 'PATCH', { status: to, ...(to === 'APPROVED' ? { resolution: 'REPLACEMENT' } : {}) });
      assert.equal(response.status, allowed.includes(`${from}:${to}`) ? 200 : 409, `${from} -> ${to}: ${JSON.stringify(response)}`);
    }
  }
});

test('approval validates every resolution and exact positive refund amounts', async () => {
  const row = await fixture('IN_REVIEW');
  const invalid = [
    {}, { resolution: 'OTHER' }, { resolution: 'REFUND' },
    ...[0, -1, '0.00', '1.001', '10000000000', 'NaN'].map((refundAmount) => ({ resolution: 'REFUND', refundAmount })),
    { resolution: 'REPLACEMENT', refundAmount: '1.00' },
    { resolution: 'STORE_CREDIT', refundAmount: '1.00' },
  ];
  for (const input of invalid) {
    assert.equal((await api(`/${row.id}/status`, 'PATCH', { status: 'APPROVED', ...input })).status, 422);
  }
  for (const resolution of ['REFUND', 'REPLACEMENT', 'STORE_CREDIT']) {
    const candidate = await fixture('IN_REVIEW');
    const response = await api(`/${candidate.id}/status`, 'PATCH', { status: 'APPROVED', resolution, ...(resolution === 'REFUND' ? { refundAmount: '12.34' } : {}) });
    assert.equal(response.status, 200);
    assert.equal(response.data.refundAmount, resolution === 'REFUND' ? '12.34' : null);
    const completed = await api(`/${candidate.id}/status`, 'PATCH', { status: 'COMPLETED' });
    assert.equal(completed.status, 200);
    assert.equal(completed.data.resolution, resolution);
  }
  assert.equal((await api(`/${row.id}/status`, 'PATCH', { status: 'REJECTED', resolution: 'REFUND' })).status, 422);
});

test('duplicate create and order/item edits report a meaningful conflict', async () => {
  const input = details();
  const responses = await Promise.all([api('', 'POST', input), api('', 'POST', input)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(responses.find((r) => r.status === 409).error.code, 'DUPLICATE_REQUEST');
  const row = await create();
  assert.equal((await api(`/${row.id}`, 'PATCH', { orderId: input.orderId })).status, 409);
  for (const status of ['REJECTED', 'COMPLETED']) {
    const old = await fixture(status);
    assert.equal((await api('', 'POST', { ...details(), orderId: old.orderId })).status, 201);
  }
});

test('details can change before decisions, and all decided states lock details but allow notes', async () => {
  for (const status of ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED']) {
    const row = await fixture(status);
    const response = await api(`/${row.id}`, 'PATCH', { customerName: 'Changed', itemName: 'Changed item', quantity: 2 });
    assert.equal(response.status, ['OPEN', 'IN_REVIEW'].includes(status) ? 200 : 409);
    assert.equal((await api(`/${row.id}/notes`, 'POST', { body: 'Allowed at every stage' })).status, 201);
  }
});

test('soft deletion is restricted, retains data, hides every normal operation and allows item reuse', async () => {
  for (const status of ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED']) {
    const row = await fixture(status);
    const removable = ['OPEN', 'REJECTED'].includes(status);
    assert.equal((await api(`/${row.id}`, 'DELETE')).status, removable ? 200 : 409);
    if (!removable) continue;
    assert.ok((await db.query('SELECT "deletedAt" FROM "ReturnRequest" WHERE id = $1', [row.id])).rows[0].deletedAt);
    for (const [path, method, body] of [
      [`/${row.id}`, 'GET'], [`/${row.id}`, 'DELETE'], [`/${row.id}`, 'PATCH', { quantity: 2 }],
      [`/${row.id}/status`, 'PATCH', { status: 'IN_REVIEW' }], [`/${row.id}/notes`, 'POST', { body: 'Hidden' }],
    ]) assert.equal((await api(path, method, body)).status, 404);
    assert.equal((await api('', 'POST', { ...details(), orderId: row.orderId })).status, 201);
  }
});

test('concurrent status transitions and deletion cannot both succeed', async () => {
  const row = await create();
  const results = await Promise.all([
    api(`/${row.id}/status`, 'PATCH', { status: 'IN_REVIEW' }),
    api(`/${row.id}`, 'DELETE'),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.some((r) => [404, 409].includes(r.status)));
  const review = await fixture('IN_REVIEW');
  const decisions = await Promise.all([
    api(`/${review.id}/status`, 'PATCH', { status: 'APPROVED', resolution: 'STORE_CREDIT' }),
    api(`/${review.id}/status`, 'PATCH', { status: 'REJECTED' }),
  ]);
  assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
});

test('invalid input, malformed JSON and missing records use consistent errors', async () => {
  for (const body of [{}, { ...details(), quantity: 0 }, { ...details(), email: null }, { ...details(), reference: 'manual' }]) {
    assert.equal((await api('', 'POST', body)).status, 422);
  }
  const row = await create();
  assert.equal((await api(`/${row.id}`, 'PATCH', { email: null })).status, 422);
  assert.equal((await api(`/${row.id}`, 'PATCH', {})).status, 422);
  assert.equal((await api(`/${row.id}/notes`, 'POST', { body: ' ' })).status, 422);
  assert.equal((await api('/bad-id')).status, 422);
  assert.equal((await api('/2147483647')).status, 404);
  const response = await fetch(`${base}/api/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_JSON');
});

const listingSearch = `${prefix}listing`;
let listingRows;
async function listingFixtures() {
  if (listingRows) return listingRows;
  listingRows = [];
  const states = ['OPEN', 'REJECTED', 'OPEN', 'IN_REVIEW', 'OPEN', 'COMPLETED', 'OPEN', 'OPEN'];
  for (let i = 0; i < states.length; i++) {
    const row = await fixture(states[i]);
    const date = new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 2)));
    const updated = await db.query(`UPDATE "ReturnRequest" SET "customerName" = $1, "orderId" = $2,
      reason = $3::"ReturnReason", quantity = $4, "createdAt" = $5, "updatedAt" = $5, "deletedAt" = $6
      WHERE id = $7 RETURNING *`,
    [`${listingSearch} Customer ${i}`, `${listingSearch}-order-${i}`, i % 2 ? 'WRONG_ITEM' : 'DAMAGED', 8 - i, date, i === 7 ? date : null, row.id]);
    listingRows.push(updated.rows[0]);
  }
  return listingRows;
}

async function list(query = {}) {
  const result = await api(`?${new URLSearchParams({ search: listingSearch, ...query })}`);
  assert.equal(result.status, 200, JSON.stringify(result));
  return result.data;
}

test('listing searches customer, order and generated reference case-insensitively', async () => {
  const rows = await listingFixtures();
  for (const search of [rows[0].customerName.toUpperCase(), rows[0].orderId.toUpperCase(), rows[0].reference.toLowerCase()]) {
    const result = await list({ search });
    assert.deepEqual(result.items.map((row) => row.id), [rows[0].id]);
    assert.equal(result.total, 1);
  }
  const literal = await list({ search: '%' });
  assert.equal(literal.total, 0);
});

test('listing filters by status, reason and both, excluding soft-deleted rows', async () => {
  const rows = (await listingFixtures()).filter((row) => !row.deletedAt);
  for (const filter of [{ status: 'OPEN' }, { reason: 'WRONG_ITEM' }, { status: 'OPEN', reason: 'DAMAGED' }]) {
    const result = await list(filter);
    const expected = rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));
    assert.equal(result.total, expected.length);
    assert.deepEqual(result.items.map((row) => row.id).sort(), expected.map((row) => row.id).sort());
  }
  const hidden = await list({ search: listingRows[7].reference });
  assert.equal(hidden.total, 0);
});

test('listing sorts every supported field both ways with stable ID tie-breaking', async () => {
  const rows = (await listingFixtures()).filter((row) => !row.deletedAt);
  for (const sortBy of ['createdAt', 'updatedAt', 'customerName', 'orderId', 'reference', 'quantity']) {
    for (const sortOrder of ['asc', 'desc']) {
      const expected = [...rows].sort((a, b) => {
        const comparison = a[sortBy] < b[sortBy] ? -1 : a[sortBy] > b[sortBy] ? 1 : a.id - b.id;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
      assert.deepEqual((await list({ sortBy, sortOrder })).items.map((row) => row.id), expected.map((row) => row.id));
    }
  }
});

test('listing pagination reports totals, stable pages and empty out-of-range results', async () => {
  await listingFixtures();
  const all = await list();
  assert.equal(all.total, 7);
  assert.equal(all.page, 1);
  assert.equal(all.limit, 20);
  const ids = [];
  for (let page = 1; page <= 4; page++) {
    const result = await list({ page, limit: 2 });
    assert.equal(result.total, 7);
    assert.equal(result.page, page);
    assert.equal(result.totalPages, 4);
    ids.push(...result.items.map((row) => row.id));
  }
  assert.deepEqual(ids, all.items.map((row) => row.id));
  assert.deepEqual((await list({ page: 5, limit: 2 })).items, []);
  const empty = await list({ search: `${prefix}nonexistent` });
  assert.equal(empty.totalPages, 0);
  assert.equal(empty.total, 0);
});

test('combined search + status + reason + sorting + pagination is applied in SQL', async () => {
  const rows = await listingFixtures();
  const result = await list({ status: 'OPEN', reason: 'DAMAGED', sortBy: 'quantity', sortOrder: 'asc', page: 2, limit: 2 });
  assert.deepEqual(result.items.map((row) => row.id), [rows[2].id, rows[0].id]);
  assert.equal(result.total, 4);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
});

test('invalid listing parameters return consistent validation errors', async () => {
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1000001', 'limit=0', 'limit=101', 'limit=', 'status=BAD', 'reason=BAD', 'sortBy=deletedAt', 'sortOrder=random', 'extra=1', 'page=1&page=2', `search=${'x'.repeat(201)}`]) {
    const result = await api(`?${query}`);
    assert.equal(result.status, 422, query);
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  }
});

test('seed inserts 35 valid requests with complete coverage and preserves existing data on rerun', async () => {
  const namespace = `${prefix}seed`;
  assert.deepEqual(await seedRequests(namespace), { inserted: 35, skipped: 0 });
  const rows = (await db.query('SELECT * FROM "ReturnRequest" WHERE "orderId" LIKE $1', [`${namespace}%`])).rows;
  assert.equal(rows.length, 35);
  assert.equal(new Set(rows.map((row) => row.status)).size, 5);
  assert.equal(new Set(rows.map((row) => row.reason)).size, 5);
  assert.equal(new Set(rows.map((row) => row.resolution).filter(Boolean)).size, 3);
  assert.equal(new Set(rows.map((row) => row.reference)).size, 35);
  assert.deepEqual(rows.map((row) => row.orderId).sort(), Array.from({ length: 35 }, (_, i) => `${namespace}-${String(i + 1).padStart(4, '0')}`));
  for (const row of rows) {
    const index = Number(row.orderId.slice(-4)) - 1;
    assert.equal(row.itemId, `SKU-${100 + index % 7}`);
    assert.match(row.reference, /^RD-(?:\d{4}|[1-9]\d{4,})$/);
  }
  assert.ok(new Set(rows.map((row) => row.customerName)).size > 1);
  assert.ok(new Set(rows.map((row) => row.itemId)).size > 1);
  for (const row of rows) {
    assert.ok(row.quantity > 0);
    if (row.resolution === 'REFUND') assert.ok(Number(row.refundAmount) > 0);
    else assert.equal(row.refundAmount, null);
    if (['APPROVED', 'COMPLETED'].includes(row.status)) assert.ok(row.resolution);
  }
  const notes = (await db.query('SELECT count(*)::int AS total FROM "Note" WHERE "requestId" = ANY($1::int[])', [rows.map((row) => row.id)])).rows[0].total;
  assert.ok(notes > 0);
  await db.query('UPDATE "ReturnRequest" SET "customerName" = $1 WHERE id = $2', ['Preserved edit', rows[0].id]);
  assert.deepEqual(await seedRequests(namespace), { inserted: 0, skipped: 35 });
  assert.equal((await db.query('SELECT "customerName" FROM "ReturnRequest" WHERE id = $1', [rows[0].id])).rows[0].customerName, 'Preserved edit');
});
