import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';

export interface ContactRequestRecord {
  id: string;
  name: string;
  phone: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const CONTACTS_DIR = path.join(process.cwd(), 'data');
const CONTACTS_FILE = path.join(CONTACTS_DIR, 'contacts.json');

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

async function ensureContactsFile(): Promise<void> {
  await fs.mkdir(CONTACTS_DIR, { recursive: true });
  try {
    await fs.access(CONTACTS_FILE);
  } catch {
    await fs.writeFile(CONTACTS_FILE, '[]', 'utf-8');
  }
}

async function readFileContacts(): Promise<ContactRequestRecord[]> {
  await ensureContactsFile();
  const raw = await fs.readFile(CONTACTS_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as ContactRequestRecord[];
  return Array.isArray(parsed) ? parsed : [];
}

async function writeFileContacts(
  contacts: ContactRequestRecord[]
): Promise<void> {
  await ensureContactsFile();
  await fs.writeFile(
    CONTACTS_FILE,
    JSON.stringify(contacts, null, 2),
    'utf-8'
  );
}

function toRecord(contact: {
  id: string;
  name: string;
  phone: string;
  status: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
}): ContactRequestRecord {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    status: contact.status,
    createdAt:
      typeof contact.createdAt === 'string'
        ? contact.createdAt
        : contact.createdAt.toISOString(),
    updatedAt:
      contact.updatedAt instanceof Date
        ? contact.updatedAt.toISOString()
        : typeof contact.updatedAt === 'string'
          ? contact.updatedAt
          : typeof contact.createdAt === 'string'
            ? contact.createdAt
            : contact.createdAt.toISOString(),
  };
}

export async function createContactRequest(input: {
  name: string;
  phone: string;
}): Promise<ContactRequestRecord> {
  const now = new Date().toISOString();
  const record: ContactRequestRecord = {
    id: randomUUID(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };

  const prisma = await getPrisma();
  if (prisma) {
    try {
      const saved = await prisma.contactRequest.create({
        data: {
          name: record.name,
          phone: record.phone,
          status: 'new',
        },
      });
      return toRecord(saved);
    } catch (error) {
      console.error('Prisma save contact failed, using file store:', error);
    }
  }

  const contacts = await readFileContacts();
  contacts.unshift(record);
  await writeFileContacts(contacts);
  return record;
}

export async function listContactRequests(): Promise<ContactRequestRecord[]> {
  const prisma = await getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.contactRequest.findMany({
        orderBy: { createdAt: 'desc' },
      });
      // A successful DB query is authoritative — return it even when empty,
      // otherwise an empty database would incorrectly surface stale file data.
      return rows.map((row) => toRecord(row));
    } catch (error) {
      console.error('Prisma fetch contacts failed, using file store:', error);
    }
  }

  const fileContacts = await readFileContacts();
  return fileContacts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function updateContactRequestStatus(
  id: string,
  status: string
): Promise<ContactRequestRecord | null> {
  const prisma = await getPrisma();
  if (prisma) {
    try {
      const updated = await prisma.contactRequest.update({
        where: { id },
        data: { status },
      });
      return toRecord(updated);
    } catch {
      // fall through to file store
    }
  }

  const contacts = await readFileContacts();
  const index = contacts.findIndex((o) => o.id === id);
  if (index === -1) return null;

  contacts[index] = {
    ...contacts[index],
    status,
    updatedAt: new Date().toISOString(),
  };
  await writeFileContacts(contacts);
  return contacts[index];
}
