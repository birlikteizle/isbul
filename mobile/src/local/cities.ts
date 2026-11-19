export interface City {
  name: string;
  plate: number;
  slug: string;
  aliases?: string[];
}

const RAW: Array<[string, number, string[]?]> = [
  ['Adana', 1],
  ['Adıyaman', 2],
  ['Afyonkarahisar', 3, ['afyon']],
  ['Ağrı', 4],
  ['Amasya', 5],
  ['Ankara', 6],
  ['Antalya', 7],
  ['Artvin', 8],
  ['Aydın', 9],
  ['Balıkesir', 10],
  ['Bilecik', 11],
  ['Bingöl', 12],
  ['Bitlis', 13],
  ['Bolu', 14],
  ['Burdur', 15],
  ['Bursa', 16],
  ['Çanakkale', 17],
  ['Çankırı', 18],
  ['Çorum', 19],
  ['Denizli', 20],
  ['Diyarbakır', 21],
  ['Edirne', 22],
  ['Elazığ', 23],
  ['Erzincan', 24],
  ['Erzurum', 25],
  ['Eskişehir', 26],
  ['Gaziantep', 27, ['antep']],
  ['Giresun', 28],
  ['Gümüşhane', 29],
  ['Hakkari', 30, ['hakkâri']],
  ['Hatay', 31, ['antakya']],
  ['Isparta', 32],
  ['Mersin', 33, ['icel']],
  ['İstanbul', 34, ['istanbul']],
  ['İzmir', 35, ['izmir']],
  ['Kars', 36],
  ['Kastamonu', 37],
  ['Kayseri', 38],
  ['Kırklareli', 39],
  ['Kırşehir', 40],
  ['Kocaeli', 41, ['izmit']],
  ['Konya', 42],
  ['Kütahya', 43],
  ['Malatya', 44],
  ['Manisa', 45],
  ['Kahramanmaraş', 46, ['maras']],
  ['Mardin', 47],
  ['Muğla', 48],
  ['Muş', 49],
  ['Nevşehir', 50],
  ['Niğde', 51],
  ['Ordu', 52],
  ['Rize', 53],
  ['Sakarya', 54, ['adapazari']],
  ['Samsun', 55],
  ['Siirt', 56],
  ['Sinop', 57],
  ['Sivas', 58],
  ['Tekirdağ', 59],
  ['Tokat', 60],
  ['Trabzon', 61],
  ['Tunceli', 62],
  ['Şanlıurfa', 63, ['urfa']],
  ['Uşak', 64],
  ['Van', 65],
  ['Yozgat', 66],
  ['Zonguldak', 67],
  ['Aksaray', 68],
  ['Bayburt', 69],
  ['Karaman', 70],
  ['Kırıkkale', 71],
  ['Batman', 72],
  ['Şırnak', 73],
  ['Bartın', 74],
  ['Ardahan', 75],
  ['Iğdır', 76],
  ['Yalova', 77],
  ['Karabük', 78],
  ['Kilis', 79],
  ['Osmaniye', 80],
  ['Düzce', 81],
];

const TR_MAP: Record<string, string> = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
  ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
  â: 'a', Â: 'a', î: 'i', Î: 'i', û: 'u', Û: 'u',
};

export function toAsciiTr(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛ]/g, (ch) => TR_MAP[ch] ?? ch);
}

export function slugify(value: string): string {
  return toAsciiTr(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const CITIES: City[] = RAW.map(([name, plate, aliases]) => ({
  name,
  plate,
  slug: slugify(name),
  aliases,
}));

const BY_KEY = new Map<string, City>();
for (const city of CITIES) {
  BY_KEY.set(city.slug, city);
  BY_KEY.set(String(city.plate), city);
  for (const alias of city.aliases ?? []) BY_KEY.set(slugify(alias), city);
}

export function findCity(input: string | undefined | null): City | null {
  if (!input) return null;
  return BY_KEY.get(slugify(input)) ?? null;
}

export function sourceSlugs(city: City, source: 'kariyernet' | 'eleman'): string[] {
  if (city.plate === 34 && source === 'eleman') return ['istanbul-anadolu', 'istanbul-avrupa'];
  return [city.slug];
}