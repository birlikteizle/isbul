export { kariyerNetAdapter } from './kariyernet.js';
export { elemanAdapter } from './eleman.js';
export { secretCvAdapter } from './secretcv.js';
export { iskurAdapter } from './iskur.js';
export { kariyerKapisiAdapter } from './kariyerkapisi.js';
export { companyAdapter } from './company.js';

import { kariyerNetAdapter } from './kariyernet.js';
import { elemanAdapter } from './eleman.js';
import { secretCvAdapter } from './secretcv.js';
import { iskurAdapter } from './iskur.js';
import { kariyerKapisiAdapter } from './kariyerkapisi.js';
import { companyAdapter } from './company.js';
import type { SourceAdapter } from './types.js';

export const adapters: SourceAdapter[] = [
  kariyerNetAdapter,
  elemanAdapter,
  iskurAdapter,
  kariyerKapisiAdapter,
  secretCvAdapter,
  companyAdapter,
];

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  adapters.map((adapter) => [adapter.source, adapter.label]),
);