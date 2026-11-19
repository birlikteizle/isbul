> **Sürüm 0.2.0 notu:** Aktif tarayıcılar `mobile/src/local/sources/` altındadır ve telefonda
> çalışır. `server/src/sources/` kopyası yalnızca opsiyonel merkezi mod içindir.

# Kaynaklar, Eşleştirme ve Yeni Kaynak Ekleme

## Kaynak adaptörleri

Her kaynak `server/src/sources/` altında bir dosyadır ve şu arayüzü uygular:

```ts
export interface SourceAdapter {
  source: JobSource;
  label: string;
  search(query: { city: string; profession: string }): Promise<SourceResult>;
}
```

| Dosya | Kaynak | Yöntem | Not |
|---|---|---|---|
| `kariyernet.ts` | Kariyer.net | `/is-ilanlari/{sehir}?kw={meslek}` HTML kartları | `data-test="ad-card"` öznitelikleri |
| `eleman.ts` | Eleman.net | `/is-ilanlari?aranan=...&arandi=e&sehir={plaka}` | İstanbul iki yakaya ayrılır |
| `iskur.ts` | İŞKUR | `/Istihdam/AcikIsMeslek.aspx?il={plaka}` gömülü JSON | Meslek bazlı açık iş sayısı |
| `kariyerkapisi.ts` | Kariyer Kapısı | `https://kariyerkapisi.gov.tr/RSS` | Resmî RSS, 5 dk önbellek |
| `secretcv.ts` | SecretCV | `/is-ilanlari?k=...&sh[]={plaka}` | Bot koruması; sık 500/410 |
| `company.ts` | Belediye/şirket | `config/company-pages.json` + CSS seçici | Yapılandırılabilir |

### Kariyer.net

- Şehir slug'ı Türkçe karakterlerden arındırılır: `Gaziantep → gaziantep`.
- Arama parametresi ASCII'ye çevrilir (`aşçı → asci`) çünkü site Türkçe karakterlerde tutarsız.
- HTML'deki `positionName`, `cityName`, `jobCode`, `time` öznitelikleri doğrudan okunur.
- Farklı şehirlerden gelen **sponsorlu** ilanlar şehir filtresiyle elenir.
- Sayfa başına ~50 ilan; şu an yalnızca 1. sayfa taranır.

### Eleman.net

- Arama formunun gerçek parametreleri: `aranan`, `arandi=e`, `sehir` (**plaka kodu**: Gaziantep=27).
- `sehir` alanına şehir adı yazmak filtreyi uygulamaz; mutlaka plaka kodu kullan.
- İlan kartları `id="ilan_id_..."` bloklarından ayrıştırılır.
- Konum "Gaziantep - Şahinbey" biçiminde gelir; ilçe ayrıca saklanır.

### İŞKUR

- Sayfa, açık iş sayılarını `ctl03$acikIsSayiJsonByMeslek` gizli alanında JSON olarak gömer.
- Örnek kayıt:

```json
{
  "MeslekKayitNo": 1440,
  "Meslek": "AŞÇI",
  "ToplamAcikIs": 109,
  "Iller": [{ "Il": "GAZİANTEP", "IlKayitNo": 27, "Ilceler": [{ "Ilce": "ŞAHİNBEY", "ToplamAcikIs": 12 }] }]
}
```

- **Önemli:** Bu bireysel ilan değil, meslek bazında toplam açık iş sayısıdır. Uygulama bunu
  “109 açık iş” rozetiyle gösterir.
- İŞKUR'un WAF'ı Node.js isteğini `Request Rejected` ile reddedebiliyor. Adaptör önce normal
  isteği dener, başarısız olursa **curl** ile tekrar dener. Bu yüzden sunucuda `curl` kurulu olmalı
  (Docker imajında kurulu).
- Sayfa boyutu il bazında büyür (İstanbul ~1.4 MB). 15 sn zaman aşımı vardır.

### Kariyer Kapısı

- `https://kariyerkapisi.gov.tr/RSS` adresi tüm aktif ilanları RSS olarak verir.
- Sorguya göre sunucu tarafı filtre (`?s=avukat`) çalışıyor ancak şehir filtresi (`?i=380`) çoğu
  zaman boş dönüyor. Bu yüzden besleme çekilip **yerelde** meslek ve şehir eşleştirmesi yapılır.
- Başlıkta şehir yoksa ilan “Türkiye geneli” kabul edilir ve şehir aramasında gösterilir.
- İlan linki `IlanDetay?i=GUID` biçimindedir.

### SecretCV

- Site yoğun bot koruması uyguluyor; aynı IP'den tekrarlanan isteklerde `410 Gone` / `500` döner.
- Adaptör hata toleranslıdır: sonuç gelmezse uyarı gösterilir, diğer kaynaklar etkilenmez.
- İleride resmî API/anlaşma ile değiştirilmesi önerilir.

## Eşleştirme ve tekilleştirme

