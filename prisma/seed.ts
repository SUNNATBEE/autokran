import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Default fleet — mirrors the cranes the website used to hard-code in
 * `frontend/src/constants/index.ts`. Running this once populates the DB so the
 * public site (now DB-driven) isn't empty after the switch.
 *
 * Idempotent: does nothing if any cranes already exist.
 */
const cranes = [
  {
    modelName: 'XCMG-30K5-I',
    brand: 'XCMG',
    capacity: 30,
    boomLength: 40.4,
    auxBoomLength: 48.7,
    pricePerMonth: 60_000_000,
    description:
      "Yuk ko'tarish quvvati 30 tonnagacha. Ishonchli va tezkor texnika.",
    images: ['/images/XCMG-30K5-I.jpeg'],
    displayOrder: 1,
  },
  {
    modelName: 'XCMG-30K5-I',
    brand: 'XCMG',
    capacity: 30,
    boomLength: 40.4,
    auxBoomLength: 48.7,
    pricePerMonth: 60_000_000,
    description:
      "Yuk ko'tarish quvvati 30 tonnagacha. Qurilish maydonlari uchun qulay.",
    images: ['/images/XCMG-30K5-I.jpeg'],
    displayOrder: 2,
  },
  {
    modelName: 'XCMG-30K5-I',
    brand: 'XCMG',
    capacity: 30,
    boomLength: 40.4,
    auxBoomLength: 48.7,
    pricePerMonth: 60_000_000,
    description:
      "Yuk ko'tarish quvvati 30 tonnagacha. Yuqori aniqlikdagi boshqaruv.",
    images: ['/images/XCMG-30K5-I.jpeg'],
    displayOrder: 3,
  },
  {
    modelName: 'XCMG-QY50KA',
    brand: 'XCMG',
    capacity: 50,
    boomLength: 43.5,
    auxBoomLength: 57.7,
    pricePerMonth: 75_000_000,
    description:
      "Yuk ko'tarish quvvati 50 tonnagacha. Asosiy ko'tarish balandligi 43,5 m. Maksimal ko'tarish balandligi 57,7 m.",
    images: ['/images/XCMG-QY50KA.jpg'],
    displayOrder: 4,
  },
  {
    modelName: 'XCMG-QY50KA',
    brand: 'XCMG',
    capacity: 50,
    boomLength: 43.5,
    auxBoomLength: 57.7,
    pricePerMonth: 75_000_000,
    description:
      "Yuk ko'tarish quvvati 50 tonnagacha. Har qanday murakkablikdagi ishlar uchun.",
    images: ['/images/XCMG-QY50KA.jpg'],
    displayOrder: 5,
  },
  {
    modelName: 'SANY STC500',
    brand: 'SANY',
    capacity: 50,
    boomLength: 43.5,
    auxBoomLength: 57.7,
    pricePerMonth: 75_000_000,
    description:
      "Yuk ko'tarish quvvati 50 tonnagacha. Yuqori sifatli va ishonchli SANY texnikasi.",
    images: ['/images/sany-stc500.jpg'],
    displayOrder: 6,
  },
  {
    modelName: 'ZOOMLION-QY80',
    brand: 'ZOOMLION',
    capacity: 80,
    boomLength: 44.5,
    auxBoomLength: 64.5,
    pricePerMonth: 90_000_000,
    description:
      "Yuk ko'tarish quvvati 80 tonnagacha. Asosiy ko'tarish balandligi 44,5 m. Maksimal ko'tarish balandligi 64,5 m.",
    images: ['/images/zoomlion_80t_new.jpg'],
    displayOrder: 7,
  },
  {
    modelName: 'ZOOMLION-ZTC130',
    brand: 'ZOOMLION',
    capacity: 130,
    boomLength: 70,
    auxBoomLength: 97.8,
    pricePerMonth: 150_000_000,
    description:
      "Yuk ko'tarish quvvati 130 tonnagacha. Asosiy ko'tarish balandligi 70 m. Maksimal ko'tarish balandligi 97,8 m.",
    images: ['/images/ZOOMLION-ZTC130.avif'],
    displayOrder: 8,
  },
];

async function main() {
  // Dedupe-safe: only insert default cranes that aren't already in the DB
  // (matched by modelName + capacity). Existing cranes are left untouched, and
  // re-running never creates duplicates.
  const existing = await prisma.crane.findMany({
    select: { modelName: true, capacity: true },
  });
  const present = new Set(existing.map((e) => `${e.modelName}__${e.capacity}`));

  const toAdd = cranes.filter(
    (c) => !present.has(`${c.modelName}__${c.capacity}`)
  );

  if (toAdd.length === 0) {
    console.log('All default cranes already present. Nothing to seed.');
    return;
  }

  await prisma.crane.createMany({
    data: toAdd.map((c) => ({
      ...c,
      price: '',
      discountPercent: 0,
      available: true,
    })),
  });
  console.log(`Seeded ${toAdd.length} crane(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
