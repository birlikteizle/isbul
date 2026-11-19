> **Sürüm 0.3.0 notu:** Bu klasördeki hazır APK **sunucusuz** çalışır. Aşağıdaki sunucu kurulumu
> yalnızca **opsiyonel merkezi mod** içindir; normal kullanımda gerekmez.
> Hazır APK: `D:\Projeler\IsBul\build\isbul-0.3.0-derin-arama.apk`

# Kurulum ve APK Üretimi

## 0. Gereksinimler

| Araç | Sürüm | Not |
|---|---|---|
| Node.js | **24+** (min. 22.5) | `node:sqlite` için |
| npm | 10+ | |
| Telefon | Android 8+ | |
| Wi-Fi | Aynı ağ | Yerel test için |

Node sürümünü kontrol et:

```powershell
node -v
```

## 1. Sunucuyu çalıştır

```powershell
cd server
npm install
copy .env.example .env
npm run dev
```

Beklenen çıktı:

```
Server listening at http://127.0.0.1:8787
Server listening at http://192.168.1.100:8787
Hazır: http://localhost:8787
```

Tarayıcıda `http://localhost:8787/health` → `{"ok":true,...}` görüyorsan sunucu hazır.

### Kaynakları test et

```powershell
npm run test:sources -- "Gaziantep" "satış"
```

Örnek çıktı:

```
✓ Kariyer.net       24 ilan
✓ Eleman.net         2 ilan
✓ İŞKUR              4 ilan
✓ Kariyer Kapısı     0 ilan
! SecretCV           0 ilan  → HTTP 500 (bot koruması)
```

### Tek seferlik tarama

Kayıtlı aramaları hemen taramak için:

```powershell
npm run scan
```

## 2. Telefonu sunucuya bağla

1. Bilgisayarda:

```powershell
ipconfig
```

Kablosuz ağ adaptöründeki **IPv4 Address** satırını al. Örn: `192.168.1.100`.

2. Windows Güvenlik Duvarı'nda Node.js'e **özel ağ** erişimi ver (ilk çalıştırmada sorulur).
   Soru gelmediyse yönetici PowerShell'de bir kez çalıştır:

```powershell
New-NetFirewallRule -DisplayName "IsBul API 8787" -Direction Inbound -LocalPort 8787 -Protocol TCP -Action Allow -Profile Private
```

3. Telefonun tarayıcısında `http://192.168.1.100:8787/health` adresini aç.
   Yanıt gelmiyorsa:

```powershell
# Port dinleniyor mu?
netstat -ano | findstr :8787
```

ve güvenlik duvarı kuralını kontrol et.

## 3. Mobil uygulamayı çalıştır

```powershell
cd mobile
npm install
npx expo start
```

- **Expo Go** ile QR'ı okut → arayüz açılır.
- **Ayarlar → Sunucu adresi** → `http://192.168.1.100:8787` → **Kaydet ve bağlan**.
- Üstteki rozet **“bağlı”** olmalı.

> Expo Go'da push bildirimi alınamaz. Bildirim testi için APK gerekir.
> APK'da Firebase yapılandırılmadıysa uygulama 15 dakikada bir arka planda sunucuyu kontrol eder
> ve yerel bildirim gösterir.

Android emülatör kullanıyorsan sunucu adresi `http://10.0.2.2:8787` olmalıdır (varsayılan).

## 4. APK üretimi

### Bu makinede hazır APK

`D:\Projeler\IsBul\build\isbul-0.1.0.apk` — imzalı, kurulabilir, arm64-v8a (modern Android telefonlar).
Telefona kopyala → aç → “bilinmeyen kaynaklara izin ver” → kur.

Varsayılan sunucu: `http://192.168.1.100:8787`. Değiştirmek için uygulamada **Ayarlar → Sunucu adresi**.

### Yeniden derleme (bu makinede kurulu araçlarla)

```powershell
$env:JAVA_HOME="D:\Android\jdk\jdk-17.0.21+9"
$env:ANDROID_HOME="D:\Android\sdk"
$env:ANDROID_SDK_ROOT="D:\Android\sdk"
$env:GRADLE_USER_HOME="D:\Android\gradle-home"
$env:EXPO_PUBLIC_API_URL="http://192.168.1.100:8787"
cd D:\Projeler\IsBul\mobile
npx expo prebuild -p android --clean --no-install
Set-Content android\local.properties "sdk.dir=D:\Android\sdk" -Encoding ascii
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
```

