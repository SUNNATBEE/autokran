import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import {
  authenticateAdmin,
  getDashboardPath,
  signAdminToken,
} from '../lib/admin-auth';
import {
  listRentalOrders,
  updateRentalOrderStatus,
} from '../lib/orders-store';
import {
  listContactRequests,
  updateContactRequestStatus,
} from '../lib/contacts-store';
import {
  getAdminFromRequest,
  requireRole,
  sendError,
} from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();
const ONE_DAY_MS = 60 * 60 * 24 * 1000;

/** Coerce to a finite, positive number or return null when invalid. */
function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Coerce to a non-empty trimmed string or return null. */
function toRequiredString(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.length > 0 ? s : null;
}

// Brute-force protection on the login endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  label: 'admin-auth',
  message: 'Too many login attempts. Please try again later.',
});

// --- Auth (username/password, role-based) ---

// POST /api/admin/auth — login
router.post('/auth', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body ?? {};

    if (!username || !password) {
      return sendError(res, 'Username and password are required', 400);
    }

    const admin = authenticateAdmin(String(username).trim(), String(password));
    if (!admin) {
      return sendError(res, 'Invalid username or password', 401);
    }

    const token = signAdminToken(admin);
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: ONE_DAY_MS,
      path: '/',
    });

    return res.json({
      success: true,
      role: admin.role,
      displayName: admin.displayName,
      redirectTo: getDashboardPath(admin.role),
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/me
router.get('/me', (req, res) => {
  const admin = getAdminFromRequest(req);
  if (!admin) return sendError(res, 'Unauthorized', 401);
  return res.json({
    username: admin.username,
    role: admin.role,
    displayName: admin.displayName,
  });
});

// POST /api/admin/logout
router.post('/logout', (_req, res) => {
  res.cookie('admin_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  return res.json({ success: true });
});

// --- Cranes (Prisma, super_admin) ---

router.get('/cranes', requireRole('super_admin'), async (_req, res) => {
  try {
    const cranes = await prisma.crane.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json(cranes);
  } catch {
    return sendError(res, 'Failed to fetch cranes', 500);
  }
});

// Clamp a discount to a sane 0..90 range.
function normalizeDiscount(value: unknown): number {
  const n = parseInt(String(value ?? 0), 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(90, Math.max(0, n));
}

function toNullableInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

router.post('/cranes', requireRole('super_admin'), async (req, res) => {
  try {
    const data = req.body ?? {};
    const modelName = toRequiredString(data.modelName);
    const capacity = toPositiveNumber(data.capacity);
    const boomLength = toPositiveNumber(data.boomLength);
    // `price` is the legacy free-text field; the public site now uses the
    // numeric `pricePerMonth`, so price is optional (defaults to '').
    const price = toRequiredString(data.price) ?? '';

    if (!modelName) return sendError(res, 'modelName is required', 400);
    if (capacity === null)
      return sendError(res, 'capacity must be a positive number', 400);
    if (boomLength === null)
      return sendError(res, 'boomLength must be a positive number', 400);

    const crane = await prisma.crane.create({
      data: {
        modelName,
        brand: data.brand || null,
        capacity,
        boomLength,
        auxBoomLength:
          data.auxBoomLength !== undefined && data.auxBoomLength !== ''
            ? parseFloat(data.auxBoomLength)
            : null,
        price,
        pricePerMonth: toNullableInt(data.pricePerMonth),
        discountPercent: normalizeDiscount(data.discountPercent),
        available: data.available !== undefined ? Boolean(data.available) : true,
        displayOrder: data.displayOrder ? parseInt(data.displayOrder, 10) : 0,
        description: typeof data.description === 'string' ? data.description : '',
        images: Array.isArray(data.images) ? data.images : [],
      },
    });
    return res.status(201).json(crane);
  } catch {
    return sendError(res, 'Failed to create crane', 500);
  }
});

router.put('/cranes/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const data = req.body ?? {};

    let capacity: number | undefined;
    if (data.capacity !== undefined) {
      const parsed = toPositiveNumber(data.capacity);
      if (parsed === null)
        return sendError(res, 'capacity must be a positive number', 400);
      capacity = parsed;
    }

    let boomLength: number | undefined;
    if (data.boomLength !== undefined) {
      const parsed = toPositiveNumber(data.boomLength);
      if (parsed === null)
        return sendError(res, 'boomLength must be a positive number', 400);
      boomLength = parsed;
    }

    const crane = await prisma.crane.update({
      where: { id: req.params.id },
      data: {
        modelName: data.modelName,
        brand: data.brand,
        capacity,
        boomLength,
        auxBoomLength:
          data.auxBoomLength !== undefined && data.auxBoomLength !== ''
            ? parseFloat(data.auxBoomLength)
            : undefined,
        price: data.price,
        pricePerMonth:
          data.pricePerMonth !== undefined
            ? toNullableInt(data.pricePerMonth)
            : undefined,
        discountPercent:
          data.discountPercent !== undefined
            ? normalizeDiscount(data.discountPercent)
            : undefined,
        available:
          data.available !== undefined ? Boolean(data.available) : undefined,
        displayOrder:
          data.displayOrder !== undefined
            ? parseInt(data.displayOrder, 10)
            : undefined,
        description: data.description,
        images: Array.isArray(data.images) ? data.images : undefined,
      },
    });
    return res.json(crane);
  } catch {
    return sendError(res, 'Failed to update crane', 500);
  }
});

router.delete('/cranes/:id', requireRole('super_admin'), async (req, res) => {
  try {
    await prisma.crane.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch {
    return sendError(res, 'Failed to delete crane', 500);
  }
});

// --- Sponsors (Prisma, super_admin) ---

router.get('/sponsors', requireRole('super_admin'), async (_req, res) => {
  try {
    const sponsors = await prisma.sponsor.findMany({
      orderBy: { displayOrder: 'asc' },
    });
    return res.json(sponsors);
  } catch {
    return sendError(res, 'Failed to fetch sponsors', 500);
  }
});

router.post('/sponsors', requireRole('super_admin'), async (req, res) => {
  try {
    const data = req.body ?? {};
    const name = toRequiredString(data.name);
    const logoUrl = toRequiredString(data.logoUrl);

    if (!name) return sendError(res, 'name is required', 400);
    if (!logoUrl) return sendError(res, 'logoUrl is required', 400);

    const displayOrder = Number.parseInt(String(data.displayOrder), 10);

    const sponsor = await prisma.sponsor.create({
      data: {
        name,
        logoUrl,
        websiteUrl: toRequiredString(data.websiteUrl) ?? undefined,
        displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
      },
    });
    return res.status(201).json(sponsor);
  } catch {
    return sendError(res, 'Failed to create sponsor', 500);
  }
});

router.put('/sponsors/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const data = req.body ?? {};
    const sponsor = await prisma.sponsor.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        logoUrl: data.logoUrl,
        websiteUrl: data.websiteUrl,
        displayOrder:
          data.displayOrder !== undefined &&
          Number.isFinite(Number.parseInt(String(data.displayOrder), 10))
            ? Number.parseInt(String(data.displayOrder), 10)
            : undefined,
      },
    });
    return res.json(sponsor);
  } catch {
    return sendError(res, 'Failed to update sponsor', 500);
  }
});

