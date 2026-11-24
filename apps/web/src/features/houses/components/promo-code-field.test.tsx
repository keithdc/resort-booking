// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/promo-code-field.test.tsx
 * @feature houses
 */

import type { PromoCodeResult } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromoCodeField } from './promo-code-field';

interface Handlers {
  onChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
}

function renderField(
  props: { value?: string; appliedCode?: string; result?: PromoCodeResult | null; disabled?: boolean } = {},
): Handlers {
  const handlers: Handlers = {
    onChange: vi.fn<(value: string) => void>(),
    onApply: vi.fn<() => void>(),
    onRemove: vi.fn<() => void>(),
  };
  render(
    <PromoCodeField
      value={props.value ?? ''}
      appliedCode={props.appliedCode ?? ''}
      result={props.result ?? null}
      disabled={props.disabled ?? false}
      {...handlers}
    />,
  );
  return handlers;
}

function applyButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Apply' });
}

describe('PromoCodeField', () => {
  afterEach(cleanup);

  it('keeps Apply disabled until a code is typed', () => {
    renderField();

    expect(applyButton().hasAttribute('disabled')).toBe(true);
  });

  it('reports typing without applying it', async () => {
    const { onChange, onApply } = renderField();

    await userEvent.type(screen.getByLabelText(/Promo code/), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies on the Apply button', async () => {
    const { onApply } = renderField({ value: 'WELCOME15' });

    await userEvent.click(applyButton());

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('applies on Enter without submitting the surrounding form', () => {
    const { onApply } = renderField({ value: 'WELCOME15' });

    fireEvent.keyDown(screen.getByLabelText(/Promo code/), { key: 'Enter' });

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('does not re-apply a code that is already applied', () => {
    const { onApply } = renderField({ value: 'WELCOME15', appliedCode: 'WELCOME15' });

    fireEvent.keyDown(screen.getByLabelText(/Promo code/), { key: 'Enter' });

    expect(applyButton().hasAttribute('disabled')).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows the API message for an applied code', () => {
    renderField({
      value: 'WELCOME15',
      appliedCode: 'WELCOME15',
      result: { code: 'WELCOME15', applied: true, message: 'Code WELCOME15 applied' },
    });

    expect(screen.getByText('Code WELCOME15 applied')).toBeTruthy();
    expect(screen.getByLabelText(/Promo code/).getAttribute('aria-invalid')).toBe('false');
  });

  it('shows a wrong code as an error message that never blocks anything', () => {
    renderField({
      value: 'NOPE',
      appliedCode: 'NOPE',
      result: { code: 'NOPE', applied: false, message: 'That code is not valid' },
    });

    expect(screen.getByText('That code is not valid')).toBeTruthy();
    expect(screen.getByLabelText(/Promo code/).getAttribute('aria-invalid')).toBe('true');
  });

  it('offers Remove once a code is applied', async () => {
    const { onRemove } = renderField({ value: 'WELCOME15', appliedCode: 'WELCOME15' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('has no Remove button before anything is applied', () => {
    renderField({ value: 'abc' });

    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('disables everything while disabled', () => {
    renderField({ value: 'abc', appliedCode: 'abc', disabled: true });

    expect(screen.getByLabelText(/Promo code/).hasAttribute('disabled')).toBe(true);
    expect(applyButton().hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Remove' }).hasAttribute('disabled')).toBe(true);
  });
});
