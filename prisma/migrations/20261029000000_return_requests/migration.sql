-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DAMAGED', 'WRONG_ITEM', 'SIZE_ISSUE', 'NOT_AS_DESCRIBED', 'CHANGED_MIND');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ResolutionType" AS ENUM ('REFUND', 'REPLACEMENT', 'STORE_CREDIT');

-- CreateTable
-- Capped to preserve the fixed-width reference without truncation or reuse.
CREATE SEQUENCE "request_reference_seq" MAXVALUE 999999999999 NO CYCLE;

CREATE TABLE "ReturnRequest" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(32) NOT NULL DEFAULT ('RD-'::text || lpad((nextval('request_reference_seq'::regclass))::text, 12, '0'::text)),
    "customerName" VARCHAR(200) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "orderId" VARCHAR(100) NOT NULL,
    "itemId" VARCHAR(100) NOT NULL,
    "itemName" VARCHAR(200) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "ReturnReason" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "ResolutionType",
    "refundAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_reference_key" ON "ReturnRequest"("reference");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_reason_createdAt_idx" ON "ReturnRequest"("reason", "createdAt");

-- CreateIndex
CREATE INDEX "Note_requestId_createdAt_id_idx" ON "Note"("requestId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ReturnRequest_live_order_item_key"
ON "ReturnRequest" ("orderId", "itemId")
WHERE "deletedAt" IS NULL AND "status" IN ('OPEN', 'IN_REVIEW', 'APPROVED');

ALTER TABLE "ReturnRequest"
  ADD CONSTRAINT "ReturnRequest_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "ReturnRequest_details_nonempty" CHECK (
    btrim("customerName") <> '' AND btrim("orderId") <> ''
    AND btrim("itemId") <> '' AND btrim("itemName") <> ''
  ),
  ADD CONSTRAINT "ReturnRequest_contact_required" CHECK (
    ("email" IS NOT NULL AND btrim("email") <> '')
    OR ("phone" IS NOT NULL AND btrim("phone") <> '')
  ),
  ADD CONSTRAINT "ReturnRequest_resolution_required" CHECK (
    "status" NOT IN ('APPROVED', 'COMPLETED') OR "resolution" IS NOT NULL
  ),
  ADD CONSTRAINT "ReturnRequest_refund_consistent" CHECK (
    CASE WHEN "resolution" = 'REFUND'
      THEN "refundAmount" IS NOT NULL AND "refundAmount" > 0
      ELSE "refundAmount" IS NULL END
  );

ALTER TABLE "Note" ADD CONSTRAINT "Note_body_nonempty" CHECK (btrim("body") <> '');