router.delete('/sponsors/:id', requireRole('super_admin'), async (req, res) => {
  try {
    await prisma.sponsor.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch {
    return sendError(res, 'Failed to delete sponsor', 500);
  }
});

// --- Orders (file/Prisma store, order_manager + super_admin) ---

router.get(
  '/orders',
  requireRole('order_manager', 'super_admin'),
  async (_req, res) => {
    try {
      const orders = await listRentalOrders();
      return res.json(orders);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      return sendError(res, 'Failed to fetch orders', 500);
    }
  }
);

router.patch(
  '/orders',
  requireRole('order_manager', 'super_admin'),
  async (req, res) => {
    try {
      const { id, status } = req.body ?? {};
      if (!id || !status) {
        return sendError(res, 'Order id and status are required', 400);
      }
      const order = await updateRentalOrderStatus(String(id), String(status));
      if (!order) return sendError(res, 'Order not found', 404);
      return res.json(order);
    } catch (error) {
      console.error('Failed to update order:', error);
      return sendError(res, 'Failed to update order', 500);
    }
  }
);

// --- Contacts (file/Prisma store, order_manager + super_admin) ---

router.get(
  '/contacts',
  requireRole('order_manager', 'super_admin'),
  async (_req, res) => {
    try {
      const contacts = await listContactRequests();
      return res.json(contacts);
    } catch (error) {
      console.error('Failed to fetch contact requests:', error);
      return sendError(res, 'Failed to fetch contact requests', 500);
    }
  }
);

router.patch(
  '/contacts',
  requireRole('order_manager', 'super_admin'),
  async (req, res) => {
    try {
      const { id, status } = req.body ?? {};
      if (!id || !status) {
        return sendError(res, 'Contact request id and status are required', 400);
      }
      const contact = await updateContactRequestStatus(
        String(id),
        String(status)
      );
      if (!contact) return sendError(res, 'Contact request not found', 404);
      return res.json(contact);
    } catch (error) {
      console.error('Failed to update contact request:', error);
      return sendError(res, 'Failed to update contact request', 500);
    }
  }
);

// --- Settings (Prisma, super_admin) ---

router.get('/settings', requireRole('super_admin'), async (_req, res) => {
  try {
    const settings = await prisma.globalSettings.findFirst();
    return res.json(settings || {});
  } catch {
    return sendError(res, 'Failed to fetch settings', 500);
  }
});

router.post('/settings', requireRole('super_admin'), async (req, res) => {
  try {
    const data = req.body ?? {};
    const existingSettings = await prisma.globalSettings.findFirst();

    const payload = {
      phoneNumbers: data.phoneNumbers || [],
      telegramBot: data.telegramBot,
      address: data.address,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
    };

    const settings = existingSettings
      ? await prisma.globalSettings.update({
          where: { id: existingSettings.id },
          data: payload,
        })
      : await prisma.globalSettings.create({ data: payload });

    return res.json(settings);
  } catch {
    return sendError(res, 'Failed to save settings', 500);
  }
});

// --- Dashboard statistics (super_admin + order_manager) ---

// GET /api/admin/stats — aggregate counts for the admin dashboard.
router.get(
  '/stats',
  requireRole('super_admin', 'order_manager'),
  async (_req, res) => {
    try {
      const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      const weekAgo = Date.now() - WEEK_MS;

      const [orders, contacts] = await Promise.all([
        listRentalOrders(),
        listContactRequests(),
      ]);

      // Crane / sponsor / visit data lives only in Prisma — fail soft if the
      // DB is unavailable so the dashboard still renders the lead numbers.
      let craneTotal = 0;
      let craneAvailable = 0;
      let sponsorTotal = 0;
      let visits: { day: string; count: number }[] = [];
      try {
        const [cranes, sponsors, visitRows] = await Promise.all([
          prisma.crane.findMany({ select: { available: true } }),
          prisma.sponsor.count(),
          prisma.visit.findMany({ orderBy: { day: 'desc' }, take: 14 }),
        ]);
        craneTotal = cranes.length;
        craneAvailable = cranes.filter((c) => c.available).length;
        sponsorTotal = sponsors;
        visits = visitRows
          .map((v) => ({ day: v.day, count: v.count }))
          .reverse();
      } catch {
        // DB not configured — leave Prisma-backed numbers at 0.
      }

      const ordersByStatus = orders.reduce<Record<string, number>>(
        (acc, o) => {
          acc[o.status] = (acc[o.status] ?? 0) + 1;
          return acc;
        },
        {}
      );

      const newOrdersThisWeek = orders.filter(
        (o) => new Date(o.createdAt).getTime() >= weekAgo
      ).length;

      const visitsTotal = visits.reduce((sum, v) => sum + v.count, 0);

      // Newest 5 leads (orders) for the dashboard table.
      const recentLeads = orders.slice(0, 5).map((o) => ({
        id: o.id,
        name: o.name,
        phone: o.phone,
        location: o.location,
        craneModel: o.craneModel,
        status: o.status,
        createdAt: o.createdAt,
      }));

      return res.json({
        cranes: { total: craneTotal, available: craneAvailable },
        sponsors: sponsorTotal,
        orders: {
          total: orders.length,
          newThisWeek: newOrdersThisWeek,
          byStatus: ordersByStatus,
        },
        contacts: {
          total: contacts.length,
          new: contacts.filter((c) => c.status === 'new').length,
        },
        visits: { total: visitsTotal, daily: visits },
        recentLeads,
      });
    } catch (error) {
      console.error('Failed to build stats:', error);
      return sendError(res, 'Failed to build stats', 500);
    }
  }
);

// --- Upload (super_admin) ---

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
]);

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'public', 'uploads'),
  filename: (_req, file, cb) => {
    // Sanitise the original name: strip path separators and unsafe chars.
    const safeBase = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9.\-_]/g, '-')
      .slice(-80);
    cb(null, `${Date.now()}-${safeBase}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

router.post(
  '/upload',
  requireRole('super_admin'),
  (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return sendError(res, err.message || 'Upload failed', 400);
      }
      if (!req.file) {
        return sendError(res, 'No file provided', 400);
      }
      return res.status(201).json({ url: `/uploads/${req.file.filename}` });
    });
  }
);

export default router;
