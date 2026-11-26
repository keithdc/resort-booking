/**
 * @file apps/admin/src/shared/components/nav-config.test.tsx
 * @shared
 */

import { describe, expect, it } from 'vitest';
import { navGroupsFor } from './nav-config';

function hrefs(role: 'admin' | 'employee' | null): string[] {
  return navGroupsFor(role).flatMap((group): string[] => group.items.map((item): string => item.href));
}

describe('navGroupsFor', () => {
  it('gives admins everything, with Team and Audit log under Setup', () => {
    expect(hrefs('admin')).toEqual(['/', '/refunds', '/reports', '/properties', '/team', '/audit', '/configuration']);
  });

  it('hides Properties, Team and Audit log from employees', () => {
    expect(hrefs('employee')).toEqual(['/', '/refunds', '/reports', '/configuration']);
  });

  it('treats an unknown role like an employee so admin links never flash', () => {
    expect(hrefs(null)).toEqual(hrefs('employee'));
  });
});
