import { prisma } from './prisma.js';
import { ApiError } from './api.js';
import { createInput } from './validation.js';

const transitions = { OPEN: ['IN_REVIEW'], IN_REVIEW: ['APPROVED', 'REJECTED'], APPROVED: ['COMPLETED'], REJECTED: [], COMPLETED: [] };
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Request not found.');

// Lock before reading/checking state. Every mutation follows this same protocol.
async function withRequest(id, action) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id = ${id} AND "deletedAt" IS NULL FOR UPDATE`;
    if (!rows.length) throw notFound();
    const current = await tx.returnRequest.findUnique({ where: { id } });
    return action(tx, current);
  }, { maxWait: 10000, timeout: 15000 });
}

export function createRequest(data) {
  return prisma.returnRequest.create({ data });
}

export async function listRequests({ search, status, reason, sortBy, sortOrder, page, limit }) {
  // Escape LIKE metacharacters so search is a literal substring, including % and _.
  const term = search.replace(/[\\%_]/g, '\\$&');
  const where = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(reason ? { reason } : {}),
    ...(search ? { OR: ['customerName', 'orderId', 'reference'].map((field) => ({
      [field]: { contains: term, mode: 'insensitive' },
    })) } : {}),
  };
  // One snapshot keeps the count and page consistent during concurrent writes.
  const [items, total] = await prisma.$transaction([
    prisma.returnRequest.findMany({
      where, orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.returnRequest.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getRequest(id) {
  const request = await prisma.returnRequest.findFirst({
    where: { id, deletedAt: null },
    include: { notes: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });
  if (!request) throw notFound();
  return request;
}

export function updateRequest(id, data) {
  return withRequest(id, (tx, current) => {
    if (!['OPEN', 'IN_REVIEW'].includes(current.status)) {
      throw new ApiError(409, 'DETAILS_LOCKED', 'Details cannot be changed once a request is decided.');
    }
    // Validate the combined contact details so a partial edit cannot remove both.
    createInput.parse(Object.fromEntries(Object.keys(createInput.shape).map((key) => [key, key in data ? data[key] : current[key]])));
    return tx.returnRequest.update({ where: { id }, data });
  });
}

export function changeStatus(id, data) {
  return withRequest(id, (tx, current) => {
    if (!transitions[current.status].includes(data.status)) {
      throw new ApiError(409, 'INVALID_TRANSITION', `Cannot move from ${current.status} to ${data.status}.`);
    }
    return tx.returnRequest.update({ where: { id }, data: {
      status: data.status,
      ...(data.status === 'APPROVED' ? { resolution: data.resolution, refundAmount: data.refundAmount ?? null } : {}),
    } });
  });
}

export function addNote(id, data) {
  return withRequest(id, (tx) => tx.note.create({ data: { requestId: id, body: data.body } }));
}

export function deleteRequest(id) {
  return withRequest(id, async (tx, current) => {
    if (!['OPEN', 'REJECTED'].includes(current.status)) {
      throw new ApiError(409, 'REMOVAL_NOT_ALLOWED', 'Only Open or Rejected requests can be removed.');
    }
    await tx.returnRequest.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  });
}
