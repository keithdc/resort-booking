// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/configuration/components/password-checklist.test.tsx
 * @feature configuration
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordChecklist } from './password-checklist';

/** The text of the checklist line that starts with this label. */
function rule(label: string): string | undefined {
  return within(screen.getByRole('list', { name: 'Password rules' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
    .find((text) => text.startsWith(label));
}

describe('PasswordChecklist', () => {
  afterEach(cleanup);

  it('lists the six rules, each with a tick or an empty circle and a plain (met)/(not yet), never colour alone', () => {
    const { container } = render(<PasswordChecklist password="Sunny" email="marie@humphreys.example" />);

    const items = within(screen.getByRole('list', { name: 'Password rules' })).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(items.map((item) => item.textContent)).toEqual([
      'At least 10 characters (not yet)',
      'A capital letter (met)',
      'A small letter (met)',
      'A number (not yet)',
      'Does not contain your email name (met)',
      'Not a common password (met)',
    ]);
    expect(container.querySelectorAll('[data-testid="CheckCircleOutlineIcon"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-testid="RadioButtonUncheckedIcon"]')).toHaveLength(2);
  });

  it('announces the count politely and says when everything is met', () => {
    const { rerender } = render(<PasswordChecklist password="" email="" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('2 of 6 password rules met');

    rerender(<PasswordChecklist password="Lakeside-Morning-8" email="" />);
    expect(screen.getByRole('status').textContent).toBe('All password rules are met');
  });

  it('flags a common password and the email name', () => {
    render(<PasswordChecklist password="Welcome1234" email="" />);
    expect(rule('Not a common password')).toBe('Not a common password (not yet)');
    cleanup();

    render(<PasswordChecklist password="Marie-Lake-2027" email="marie@humphreys.example" />);
    expect(rule('Does not contain your email name')).toBe('Does not contain your email name (not yet)');
  });
});
