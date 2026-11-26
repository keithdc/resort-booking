/**
 * @file apps/admin/src/features/reporting/components/money-visibility.tsx
 * @feature reporting
 * @dependencies React context
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';

const MoneyHiddenContext = createContext(false);

interface MoneyVisibilityProps {
  hidden: boolean;
  children: ReactNode;
}

/**
 * Tells every part of the report whether the API withheld the money figures (employees), so each one can leave
 * its money out instead of showing zeros. Outside a provider money is shown.
 */
export function MoneyVisibility({ hidden, children }: MoneyVisibilityProps): React.JSX.Element {
  return <MoneyHiddenContext.Provider value={hidden}>{children}</MoneyHiddenContext.Provider>;
}

/** True when money figures must not be shown. */
export function useMoneyHidden(): boolean {
  return useContext(MoneyHiddenContext);
}
