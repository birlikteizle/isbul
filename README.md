# İşBul — Sunucusuz İş İlanı Radarı

Şehir + meslek yazarsın; uygulama **Kariyer.net, Eleman.net, İŞKUR ve Kariyer Kapısı'nı doğrudan
telefonundan** tarar, sonuçları tek listede toplar ve yeni ilan çıktığında bildirim gönderir.

> **Bu sürüm sunucusuz çalışır.** Bilgisayar, sunucu, GitHub Actions, Firebase veya aylık ücret
> gerekmez. Tüm tarama ve bildirim mantığı APK'nın içindedir.

## 📱 APK

```
D:\Projeler\IsBul\build\isbul-0.2.0-sunucusuz.apk
```

- 20.8 MB · Android 7+ · arm64-v8a · imzalı, kurulabilir
- Paket: `com.isbul.app` · sürüm 0.2.0 (versionCode 2)

**Kurulum:** Dosyayı telefona kopyala → aç → “bilinmeyen kaynaklara izin ver” → kur → bildirim
iznini ver.

## Nasıl çalışıyor?

```
┌──────────────────────────── TELEFON ────────────────────────────┐
│  Ara ekranı                                                     │
│    └─ Kariyer.net / Eleman.net / İŞKUR / Kariyer Kapısı         │
│         (doğrudan HTTPS isteği, sunucu yok)                     │
│                                                                 │
│  Kayıtlı arama (AsyncStorage)                                   │
│    └─ görülen ilan kimlikleri                                   │
│                                                                 │
│  WorkManager (15 dk)                                            │
│    └─ yeni ilan var mı? → yerel Android bildirimi               │
└─────────────────────────────────────────────────────────────────┘
```

- **Arama:** Telefon doğrudan ilan sitelerine istek atar; tarayıcı CORS kuralları native uygulamada
  geçerli değildir.
- **Tekilleştirme:** Aynı ilan birden fazla kaynakta çıkarsa tek kart gösterilir.
- **Kayıt:** Şehir + meslek ve görülen ilan kimlikleri yalnızca telefonda saklanır.
- **Bildirim:** Android'in arka plan görevi (WorkManager) yaklaşık 15 dakikada bir kontrol eder.
  Uygulama kapalıyken de çalışır; sistem pil tasarrufu nedeniyle gecikebilir.

## Özellikler

- 🔎 Çok kaynaklı arama + tekilleştirme
- 📌 Sınırsız kayıtlı arama (telefonda)
- 🔔 Uygulama kapalıyken yerel bildirim
- 🔋 Pil optimizasyonundan muaf tutma önerisi
- 🌐 Sunucu/Firebase hesabı/aidat yok
- 🔒 Veriler telefondan dışarı çıkmaz (yalnızca ilan sitelerine istek gider)

## Kaynak durumu (bu makinede test edildi)

| Kaynak | Durum | Not |
|---|---|---|
| Kariyer.net | ✅ | `satış` → 23 ilan; ara sıra 403, otomatik tekrar deneme |
| Eleman.net | ✅ | `sehir={plaka}` + `aranan` |
| İŞKUR | ⚠️ | İlk istek çoğu zaman geçer; site koruması tekrar denemelerde engelleyebilir |
| Kariyer Kapısı | ✅ | Resmî RSS |
| SecretCV | ❌ | Bot koruması; kullanılmıyor |

> İŞKUR sonuçları meslek bazında “açık iş sayısı”dır (bireysel ilan kaydı değil).

## İlk kullanım

1. APK'yı kur, bildirim iznini ver.
2. **Ara** → şehir seç (örn. Gaziantep) → meslek yaz (örn. satış) → **İlanları ara**.
3. Sonuçları görünce **“Bu aramayı kaydet ve bildirim al”**.
4. Kaydederken o anki ilanlar “görüldü” işaretlenir; sadece sonradan çıkanlar bildirilir.
5. Telefon ayarlarında **İşBul → Pil → Kısıtlanmamış** yaparsan 15 dakikalık kontrol daha düzenli
   çalışır.

**Ayarlar → Şimdi kontrol et** ile elle de tarama başlatabilirsin.

## Sınırlar

- **Bildirim gecikmesi:** Android'in minimum arka plan aralığı **15 dakika**; pil tasarrufu bunu
  uzatabilir. Anında (1-3 sn) bildirim için Firebase + 7/24 sunucu gerekir (opsiyonel, aşağıda).
- **İnternet:** Telefonun interneti olmalı. Wi-Fi veya mobil veri fark etmez.
- **İŞKUR koruması:** Bazı operatörlerde/yoğun saatlerde yanıt vermeyebilir; diğer kaynaklar devam
  eder.
- **Kariyer.net hız limiti:** Çok sık arama yapılırsa geçici 403 olabilir; uygulama bir kez tekrar
  dener.
- **APK mimarisi:** arm64. Çok eski 32-bit telefon için `armeabi-v7a` ile yeniden derlenebilir.

## Geliştirme / yeniden derleme

```powershell
cd D:\Projeler\IsBul\mobile
npm install
npx expo prebuild -p android --clean --no-install
Set-Content android\local.properties "sdk.dir=D:\Android\sdk" -Encoding ascii
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
```

Bu makinede kurulu araçlar: JDK 17 (`D:\Android\jdk\...`), Android SDK (`D:\Android\sdk`),
Gradle önbelleği (`D:\Android\gradle-home`).

Klasörler:

```
mobile/src/local/        Telefonda çalışan tarayıcılar ve eşleştirme
mobile/src/local/sources Kariyer.net, Eleman.net, İŞKUR, Kariyer Kapısı
mobile/src/background.ts WorkManager görevi + yerel bildirim
mobile/src/screens/      Ara / Kayıtlı / Bildirim / Ayarlar
server/                  OPSİYONEL merkezi sunucu (kullanılmıyor)
docs/                    Kurulum, kaynaklar, opsiyonel sunucu/Firebase
```

## GitHub'a koymak (opsiyonel)

GitHub **kod saklar, sunucu çalıştırmaz**. Bu APK için GitHub'a ihtiyaç yok; yalnızca yedek/versiyon
kontrolü istersen:

```powershell
cd D:\Projeler\IsBul
git remote add origin https://github.com/KULLANICI/isbul.git
git push -u origin main
```

Repo oluşturduktan sonra bu komutları çalıştırman yeterli. `mobile/` klasörü GitHub Actions ile APK
üretmeye de hazırdır (`.github/workflows/android.yml`).

## Opsiyonel: merkezi sunucu modu

1-3 saniyelik bildirim veya çok kullanıcılı kullanım istersen `server/` klasöründeki Fastify + FCM
sunucusu hâlâ duruyor. Bir VPS/Render/Railway hesabı ve Firebase anahtarı gerekir. Ayrıntılar:
[`docs/YAYINA-ALMA.md`](docs/YAYINA-ALMA.md), [`docs/FIREBASE.md`](docs/FIREBASE.md).

## Yasal not

İlanlar herkese açık sayfalardan, düşük istek hızıyla okunur ve orijinal ilana yönlendirilir. Ticari
kullanım/veri yeniden yayınlama öncesi ilgili sitelerin kullanım şartlarını kontrol et. Bu proje
kişisel kullanım için bir başlangıç noktasıdır.