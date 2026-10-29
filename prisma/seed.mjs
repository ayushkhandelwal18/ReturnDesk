import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/lib/prisma.js';

const customers = ['Aarav Sharma', 'Priya Patel', 'Maya Chen', 'Daniel Brooks', 'Sofia Garcia', 'Noah Wilson', 'Ananya Rao'];
const items = ['Cotton shirt', 'Running shoes', 'Ceramic mug set', 'Wireless headphones', 'Linen trousers', 'Desk lamp', 'Canvas backpack'];
const statuses = ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'];
const reasons = ['DAMAGED', 'WRONG_ITEM', 'SIZE_ISSUE', 'NOT_AS_DESCRIBED', 'CHANGED_MIND'];
const resolutions = ['REFUND', 'REPLACEMENT', 'STORE_CREDIT'];

// Namespace is used by integration tests to isolate their own seed fixtures.
export async function seedRequests(namespace = 'ORD') {
  const records = Array.from({ length: 35 }, (_, i) => {
    const status = statuses[Math.floor(i / 7)];
    const resolution = ['APPROVED', 'COMPLETED'].includes(status) ? resolutions[i % 3] : null;
    const createdAt = new Date(Date.now() - (35 - i) * 86400000);
    return {
      customerName: customers[i % customers.length],
      email: `${customers[i % customers.length].toLowerCase().replaceAll(' ', '.')}@example.com`,
      phone: `+1-202-555-${String(100 + i).padStart(4, '0')}`,
      orderId: `${namespace}-${String(i + 1).padStart(4, '0')}`,
      itemId: `SKU-${100 + i % items.length}`,
      itemName: items[i % items.length],
      quantity: i % 3 + 1,
      reason: reasons[i % reasons.length],
      status, resolution,
      refundAmount: resolution === 'REFUND' ? `${25 + i}.50` : null,
      createdAt, updatedAt: createdAt,
      ...(i % 3 === 0 ? { notes: { create: [
        { body: `Customer contacted support about the ${items[i % items.length].toLowerCase()}.`, createdAt },
        { body: 'Order receipt and item photographs received for the case file.', createdAt: new Date(createdAt.getTime() + 60000) },
      ] } } : {}),
    };
  });
  return prisma.$transaction(async (tx) => {
    const existing = await tx.returnRequest.findMany({
      where: { orderId: { in: records.map((row) => row.orderId) } }, select: { orderId: true },
    });
    const orders = new Set(existing.map((row) => row.orderId));
    let inserted = 0;
    for (const data of records) {
      // Preserve existing rows, including edited, finalized and soft-deleted demos.
      if (orders.has(data.orderId)) continue;
      await tx.returnRequest.create({ data });
      inserted++;
    }
    return { inserted, skipped: records.length - inserted };
  }, { maxWait: 15000, timeout: 60000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log('Seed complete:', await seedRequests());
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
