/**
 * @file apps/web/src/features/houses/context/stay-quote-context.tsx
 * @feature houses
 * @dependencies react — shares the checkout's current quote with the page header
 */

'use client';

import type { Quote } from '@resort-booking/shared-types';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface StayQuoteContextValue {
  /** The API's quote for the dates the guest has picked, or null when there is none yet. */
  quote: Quote | null;
  publish: (quote: Quote | null) => void;
}

// Without a provider (checkout used on its own) publishing is a no-op and there is never a quote.
const StayQuoteContext = createContext<StayQuoteContextValue>({
  quote: null,
  publish: (): void => undefined,
});

interface StayQuoteProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the stay page so the header can show the nightly rate for the dates in the checkout.
 * The server-rendered children stay server-rendered; only this wrapper holds the state.
 */
export function StayQuoteProvider({ children }: StayQuoteProviderProps): React.JSX.Element {
  const [quote, setQuote] = useState<Quote | null>(null);
  const value = useMemo((): StayQuoteContextValue => ({ quote, publish: setQuote }), [quote]);
  return <StayQuoteContext.Provider value={value}>{children}</StayQuoteContext.Provider>;
}

/**
 * The quote the checkout is showing right now (null when none).
 */
export function useStayQuote(): Quote | null {
  return useContext(StayQuoteContext).quote;
}

/**
 * Publishes the checkout's quote to the page, and clears it when the quote goes away or the
 * checkout unmounts, so the header never shows a price for dates that are no longer on screen.
 */
export function usePublishStayQuote(quote: Quote | null): void {
  const { publish } = useContext(StayQuoteContext);
  useEffect((): (() => void) => {
    publish(quote);
    return (): void => {
      publish(null);
    };
  }, [quote, publish]);
}
