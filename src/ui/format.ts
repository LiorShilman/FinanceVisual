export type DisplayCurrency = 'ils' | 'usd';

const FORMATTERS: Record<DisplayCurrency, Intl.NumberFormat> = {
  ils: new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }),
  usd: new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
};

// every amount is stored in ₪ — `currency`/`usdRate` only affect how it's displayed here, never
// what's saved, so switching the toggle back and forth is always lossless.
export function formatCurrency(amount: number, currency: DisplayCurrency = 'ils', usdRate = 1): string {
  const displayAmount = currency === 'usd' ? amount / usdRate : amount;
  return FORMATTERS[currency].format(displayAmount);
}
