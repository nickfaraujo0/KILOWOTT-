// Prices are in Indian rupees (INR), matching the WooCommerce store currency.
const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const money = (v: string | number) => (Number(v) > 0 ? fmt.format(Number(v)) : '—');
export const CURRENCY_LABEL = 'INR (₹)';
