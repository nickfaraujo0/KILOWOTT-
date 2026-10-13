import type { Product } from '../../../shared/quality.ts';

export const COLUMNS = ['sku', 'name', 'price', 'category', 'stock', 'description', 'short_description', 'image_url', 'attributes', 'id'] as const;

// Cells that start with = + - @ can run as formulas in Excel; a leading ' makes them plain text.
const FORMULA = /^[=+\-@\t\r]/;
const safe = (s: string) => (FORMULA.test(s) ? "'" + s : s);
export const unsafe = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

const cell = (v: string) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

// Attributes are written as "Name: Value | Name: Value".
export const attrsToText = (a: Product['attributes']) => a.map((x) => `${x.name}: ${x.value}`).join(' | ');
export function textToAttrs(t: string) {
  return t.split('|').map((part) => {
    const i = part.indexOf(':');
    return i < 0 ? null : { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() };
  }).filter((a): a is { name: string; value: string } => !!a && !!a.name && !!a.value);
}

export function toCsv(products: Product[]) {
  const rows = products.map((p) => [p.sku, p.name, p.price, p.category, p.stock == null ? '' : String(p.stock), p.description, p.shortDescription, p.imageUrl ?? '', attrsToText(p.attributes), p.id > 0 && p.id < 9000 ? String(p.id) : '']
    .map((v, i) => cell(i === 2 || i === 4 || i === 9 ? v : safe(v))));
  return '﻿' + [COLUMNS.join(','), ...rows.map((r) => r.join(','))].join('\r\n') + '\r\n';
}

// RFC 4180 parser: quoted fields, escaped quotes, newlines inside quotes.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = []; let row: string[] = []; let f = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += c;
  }
  if (q) throw new Error('The CSV has an opening quote that is never closed.');
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
