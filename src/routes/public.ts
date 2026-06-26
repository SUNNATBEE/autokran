import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

// GET /api/cranes — public fleet for the website.
// Returns only cranes flagged available, ordered for display.
router.get('/cranes', async (_req, res) => {
  try {
    const cranes = await prisma.crane.findMany({
      where: { available: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    // Long-ish CDN cache; the fleet changes rarely.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.json(cranes);
  } catch {
    // DB unavailable — let the frontend fall back to its built-in defaults.
    return res.json([]);
  }
});

// Counting visits: cap per-IP so a single client can't inflate the number.
const trackLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  label: 'track',
  message: 'Too many requests.',
});

// POST /api/track — increment today's page-view counter (no PII stored).
router.post('/track', trackLimiter, async (_req, res) => {
  try {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    await prisma.visit.upsert({
      where: { day },
      create: { day, count: 1 },
      update: { count: { increment: 1 } },
    });
    return res.status(204).end();
  } catch {
    // Never let analytics failures surface to visitors.
    return res.status(204).end();
  }
});

export default router;
