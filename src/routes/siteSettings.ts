import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/site-settings — public global settings
router.get('/', async (_req, res) => {
  try {
    const settings = await prisma.globalSettings.findFirst();
    return res.json(settings || {});
  } catch {
    return res.json({});
  }
});

export default router;
