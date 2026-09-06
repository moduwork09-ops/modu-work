/** Accept whole won amounts, including the UI's existing comma formatting. */
export function parseSalaryAmountInput(value: string): number | null {
  const text = value.trim();
  if (text === '') return 0;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
  const amount = Number(text.replace(/,/g, ''));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
