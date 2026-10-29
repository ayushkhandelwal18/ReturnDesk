import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

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
  } finally { await db.end(); }
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
  assert.match(row.reference, /^RD-\d{12}$/);
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
