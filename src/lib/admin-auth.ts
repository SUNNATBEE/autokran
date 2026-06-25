import { timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import type { AdminRole, AdminTokenPayload } from './admin-auth-config';

export type { AdminRole, AdminTokenPayload } from './admin-auth-config';
export { getDashboardPath, canAccessAdminPath } from './admin-auth-config';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * JWT secret. In production it MUST be provided via env — we refuse to start
 * with the insecure development fallback so a misconfigured deploy can never
 * sign tokens with a publicly known key.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '' || secret === 'change_me_in_production') {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET is not set (or uses the default placeholder). ' +
          'Set a strong, unique JWT_SECRET in the environment before starting in production.'
      );
    }
    return 'fallback_secret_for_development';
  }
  return secret;
}

const JWT_SECRET = resolveJwtSecret();

interface AdminAccount {
  password: string;
  role: AdminRole;
  displayName: string;
}

/**
 * Admin accounts.
 *
 * Credentials are read from the `ADMIN_ACCOUNTS` env var (JSON), e.g.:
 *   ADMIN_ACCOUNTS='[{"username":"shah","password":"...","role":"super_admin","displayName":"Shah"}]'
 *
 * For local development only, a built-in fallback is used when the env var is
 * absent. In production the env var is REQUIRED (we never ship credentials in
 * source control).
 */
function loadAdminAccounts(): Record<string, AdminAccount> {
  const raw = process.env.ADMIN_ACCOUNTS;

  if (raw && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw) as Array<
        AdminAccount & { username: string }
      >;
      const accounts: Record<string, AdminAccount> = {};
      for (const acc of parsed) {
        if (!acc.username || !acc.password || !acc.role) continue;
        accounts[acc.username] = {
          password: acc.password,
          role: acc.role,
          displayName: acc.displayName || acc.username,
        };
      }
      if (Object.keys(accounts).length > 0) return accounts;
    } catch (error) {
      console.error('Failed to parse ADMIN_ACCOUNTS env var:', error);
    }
  }

  if (isProduction) {
    throw new Error(
      'ADMIN_ACCOUNTS env var is required in production. ' +
        'Provide it as a JSON array of { username, password, role, displayName }.'
    );
  }

  // Development-only fallback with placeholder credentials (no real secrets in
  // source control). Real accounts come from the ADMIN_ACCOUNTS env var.
  console.warn(
    '⚠️  Using built-in development admin accounts (admin / manager, password "devpassword"). ' +
      'Set ADMIN_ACCOUNTS for any real use.'
  );
  return {
    admin: {
      password: 'devpassword',
      role: 'super_admin',
      displayName: 'Dev Admin',
    },
    manager: {
      password: 'devpassword',
      role: 'order_manager',
      displayName: 'Dev Manager',
    },
  };
}

export const ADMIN_CREDENTIALS: Record<string, AdminAccount> =
  loadAdminAccounts();

/** Constant-time string comparison to avoid leaking timing information. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still compare against itself to keep timing roughly constant.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function authenticateAdmin(
  username: string,
  password: string
): AdminTokenPayload | null {
  const account = ADMIN_CREDENTIALS[username];
  if (!account) {
    // Run a dummy comparison so missing usernames don't return noticeably faster.
    safeEqual(password, password);
    return null;
  }
  if (!safeEqual(account.password, password)) {
    return null;
  }
  return {
    username,
    role: account.role,
    displayName: account.displayName,
  };
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AdminTokenPayload;
  } catch {
    return null;
  }
}
