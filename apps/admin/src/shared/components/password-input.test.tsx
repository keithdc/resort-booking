// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordInput } from './password-input';

afterEach(cleanup);

describe('PasswordInput', () => {
  it('hides the text by default and toggles it with the eye button', async () => {
    const user = userEvent.setup();
    render(<PasswordInput label="Password" value="secret-1" onChange={(): void => undefined} />);
    const input = screen.getByLabelText('Password', { selector: 'input' });
    expect(input.getAttribute('type')).toBe('password');
    const eye = screen.getByRole('button', { name: 'Show password' });
    expect(eye.getAttribute('aria-pressed')).toBe('false');
    await user.click(eye);
    expect(input.getAttribute('type')).toBe('text');
    expect(eye.getAttribute('aria-pressed')).toBe('true');
    await user.click(eye);
    expect(input.getAttribute('type')).toBe('password');
  });

  it('uses a custom name for the button', () => {
    render(<PasswordInput label="Confirm password" toggleLabel="Show confirm password" value="" onChange={(): void => undefined} />);
    expect(screen.getAllByRole('button', { name: 'Show confirm password' })).toHaveLength(1);
  });
});