Çıktı: `mobile\android\app\build\outputs\apk\release\app-release.apk`

> Yalnızca `arm64-v8a` derlenir; dosya küçük kalır. Eski 32-bit telefonlar için
> `-PreactNativeArchitectures=armeabi-v7a` kullan veya parametreyi tamamen kaldır.

### Seçenek A — GitHub Actions (önerilen, ücretsiz)

1. Yeni bir GitHub reposu oluştur ve bu klasörü push et:

```powershell
git init
git add .
git commit -m "İşBul ilk sürüm"
git branch -M main
git remote add origin https://github.com/KULLANICI/isbul.git
git push -u origin main
```

2. GitHub → **Settings → Secrets and variables → Actions → New repository secret**
   - Ad: `GOOGLE_SERVICES_JSON`
   - Değer: Firebase'den indirdiğin `google-services.json` dosyasının **tüm içeriği**
   - (Push istemiyorsan bu adımı atlayabilirsin.)

3. **Actions → Android APK → Run workflow**.

4. Bitince **Artifacts → isbul-apk** dosyasını indir, ZIP'i aç, `app-release.apk` telefonuna kur.

> Telefonda “bilinmeyen kaynaklara izin ver” açık olmalı.

### Seçenek B — EAS Build (Expo hesabı)

```powershell
npm i -g eas-cli
eas login
cd mobile
eas build -p android --profile preview
```

İndirme linki konsolda çıkar. `preview` profili APK üretir.

### Seçenek C — Yerel derleme

Gereksinimler: **JDK 17** + **Android SDK** (platform 36, build-tools 36) + `ANDROID_HOME`.

```powershell
cd mobile
npx expo prebuild -p android
cd android
gradlew.bat assembleRelease
```

APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`

> İlk derleme Gradle bağımlılıkları nedeniyle uzun sürebilir. Windows'ta NDK/C++ araçları
> gerekiyorsa Android Studio ile “SDK Tools → NDK (Side by side) + CMake” kur.

### Üretim sunucusuna bağlı APK

APK'nın varsayılan sunucu adresini değiştirmek için derlemeden önce:

```powershell
$env:EXPO_PUBLIC_API_URL="https://isbul-api.onrender.com"
npx expo prebuild -p android --clean
```

veya GitHub Actions'da workflow'a ortam değişkeni ekle. Kullanıcı yine de Ayarlar'dan değiştirebilir.

## 5. Firebase (push) kurulumu

Ayrıntılı rehber: [`FIREBASE.md`](FIREBASE.md). Özet:

1. Firebase projesi aç.
2. Android uygulaması ekle: paket adı **`com.isbul.app`**.
3. `google-services.json` → `mobile/` klasörü.
4. Service account JSON → sunucuda `FIREBASE_SERVICE_ACCOUNT`.
5. Sunucuyu yeniden başlat, uygulamada **Ayarlar → Test bildirimi**.

## 6. Sık karşılaşılan sorunlar

| Belirti | Çözüm |
|---|---|
| “Sunucuya ulaşılamadı” | Aynı Wi-Fi? IP doğru? Güvenlik duvarı? `http://IP:8787/health` tarayıcıda açılıyor mu? |
| Sunucu açılışta `node:sqlite` hatası | Node 24+ kullan veya `node --experimental-sqlite dist/index.js` |
| Arama 20 sn sürüyor | Normal; SecretCV/İŞKUR yavaş. Sonuçlar 10 dk önbelleklenir. |
| Bildirim gelmiyor | Firebase anahtarı? `google-services.json`? Bildirim izni? Uygulama APK mı? Firebase yoksa 15 dk'lık arka plan kontrolünün çalışması için uygulamayı bir kez aç ve pil optimizasyonundan muaf tut. |
| SecretCV 0 sonuç | Site bot koruması uyguluyor; diğer kaynaklar çalışır. |
| APK “app not installed” | Eski sürümü kaldır; imza uyuşmazlığı olabilir. |
| `usesCleartextTraffic` | Yerel `http://` için açık. Üretimde HTTPS kullan. |

## 7. Veri ve yedekleme

Tüm veriler `server/.data/isbul.sqlite` içinde:

- cihazlar ve push token'ları
- kayıtlı aramalar
- görülen ilanlar ve eşleşmeler
- uygulama içi bildirim geçmişi

Yedeklemek için bu dosyayı kopyala. Silmek için sunucuyu durdurup `.data` klasörünü sil.