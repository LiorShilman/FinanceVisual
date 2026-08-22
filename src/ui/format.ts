const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

/** Same call site as formatCurrency, but swaps in a placeholder when amounts are hidden for sharing. */
export function formatCurrencyMasked(amount: number, hidden: boolean): string {
  return hidden ? '₪ •••' : formatCurrency(amount);
}
