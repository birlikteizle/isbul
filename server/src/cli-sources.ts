import { runSearch } from './services/search.js';
import { findCity } from './cities.js';

const cityInput = process.argv[2] ?? 'Gaziantep';
const profession = process.argv[3] ?? 'aşçı';
const city = findCity(cityInput);

if (!city) {
  console.error(`Şehir bulunamadı: ${cityInput}`);
  process.exit(1);
}

console.log(`\nAranıyor: ${city.name} · ${profession}\n`);
const result = await runSearch({ city: city.name, profession }, { fresh: true, persist: false });

for (const source of result.sources) {
  console.log(
    `${source.ok ? '✓' : '!'} ${source.label.padEnd(16)} ${String(source.count).padStart(3)} ilan  (${source.durationMs} ms)${
      source.warning ? `  → ${source.warning}` : ''
    }`,
  );
}

console.log(`\nToplam ${result.items.length} kayıt (${result.tookMs} ms)\n`);

for (const item of result.items.slice(0, 12)) {
  console.log(`- [${item.source}] ${item.title}`);
  console.log(`  ${item.company ?? '—'} · ${item.city ?? '—'}${item.postedAgo ? ` · ${item.postedAgo}` : ''}`);
  console.log(`  ${item.url}`);
  if (item.meta?.count) console.log(`  açık iş: ${item.meta.count}`);
}