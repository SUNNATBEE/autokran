import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';

export interface RentalOrderRecord {
  id: string;
  name: string;
  phone: string;
  location: string;
  craneModel: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const ORDERS_DIR = path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(ORDERS_DIR, 'rental-orders.json');

function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

async function getPrisma(): Promise<PrismaClient | null> {
  if (!hasDatabase()) return null;
  try {
    const { prisma } = await import('./prisma');
    return prisma;
  } catch (error) {
    console.error('Prisma unavailable, using file store:', error);
    return null;
  }
}

async function ensureOrdersFile(): Promise<void> {
  await fs.mkdir(ORDERS_DIR, { recursive: true });
  try {
    await fs.access(ORDERS_FILE);
  } catch {
    await fs.writeFile(ORDERS_FILE, '[]', 'utf-8');
  }
}

async function readFileOrders(): Promise<RentalOrderRecord[]> {
  await ensureOrdersFile();
  const raw = await fs.readFile(ORDERS_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as RentalOrderRecord[];
  return Array.isArray(parsed) ? parsed : [];
}

async function writeFileOrders(orders: RentalOrderRecord[]): Promise<void> {
  await ensureOrdersFile();
  await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
}

function toRecord(order: {
  id: string;
  name: string;
  phone: string;
  location: string;
  craneModel: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
}): RentalOrderRecord {
  return {
    id: order.id,
    name: order.name,
    phone: order.phone,
    location: order.location,
    craneModel: order.craneModel,
    status: order.status,
    createdAt:
      typeof order.createdAt === 'string'
        ? order.createdAt
        : order.createdAt.toISOString(),
    updatedAt:
      order.updatedAt instanceof Date
        ? order.updatedAt.toISOString()
        : typeof order.updatedAt === 'string'
          ? order.updatedAt
          : typeof order.createdAt === 'string'
            ? order.createdAt
            : order.createdAt.toISOString(),
  };
}

export async function createRentalOrder(input: {
  name: string;
  phone: string;
  location: string;
  craneModel?: string | null;
}): Promise<RentalOrderRecord> {
  const now = new Date().toISOString();
  const record: RentalOrderRecord = {
    id: randomUUID(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    location: input.location.trim(),
    craneModel: input.craneModel ? String(input.craneModel) : null,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };

  const prisma = await getPrisma();
  if (prisma) {
    try {
      const saved = await prisma.rentalOrder.create({
        data: {
          name: record.name,
          phone: record.phone,
          location: record.location,
          craneModel: record.craneModel,
          status: 'new',
        },
      });
      return toRecord(saved);
    } catch (error) {
      console.error('Prisma save failed, using file store:', error);
    }
  }

  const orders = await readFileOrders();
  orders.unshift(record);
  await writeFileOrders(orders);
  return record;
}

export async function listRentalOrders(): Promise<RentalOrderRecord[]> {
  const prisma = await getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.rentalOrder.findMany({
        orderBy: { createdAt: 'desc' },
      });
      if (rows.length > 0) {
        return rows.map((row) => toRecord(row));
      }
    } catch (error) {
      console.error('Prisma fetch failed, using file store:', error);
    }
  }

  const fileOrders = await readFileOrders();
  return fileOrders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function updateRentalOrderStatus(
  id: string,
  status: string
): Promise<RentalOrderRecord | null> {
  const prisma = await getPrisma();
  if (prisma) {
    try {
      const updated = await prisma.rentalOrder.update({
        where: { id },
        data: { status },
      });
      return toRecord(updated);
    } catch {
      // fall through to file store
    }
  }

  const orders = await readFileOrders();
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) return null;

  orders[index] = {
    ...orders[index],
    status,
    updatedAt: new Date().toISOString(),
  };
  await writeFileOrders(orders);
  return orders[index];
}
