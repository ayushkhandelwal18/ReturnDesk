BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Prevent writes between preflight checks and conversion; ordinary reads continue.
LOCK TABLE "ReturnRequest", "Note" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE identifier_request_before ON COMMIT DROP AS
SELECT id, to_jsonb(r) AS original FROM "ReturnRequest" r;
CREATE TEMP TABLE identifier_note_before ON COMMIT DROP AS
SELECT * FROM "Note";

-- Identify only the original 35 seed slots, never arbitrary similarly prefixed orders.
CREATE TEMP TABLE demo_order_mapping ON COMMIT DROP AS
SELECT n,
       'RD-DEMO-' || lpad(n::text, 3, '0') AS old_order,
       'ORD-' || lpad(n::text, 4, '0') AS new_order,
       'SKU-' || (100 + (n - 1) % 7)::text AS expected_item,
       '+1-202-555-' || lpad((99 + n)::text, 4, '0') AS expected_phone
FROM generate_series(1, 35) AS n;

DO $$
DECLARE demo_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM "ReturnRequest" WHERE reference !~ '^RD-[0-9]{12}$') THEN
    RAISE EXCEPTION 'Identifier migration stopped: unexpected existing reference format';
  END IF;
  IF EXISTS (SELECT 1 FROM "ReturnRequest" GROUP BY substring(reference FROM 4)::bigint HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Identifier migration stopped: converted references would not be unique';
  END IF;
  IF (SELECT last_value FROM request_reference_seq) <
     COALESCE((SELECT max(substring(reference FROM 4)::bigint) FROM "ReturnRequest"), 0) THEN
    RAISE EXCEPTION 'Identifier migration stopped: reference sequence is behind existing references';
  END IF;

  SELECT count(*) INTO demo_count FROM "ReturnRequest" r JOIN demo_order_mapping m ON r."orderId" = m.old_order;
  -- An empty database is valid; a partial/ambiguous seed set requires manual review.
  IF demo_count <> 0 AND demo_count <> 35 THEN
    RAISE EXCEPTION 'Identifier migration stopped: expected exactly 35 identifiable demo requests';
  END IF;
  IF demo_count = 35 THEN
    IF EXISTS (
      SELECT 1 FROM demo_order_mapping m LEFT JOIN "ReturnRequest" r ON r."orderId" = m.old_order
      GROUP BY m.n HAVING count(r.id) <> 1
    ) OR EXISTS (
      SELECT 1 FROM "ReturnRequest" r JOIN demo_order_mapping m ON r."orderId" = m.old_order
      WHERE r."itemId" <> m.expected_item OR r.phone IS DISTINCT FROM m.expected_phone
    ) THEN
      RAISE EXCEPTION 'Identifier migration stopped: demo requests cannot be identified safely';
    END IF;
    IF EXISTS (SELECT 1 FROM "ReturnRequest" r JOIN demo_order_mapping m ON r."orderId" = m.new_order) THEN
      RAISE EXCEPTION 'Identifier migration stopped: a target demo order ID already exists';
    END IF;
  END IF;
END $$;

-- One sequence value per insert; grow beyond four digits instead of truncating.
CREATE FUNCTION format_request_reference(value bigint) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT 'RD-' || lpad(value::text, greatest(4, length(value::text)), '0');
$$;

ALTER TABLE "ReturnRequest" ALTER COLUMN reference
SET DEFAULT format_request_reference(nextval('request_reference_seq'::regclass));

UPDATE "ReturnRequest"
SET reference = format_request_reference(substring(reference FROM 4)::bigint);

UPDATE "ReturnRequest" r SET "orderId" = m.new_order
FROM demo_order_mapping m WHERE r."orderId" = m.old_order;

-- Assert that only the two intended identifiers changed; retain timestamps too.
DO $$
BEGIN
  IF (SELECT count(*) FROM "ReturnRequest") <> (SELECT count(*) FROM identifier_request_before)
     OR EXISTS (
       SELECT 1 FROM identifier_request_before b
       LEFT JOIN "ReturnRequest" r ON r.id = b.id
       LEFT JOIN demo_order_mapping m ON b.original->>'orderId' = m.old_order
       WHERE r.id IS NULL
         OR (to_jsonb(r) - 'reference' - 'orderId') <> (b.original - 'reference' - 'orderId')
         OR r.reference <> format_request_reference(substring(b.original->>'reference' FROM 4)::bigint)
         OR r."orderId" <> coalesce(m.new_order, b.original->>'orderId')
     ) THEN
    RAISE EXCEPTION 'Identifier migration stopped: unexpected request changes detected';
  END IF;
  IF EXISTS (SELECT * FROM "Note" EXCEPT SELECT * FROM identifier_note_before)
     OR EXISTS (SELECT * FROM identifier_note_before EXCEPT SELECT * FROM "Note") THEN
    RAISE EXCEPTION 'Identifier migration stopped: notes changed';
  END IF;
END $$;

COMMIT;
