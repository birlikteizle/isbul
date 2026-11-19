import { fetchText, curlText, decodeEntities } from '../http.js';
import { findCity } from '../cities.js';
import { matchesText, norm } from '../text.js';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from './types.js';

const BASE = 'https://esube.iskur.gov.tr';

interface IskurDistrict {
  Ilce?: string;
  ToplamAcikIs?: number;
}

interface IskurProvince {
  Il?: string;
  IlKayitNo?: number;
  ToplamAcikIs?: number;
  Ilceler?: IskurDistrict[];
}

interface IskurOccupation {
  MeslekKayitNo?: number;
  Meslek?: string;
  ToplamAcikIs?: number;
  Iller?: IskurProvince[];
}

export function parseIskur(html: string, cityName: string): JobHit[] {
  const inputTag = html.match(/<input[^>]*acikIsSayiJsonByMeslek[^>]*>/)?.[0];
  if (!inputTag) return [];

  const valueMatch = inputTag.match(/value="([^"]*)"/);
  if (!valueMatch) return [];

  let data: IskurOccupation[];
  try {
    data = JSON.parse(decodeEntities(valueMatch[1])) as IskurOccupation[];
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const items: JobHit[] = [];

  for (const row of data) {
    const occupation = (row.Meslek ?? '').trim();
    if (!occupation) continue;
    const count = Number(row.ToplamAcikIs ?? 0);
    if (!Number.isFinite(count) || count <= 0) continue;

    // İl bazlı sayfa zaten filtrelenmiş geliyor; yine de İl kaydı varsa doğrula.
    const province = row.Iller?.find((p) => norm(p.Il) === norm(cityName));
    if (province && Number(province.ToplamAcikIs ?? 0) > 0 && Number(province.ToplamAcikIs) !== count) {
      // Bu meslek için istenen ildeki sayıyı kullan.
      if (Number(province.ToplamAcikIs) <= 0) continue;
    }

    const finalCount = province && Number(province.ToplamAcikIs) > 0 ? Number(province.ToplamAcikIs) : count;
    const districts = (province?.Ilceler ?? row.Iller?.[0]?.Ilceler ?? [])
      .filter((d) => Number(d.ToplamAcikIs ?? 0) > 0 && d.Ilce)
      .sort((a, b) => Number(b.ToplamAcikIs ?? 0) - Number(a.ToplamAcikIs ?? 0))
      .slice(0, 4)
      .map((d) => `${d.Ilce} (${Number(d.ToplamAcikIs)})`);

    items.push({
      source: 'iskur',
      externalId: `meslek-${row.MeslekKayitNo ?? norm(occupation).replace(/\s+/g, '-')}`,
      title: occupation,
      company: 'İŞKUR',
      city: cityName,
      url: `${BASE}/Istihdam/AcikIsMeslek.aspx?il=${findCity(cityName)?.plate ?? ''}`,
      description:
        `${cityName} genelinde ${finalCount} açık iş` +
        (districts.length ? ` · Öne çıkan ilçeler: ${districts.join(', ')}` : ''),
      postedAt: null,
      postedAgo: null,
      meta: {
        kind: 'iskur-openings',
        count: finalCount,
        districts: districts.map((d) => d.replace(/\s*\(\d+\)$/, '')),
        note: 'İŞKUR açık iş sayısı (bireysel ilan kaydı değil)',
      },
    });
  }

  return items;
}

export const iskurAdapter: SourceAdapter = {
  source: 'iskur',
  label: 'İŞKUR',
  async search(query: SearchQuery): Promise<SourceResult> {
    const started = Date.now();
    const city = findCity(query.city);
    if (!city) {
      return { source: this.source, label: this.label, items: [], warning: 'Geçersiz şehir', durationMs: 0 };
    }

    try {
      const url = `${BASE}/Istihdam/AcikIsMeslek.aspx?il=${city.plate}`;
      let res = await fetchText(url, { minGapMs: 1_800, timeoutMs: 15_000 });

      // İŞKUR'un WAF'ı Node/TLS imzasını reddedebiliyor; bu durumda curl ile tekrar dene.
      if (!res.ok || res.text.length < 2_000 || res.text.includes('Request Rejected')) {
        // WAF bazen ilk isteği reddediyor; kısa bir bekleme sonrası curl ile tekrar dene.
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        res = await curlText(url, { timeoutMs: 20_000 });
      }
      if (!res.ok) {
        return {
          source: this.source,
          label: this.label,
          items: [],
          warning: `İŞKUR HTTP ${res.status}`,
          durationMs: Date.now() - started,
        };
      }

      const all = parseIskur(res.text, city.name);
      const matched = all
        .filter((item) => matchesText(item.title, query.profession))
        .sort((a, b) => Number(b.meta?.count ?? 0) - Number(a.meta?.count ?? 0))
        .slice(0, 15);

      return {
        source: this.source,
        label: this.label,
        items: matched,
        warning: matched.length === 0 ? 'İŞKUR: bu meslekte kayıtlı açık iş görünmüyor' : undefined,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        source: this.source,
        label: this.label,
        items: [],
        warning: `İŞKUR hatası: ${(error as Error).message}`,
        durationMs: Date.now() - started,
      };
    }
  },
};