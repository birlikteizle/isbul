import { fetchText, decodeEntities } from '../http';
import { findCity } from '../cities';
import { matchesText, norm } from '../text';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from '../types';

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

    const province = row.Iller?.find((p) => norm(p.Il) === norm(cityName));
    const finalCount =
      province && Number(province.ToplamAcikIs) > 0 ? Number(province.ToplamAcikIs) : count;

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
      const res = await fetchText(url, { timeoutMs: 20_000 });

      if (!res.ok || res.text.length < 2_000 || res.text.includes('Request Rejected')) {
        return {
          source: this.source,
          label: this.label,
          items: [],
          warning: 'İŞKUR bu cihazdan yanıt vermedi (site koruması). Diğer kaynaklar çalışıyor.',
          durationMs: Date.now() - started,
        };
      }

      const matched = parseIskur(res.text, city.name)
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