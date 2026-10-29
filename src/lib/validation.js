import { z } from 'zod';

const text = (max) => z.string().trim().min(1).max(max);
const statusValues = z.enum(['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED']);
const details = z.object({
  customerName: text(200),
  email: z.email().max(254).nullable().optional(),
  phone: text(32).nullable().optional(),
  orderId: text(100),
  itemId: text(100),
  itemName: text(200),
  quantity: z.number().int().positive().max(2147483647),
  reason: z.enum(['DAMAGED', 'WRONG_ITEM', 'SIZE_ISSUE', 'NOT_AS_DESCRIBED', 'CHANGED_MIND']),
}).strict();

export const createInput = details.refine((data) => data.email || data.phone, {
  message: 'Provide at least one email address or phone number.', path: ['email'],
});

const queryInteger = (max) => z.string().regex(/^[1-9]\d*$/).transform(Number)
  .pipe(z.number().int().max(max));

export const listInput = z.object({
  search: z.string().trim().max(200).default(''),
  status: statusValues.optional(),
  reason: details.shape.reason.optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'customerName', 'orderId', 'reference', 'quantity']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: queryInteger(1000000).default(1),
  limit: queryInteger(100).default(20),
}).strict();
export const updateInput = details.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'Provide at least one detail to update.',
});
export const noteInput = z.object({ body: text(10000) }).strict();
export const idInput = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2147483647));

// Decimal strings avoid floating-point rounding and match PostgreSQL Decimal(12,2).
const amount = z.union([z.string(), z.number().finite()]).transform(String)
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use a positive amount with at most two decimal places.'))
  .refine((value) => Number(value) > 0, 'Refund amount must be greater than zero.');

export const statusInput = z.object({
  status: statusValues,
  resolution: z.enum(['REFUND', 'REPLACEMENT', 'STORE_CREDIT']).optional(),
  refundAmount: amount.nullable().optional(),
}).strict().superRefine((data, ctx) => {
  const issue = (message, path) => ctx.addIssue({ code: 'custom', message, path: [path] });
  if (data.status === 'APPROVED') {
    if (!data.resolution) issue('Approval requires a resolution.', 'resolution');
    if (data.resolution === 'REFUND' && data.refundAmount == null) issue('Refund requires a positive amount.', 'refundAmount');
    if (data.resolution !== 'REFUND' && data.refundAmount != null) issue('Only refunds can have an amount.', 'refundAmount');
  } else if (data.resolution !== undefined || data.refundAmount !== undefined) {
    issue('Supply resolution and amount only when approving a request.', 'resolution');
  }
});
