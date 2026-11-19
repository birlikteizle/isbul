import { scanAll } from './services/scheduler.js';

const log = {
  info: (...args: unknown[]) => console.log('[info]', ...args),
  warn: (...args: unknown[]) => console.warn('[warn]', ...args),
  error: (...args: unknown[]) => console.error('[error]', ...args),
};

const summary = await scanAll(log);
console.log(JSON.stringify(summary, null, 2));