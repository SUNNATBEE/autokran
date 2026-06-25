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

router.post('/cranes', requireRole('super_admin'), async (req, res) => {
  try {
    const data = req.body ?? {};
    const crane = await prisma.crane.create({
      data: {
        modelName: data.modelName,
        capacity: parseFloat(data.capacity),
        boomLength: parseFloat(data.boomLength),
        price: data.price,
        description: data.description,
        images: data.images || [],
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
    const crane = await prisma.crane.update({
      where: { id: req.params.id },
      data: {
        modelName: data.modelName,
        capacity: data.capacity ? parseFloat(data.capacity) : undefined,
        boomLength: data.boomLength ? parseFloat(data.boomLength) : undefined,
        price: data.price,
        description: data.description,
        images: data.images,
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
    const sponsor = await prisma.sponsor.create({
      data: {
        name: data.name,
        logoUrl: data.logoUrl,
        websiteUrl: data.websiteUrl,
        displayOrder: data.displayOrder ? parseInt(data.displayOrder) : 0,
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
        displayOrder: data.displayOrder
          ? parseInt(data.displayOrder)
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