1. **Şehir normalizasyonu:** `İstanbul(Avr.)`, `istanbul-avrupa`, `Gaziantep - Şahinbey` gibi
   varyasyonlar `norm()` ile sadeleştirilir.
2. **Meslek eşleştirmesi:** Türkçe karakterler ASCII'ye çevrilir, ekler toleranslı eşleşir
   (`aşçı` ~ `Aşçıbaşı`, `satış` ~ `Satış Danışmanı`). Tek harfli kelimeler yanlış eşleşmeyi
   önlemek için prefix kuralından muaftır.
3. **Tekilleştirme:** `başlık + şirket + şehir` parmak izi ile aynı ilan birden fazla kaynakta
   görünse bile tek kart gösterilir; `meta.alsoOn` alanında diğer kaynaklar tutulur.
4. **İlan kimliği:** `sha256(kaynak + hariciId)` → 24 karakter. Aynı ilan sonraki taramalarda
   aynı kimliği alır; bu sayede “yeni mi?” sorusu güvenilir yanıtlanır.
5. **Bildirim:** Yalnızca daha önce eşleşmemiş ilan kimlikleri bildirilir. Bir ilan silinip
   yeniden yayınlanırsa (aynı harici kimlik) tekrar bildirilmez.

## Bildirim gecikmesi

```
ilan yayınlandı → (0-5 dk) sunucu taraması → (1-3 sn) FCM → telefon
```

- Varsayılan: `SCAN_INTERVAL_MS=300000` (5 dk).
- Minimum önerilen: 120000 (2 dk). Daha sık tarama, siteler tarafından engellenme riskini artırır.
- “Anında” bildirim yalnızca kaynak webhook/API sunuyorsa mümkündür; mevcut kaynaklar sunmuyor.

## Yeni kaynak ekleme

1. `server/src/sources/yenikaynak.ts` oluştur:

```ts
import { fetchText } from '../http.js';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from './types.js';

export const yeniKaynakAdapter: SourceAdapter = {
  source: 'company', // JobSource tipine yeni değer ekle
  label: 'Yeni Kaynak',
  async search(query: SearchQuery): Promise<SourceResult> {
    const started = Date.now();
    const res = await fetchText(`https://ornek.com/ara?q=${encodeURIComponent(query.profession)}`);
    const items: JobHit[] = []; // HTML/JSON ayrıştır
    return { source: this.source, label: this.label, items, durationMs: Date.now() - started };
  },
};
```

2. `JobSource` tipine kaynağı ekle (`server/src/sources/types.ts`).
3. `server/src/sources/index.ts` içindeki `adapters` dizisine ekle.
4. `mobile/src/theme.ts` içine renk ve etiket ekle.
5. `npm run test:sources -- "Gaziantep" "aşçı"` ile test et.
6. Nazik ol: `fetchText` zaten host başına 1-2 sn aralık koyar, 5xx'te bir kez tekrar dener.

## Belediye / şirket sayfası ekleme

`server/config/company-pages.json`:

```json
{
  "pages": [
    {
      "name": "Gaziantep Büyükşehir Belediyesi",
      "url": "https://www.gaziantep.bel.tr/tr/basin/duyurular",
      "city": "Gaziantep",
      "itemSelector": "table tbody tr",
      "titleSelector": "td:nth-child(2)",
      "linkSelector": "a",
      "dateSelector": "td:nth-child(1)",
      "keywords": ["personel alım", "işçi alım", "sınav", "istihdam"]
    }
  ]
}
```

- `itemSelector`: her ilan/duyuru kartı.
- `titleSelector`: kart içindeki başlık. Boşsa kartın tüm metni kullanılır.
- `linkSelector`: kart içindeki link. Boşsa kartın kendisi `<a>` olmalı.
- `keywords`: başlık/kart metninde bunlardan biri yoksa ilan atlanır (belediye duyurularının
  çoğu imar ilanı olduğu için şart).
- `city`: sayfa belirli bir şehre aitse yaz. Boşsa arama şehri kullanılır.

> Belediye siteleri sık değişir; seçicileri tarayıcıda “Inspect” ile doğrula. Sayfa JavaScript ile
> yükleniyorsa bu adaptör çalışmaz; Playwright gerekir.

## Yasal ve etik not

- Taranan sayfalar herkese açık ilan listeleridir; kullanıcı hesabı gerektiren veya ödeme duvarı
  arkasındaki içerik çekilmez.
- İstek hızı düşük tutulur (`minGapMs`), aynı URL eşzamanlı tekilleştirilir.
- Uygulama ilanın tam metnini kopyalamaz; başlık/şirket/konum özeti gösterip **orijinal ilana
  yönlendirir**.
- Ticari kullanım, toplu veri saklama veya yeniden yayınlama öncesi ilgili sitenin kullanım
  şartlarından izin alınmalıdır.
- Kişisel veri (başvuru sahibi bilgisi) toplanmaz; yalnızca cihaz push token'ı ve kayıtlı arama
  metni saklanır.