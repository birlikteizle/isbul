import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchText, absoluteUrl } from '../http.js';
import { findCity } from '../cities.js';
import { matchesText } from '../text.js';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from './types.js';

/**
 * Belediye / şirket kariyer sayfaları için yapılandırma tabanlı adaptör.
 * server/config/company-pages.json içindeki her kayıt bir sayfayı tarif eder.
 */
interface CompanyPageConfig {
  name: string;
  url: string;
  city?: string;
  itemSelector: string;
  titleSelector?: string;
  linkSelector?: string;
  dateSelector?: string;
  /** İlan sayfasına girmeden önce başlıkta aranacak zorunlu kelimeler */
  keywords?: string[];
}

interface CompanyConfigFile {
  pages: CompanyPageConfig[];
}

function loadConfig(): CompanyPageConfig[] {
  const candidates = [
    path.resolve(process.cwd(), 'config/company-pages.json'),
    path.resolve(process.cwd(), 'server/config/company-pages.json'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CompanyConfigFile;
      return Array.isArray(parsed.pages) ? parsed.pages : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const companyAdapter: SourceAdapter = {
  source: 'company',
  label: 'Belediye / Şirket',
  async search(query: SearchQuery): Promise<SourceResult> {
    const started = Date.now();
    const city = findCity(query.city);
    const configs = loadConfig().filter((p) => !p.city || !city || p.city === city.name);
    if (configs.length === 0) {
      return {
        source: this.source,
        label: this.label,
        items: [],
        warning: undefined,
        durationMs: 0,
      };
    }

    const items: JobHit[] = [];
    const warnings: string[] = [];

    for (const config of configs) {
      try {
        const res = await fetchText(config.url, { minGapMs: 2_000 });
        if (!res.ok) {
          warnings.push(`${config.name}: HTTP ${res.status}`);
          continue;
        }
        const $ = cheerio.load(res.text);
        const nodes = $(config.itemSelector);

        nodes.each((index, element) => {
          const node = $(element);
          const title = (config.titleSelector ? node.find(config.titleSelector).first().text() : node.text())
            .replace(/\s+/g, ' ')
            .trim();
          if (!title || !matchesText(title, query.profession)) return;

          const keywordOk =
            !config.keywords ||
            config.keywords.length === 0 ||
            config.keywords.some((k) => matchesText(`${title} ${node.text()}`, k));
          if (!keywordOk) return;

          const href = config.linkSelector
            ? node.find(config.linkSelector).first().attr('href') ?? node.attr('href')
            : node.attr('href') ?? node.find('a').first().attr('href');
          if (!href) return;

          const dateText = config.dateSelector ? node.find(config.dateSelector).first().text().trim() : '';

          items.push({
            source: 'company',
            externalId: `${config.name}-${href}`,
            title,
            company: config.name,
            city: config.city ?? city?.name,
            url: absoluteUrl(config.url, href),
            postedAt: dateText && !Number.isNaN(new Date(dateText).getTime()) ? new Date(dateText).toISOString() : null,
            postedAgo: dateText || null,
            meta: { page: config.name },
          });
        });
      } catch (error) {
        warnings.push(`${config.name}: ${(error as Error).message}`);
      }
    }

    return {
      source: this.source,
      label: this.label,
      items: items.slice(0, 30),
      warning: warnings.length ? warnings.join(' · ') : undefined,
      durationMs: Date.now() - started,
    };
  },
};