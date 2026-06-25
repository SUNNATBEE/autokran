import type { Request, Response, NextFunction } from 'express';
import {
  verifyAdminToken,
  type AdminRole,
  type AdminTokenPayload,
} from '../lib/admin-auth';

const ADMIN_TOKEN_COOKIE = 'admin_token';

/** Plain `{ error }` response shape used by the admin routes. */
export function sendError(res: Response, message: string, status = 400) {
  return res.status(status).json({ error: message });
}

function getToken(req: Request): string | undefined {
  return req.cookies?.[ADMIN_TOKEN_COOKIE];
}

/** Decode the role-based admin token (username/password, super_admin / order_manager). */
export function getAdminFromRequest(req: Request): AdminTokenPayload | null {
  const token = getToken(req);
  if (!token) return null;
  return verifyAdminToken(token);
}

/** Express middleware: require the admin token with one of the allowed roles. */
export function requireRole(...allowedRoles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = getAdminFromRequest(req);
    if (!admin || !allowedRoles.includes(admin.role)) {
      return sendError(res, 'Unauthorized', 401);
    }
    (req as Request & { admin?: AdminTokenPayload }).admin = admin;
    next();
  };
}
