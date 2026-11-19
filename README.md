# İşBul

Şehir + meslek yazarsın; Türkiye'deki iş ilanı kaynaklarını tarar, sonuçları tek listede toplar ve
**yeni bir ilan çıktığında telefonuna bildirim gönderir.** Uygulama kapalıyken bile bildirim gelir.

> Örnek: **Gaziantep + satış** → Kariyer.net, Eleman.net, İŞKUR ve Kariyer Kapısı taranır;
> kaydettiğin arama için yeni ilan görüldüğünde FCM üzerinden push gider.

---

## Ne yapıyor?

- 🔎 **Çok kaynaklı arama:** Kariyer.net, Eleman.net, İŞKUR, Kariyer Kapısı (RSS) ve yapılandırılabilir
  belediye/şirket sayfaları.
- 🧹 **Tekilleştirme:** Aynı ilan birden fazla kaynakta çıkarsa bir kez gösterilir.
- 📌 **Kayıtlı arama:** Şehir + meslek kombinasyonunu kaydeder.
- 🔔 **Push bildirimi:** Sunucu her 5 dakikada bir tarar; yeni ilanı FCM ile gönderir.
  Uygulama kapalıyken de Android bildirim panelinde görünür.
- 🔁 **Firebase'siz yedek:** FCM yapılandırılmadıysa uygulama 15 dakikada bir arka planda
  sunucuyu kontrol eder ve yerel bildirim gösterir.
- 📴 **Çevrimdışı liste:** Bildirimler ayrıca uygulama içinde saklanır.
- 🧩 **Kolay kaynak ekleme:** Yeni site adaptörü veya CSS seçici tabanlı şirket sayfası eklenebilir.

## Mimari

```
┌─────────────────────┐        HTTP/JSON        ┌──────────────────────────┐
│  Android (Expo RN)  │ ◄─────────────────────► │  Node + Fastify API      │
│  - Ara / Kaydet     │                         │  - /api/jobs             │
│  - Bildirimler      │                         │  - /api/searches         │
│  - Ayarlar          │                         │  - /api/notifications    │
└─────────┬───────────┘                         └────────────┬─────────────┘
          │ FCM push                                         │ 5 dk'da bir
          ▼                                                  ▼
┌─────────────────────┐                         ┌──────────────────────────┐
│  Firebase Cloud     │ ◄────── bildirim ─────── │  Zamanlayıcı + Scraper   │
│  Messaging (FCM)    │                         │  Kariyer.net · Eleman    │
└─────────────────────┘                         │  İŞKUR · Kariyer Kapısı  │
                                                │  SecretCV · Şirket pages │
                                                └────────────┬─────────────┘
                                                             ▼
                                                   SQLite (.data/isbul.sqlite)
```

**Neden sunucu?** Telefon kapalıyken/uykudayken site taramak mümkün değil. Bu yüzden tarama
sunucuda yapılır, bildirim FCM ile telefona iletilir.

## Kaynak durumu (bu makinede test edildi)

| Kaynak | Durum | Yöntem |
|---|---|---|
| Kariyer.net | ✅ | Şehir sayfası + `kw` parametresi, HTML kartları |
| Eleman.net | ✅ | `aranan` + `sehir` parametreleri, HTML kartları |
| İŞKUR | ✅ | `AcikIsMeslek.aspx?il=27` gömülü JSON (meslek bazlı açık iş sayısı) |
| Kariyer Kapısı | ✅ | Resmî RSS beslemesi |
| SecretCV | ⚠️ | Bot koruması nedeniyle sık sık HTTP 500/410; hata toleranslı |
| Belediye / şirket | ⚙️ | `server/config/company-pages.json` ile eklenir |

> İŞKUR, bireysel ilan kaydı yerine **meslek bazında açık iş sayısı** verir (örn. "AŞÇI — 109 açık iş").
> Diğer kaynaklar gerçek ilan başlığı ve orijinal ilan linki verir.

## Hızlı başlangıç

### 1) Sunucu

```powershell
cd server
npm install
copy .env.example .env
npm run dev
```

Sunucu: `http://localhost:8787` · Sağlık kontrolü: `GET /health`

Tek seferlik kaynak testi:

```powershell
npm run test:sources -- "Gaziantep" "satış"
```

### 2) Telefon

