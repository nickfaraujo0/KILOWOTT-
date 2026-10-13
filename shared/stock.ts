export const LOW_STOCK = 5; // units at or below this count as low stock
export type StockState = 'untracked' | 'out' | 'low' | 'ok';
export const stockState = (stock: number | null | undefined): StockState =>
  stock == null ? 'untracked' : stock <= 0 ? 'out' : stock <= LOW_STOCK ? 'low' : 'ok';
