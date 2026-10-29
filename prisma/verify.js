// Database smoke checks; all inserted rows are rolled back. Sequences may advance.
require('dotenv/config');
const assert = require('node:assert/strict');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const insert = `INSERT INTO "ReturnRequest"
      ("customerName", email, "orderId", "itemId", "itemName", quantity, reason)
      VALUES ('Schema check', 'check@example.com', $1, 'item', 'Test item', 1, 'DAMAGED')
      RETURNING *`;
    const order = `verify-${require('node:crypto').randomUUID()}`;
    const first = (await client.query(insert, [order])).rows[0];
    assert.match(first.reference, /^RD-(?:\d{4}|[1-9]\d{4,})$/);
    const formats = await client.query('SELECT format_request_reference(value) AS reference FROM (VALUES (1::bigint), (160), (9999), (10000)) AS examples(value)');
    assert.deepEqual(formats.rows.map((row) => row.reference), ['RD-0001', 'RD-0160', 'RD-9999', 'RD-10000']);
    assert.equal(first.status, 'OPEN');

    async function rejects(sql, params, code) {
      await client.query('SAVEPOINT check_constraint');
      let error;
      try { await client.query(sql, params); } catch (caught) { error = caught; }
      await client.query('ROLLBACK TO SAVEPOINT check_constraint');
      assert.equal(error?.code, code, `Expected PostgreSQL ${code}`);
    }

    await rejects(insert, [order], '23505');
    for (const status of ['IN_REVIEW', 'APPROVED']) {
      await client.query(`UPDATE "ReturnRequest" SET status = $1::"RequestStatus", resolution = 'REPLACEMENT' WHERE id = $2`, [status, first.id]);
      await rejects(insert, [order], '23505');
    }
    await rejects('UPDATE "ReturnRequest" SET quantity = 0 WHERE id = $1', [first.id], '23514');
    await rejects('UPDATE "ReturnRequest" SET email = NULL WHERE id = $1', [first.id], '23514');
    await rejects('UPDATE "ReturnRequest" SET resolution = NULL WHERE id = $1', [first.id], '23514');
    await rejects(`UPDATE "ReturnRequest" SET resolution = 'REFUND' WHERE id = $1`, [first.id], '23514');
    await rejects('UPDATE "ReturnRequest" SET "refundAmount" = 10 WHERE id = $1', [first.id], '23514');
    await client.query(`UPDATE "ReturnRequest" SET resolution = 'REFUND', "refundAmount" = 10 WHERE id = $1`, [first.id]);

    await client.query(`UPDATE "ReturnRequest" SET status = 'COMPLETED' WHERE id = $1`, [first.id]);
    const second = (await client.query(insert, [order])).rows[0];
    assert.notEqual(first.reference, second.reference);
    await client.query(`UPDATE "ReturnRequest" SET status = 'REJECTED' WHERE id = $1`, [second.id]);
    const third = (await client.query(insert, [order])).rows[0];
    await client.query('UPDATE "ReturnRequest" SET "deletedAt" = now() WHERE id = $1', [third.id]);
    await client.query(insert, [order]);

    await client.query('INSERT INTO "Note" ("requestId", body) VALUES ($1, $2)', [first.id, 'Verification note']);
    await rejects('DELETE FROM "ReturnRequest" WHERE id = $1', [first.id], '23001');
    await rejects('INSERT INTO "Note" ("requestId", body) VALUES ($1, $2)', [first.id, ' '], '23514');
    console.log('PASS: connection, references, defaults, live uniqueness, terminal/deleted reuse, constraints and note relationship.');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