1. Bilgisayar ve telefon **aynı Wi-Fi** ağında olmalı.
2. Bilgisayarın IPv4 adresini bul: `ipconfig`
3. `cd mobile && npm install`
4. `npx expo start`
5. Telefonda **Expo Go** ile QR'ı okut (arayüz testi için).
6. Uygulamada **Ayarlar → Sunucu adresi** alanına `http://BILGISAYAR_IP:8787` yaz.

> Expo Go'da push bildirimi çalışmaz (FCM native yapılandırması gerekir). Bildirimli sürüm için
> aşağıdaki APK adımlarını izle.

### 3) Bildirimli APK

**Bu makinede hazır APK:** `D:\Projeler\IsBul\build\isbul-0.1.0.apk` (20.8 MB, arm64-v8a).
Telefona kopyalayıp kur; uygulama varsayılan olarak `http://192.168.1.100:8787` sunucusuna bağlanır.
IP değişirse **Ayarlar** ekranından güncelle.

- **GitHub Actions (önerilen):** Repoyu GitHub'a at → **Actions → Android APK → Run workflow** →
  artifact olarak `isbul-apk` indir. `GOOGLE_SERVICES_JSON` secret'ı eklenirse push hazır olur.
- **EAS Build:** `npm i -g eas-cli && eas login && cd mobile && eas build -p android --profile preview`
- **Yerel:** JDK 17 + Android SDK kurulu olmalı:
  `cd mobile && npx expo prebuild -p android && cd android && gradlew.bat assembleRelease`

> Yerel derlemede bu makinede `D:\Android\jdk\jdk-17.0.21+9` ve `D:\Android\sdk` kullanıldı.
> Tek komutla yeniden üretmek için `docs/KURULUM.md` → “Hazır APK / yeniden derleme”.

Ayrıntılı adımlar: [`docs/KURULUM.md`](docs/KURULUM.md) · [`docs/FIREBASE.md`](docs/FIREBASE.md)

## Klasör yapısı

```
server/
  src/sources/       Kaynak adaptörleri (kariyernet, eleman, iskur, kariyerkapisi, secretcv, company)
  src/services/      Arama, zamanlayıcı, FCM bildirimi
  src/routes/        HTTP API
  config/            Şirket/belediye sayfası tanımları
mobile/
  App.tsx            Ana uygulama (4 sekme)
  src/screens/       Ara, Kayıtlı, Bildirimler, Ayarlar
docs/
  KURULUM.md         Adım adım kurulum + APK
  FIREBASE.md        FCM kurulumu
  KAYNAKLAR.md       Kaynaklar, eşleştirme, yeni kaynak ekleme
  YAYINA-ALMA.md     Sunucu deploy seçenekleri
```

## Önemli sınırlar

- **“Anlık” bildirim = 2-5 dakika gecikme.** Hiçbir iş sitesi yeni ilan için webhook/API vermediği
  için sunucu periyodik tarar. `SCAN_INTERVAL_MS` ile değiştirilebilir (minimum 60 sn).
- **Kapalı uygulama bildirimi** için sunucunun 7/24 çalışması ve Firebase'in yapılandırılmış olması
  gerekir. Ücretsiz katmanlar uykuya geçebilir; gerçek 7/24 için küçük bir sunucu (Render Starter,
  VPS vb.) gerekir.
- **Site kullanım şartları:** İlanlar herkese açık sayfalardan, düşük istek hızıyla ve orijinal
  siteye yönlendirilerek okunur. Ticari kullanım/veri yeniden yayınlama öncesi ilgili sitelerin
  şartlarını kontrol et. Bu proje kişisel kullanım için bir başlangıç noktasıdır.
- **SecretCV** bot koruması nedeniyle kararsızdır; sonuç gelmezse diğer kaynaklar çalışmaya devam eder.

## Yol haritası

- [ ] İŞKUR açık iş sayısı arttığında “sayı arttı” bildirimi
- [ ] İlçe bazlı filtreleme
- [ ] İlanı favorilere ekleme / başvuru takibi
- [ ] Belediye ve şirket kariyer sayfaları için hazır tanımlar
- [ ] iOS derlemesi

## Lisans

Kişisel kullanım için geliştirildi. Üçüncü taraf sitelerin içerik ve kullanım şartları kendilerine
aittir.