export type Attribute = { name: string; value: string };

export type Product = {
  id: number;
  name: string;
  sku: string;
  description: string;
  shortDescription: string;
  price: string;
  category: string;
  attributes: Attribute[];
  imageUrl?: string;
  stock?: number | null; // null/undefined = stock not tracked
  syncStatus: 'synced' | 'modified' | 'error' | 'never';
  lastSyncedAt?: string;
};

export type Suggestion = {
  field: 'description' | 'shortDescription' | 'category' | 'attribute' | 'sku' | 'price' | 'imageUrl';
  attributeName?: string;
  value: string | null;
  source: 'existing_data' | 'inferred' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  question?: string;
  status: 'pending' | 'accepted' | 'rejected';
};

export type QualityIssue = { check: string; message: string };
export type QualityResult = {
  score: number; // 0-100
  band: 'Good' | 'Needs work' | 'Poor';
  issues: QualityIssue[];
};

const hasAttr = (p: Product, n: string) =>
  p.attributes.some((a) => a.name.toLowerCase() === n && a.value.trim() !== '');

export function scoreProduct(p: Product): QualityResult {
  const checks: [string, boolean, string][] = [
    ['SKU', p.sku.trim() !== '', 'Add a SKU'],
    ['Name', p.name.trim().length >= 3, 'Give the product a name of at least 3 characters'],
    ['Description', p.description.trim().length >= 80, 'Add a description of at least 80 characters'],
    ['Short description', p.shortDescription.trim() !== '', 'Add a short description'],
    ['Price', Number(p.price) > 0, 'Set a price greater than 0'],
    ['Category', p.category.trim() !== '', 'Assign a category'],
    [
      'Attributes',
      hasAttr(p, 'material') && p.attributes.filter((a) => a.value.trim() !== '').length >= 2,
      'Add a material and at least one more attribute',
    ],
    ['Image', !!p.imageUrl, 'Add at least one image'],
  ];
  const passed = checks.filter((c) => c[1]).length;
  const score = Math.round((passed / checks.length) * 100);
  return {
    score,
    band: score >= 85 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor',
    issues: checks.filter((c) => !c[1]).map((c) => ({ check: c[0], message: c[2] })),
  };
}
