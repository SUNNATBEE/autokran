export type AdminRole = 'order_manager' | 'super_admin';

export interface AdminTokenPayload {
  username: string;
  role: AdminRole;
  displayName: string;
}

export function getDashboardPath(role: AdminRole): string {
  return role === 'order_manager' ? '/admin/orders' : '/admin/settings';
}

export function canAccessAdminPath(role: AdminRole, pathname: string): boolean {
  if (pathname === '/admin/login') return true;

  const orderManagerPaths = ['/admin/orders', '/admin/contacts'];
  const superAdminOnlyPrefixes = [
    '/admin/settings',
    '/admin/fleet',
    '/admin/sponsors',
    '/admin/media',
  ];

  if (role === 'super_admin') return true;

  if (role === 'order_manager') {
    if (pathname === '/admin' || pathname === '/admin/') return true;
    return orderManagerPaths.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
  }

  return !superAdminOnlyPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
