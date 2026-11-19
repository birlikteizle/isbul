# Firebase Cloud Messaging (FCM) Kurulumu

Bu adımlar, **uygulama kapalıyken bile** anında bildirim almanın en iyi yoludur. Firebase'in
ücretsiz (Spark) planı FCM için yeterlidir.

> Firebase zorunlu değildir: yapılandırılmadığında uygulama 15 dakikada bir arka planda sunucuyu
> kontrol eder ve yerel bildirim gösterir. FCM ile bu gecikme 1-3 saniyeye iner.

## 1. Firebase projesi oluştur

1. https://console.firebase.google.com → **Add project**
2. İsim: `isbul` (istediğin ad)
3. Google Analytics'i kapatabilirsin.

## 2. Android uygulamasını ekle

1. Proje ana sayfasında **Android** simgesine tıkla.
2. **Android package name:** `com.isbul.app` (tam olarak bu olmalı)
3. Uygulama adı: `İşBul`
4. **google-services.json** dosyasını indir.
5. Dosyayı şuraya koy:

```
D:\Projeler\IsBul\mobile\google-services.json
```

> Paket adını değiştirirsen `mobile/app.json` içindeki `android.package` ile aynı olmalı.
> Dosyayı repoya **commit etme** (`.gitignore`'da). GitHub Actions için secret olarak ekle.

## 3. Sunucuya servis hesabı anahtarı ver

1. Firebase Console → ⚙️ **Project settings** → **Service accounts**
2. **Generate new private key** → JSON dosyası iner.
3. Anahtarı sunucuya tanıt. İki yol var:

### A) JSON içeriğini doğrudan yaz (yerel geliştirme)

`server/.env`:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"isbul-xxxx","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-...@isbul-xxxx.iam.gserviceaccount.com",...}
```

Tek satır olmalı. JSON içindeki `\n` karakterleri korunmalı.

### B) Base64 olarak yaz (önerilen)

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\yol\service-account.json")) |
  Set-Clipboard
```

`server/.env`:

```env
FIREBASE_SERVICE_ACCOUNT=BURAYA_BASE64
```

### C) Render / VPS

Render panelinde **Environment → FIREBASE_SERVICE_ACCOUNT** alanına base64 değeri yapıştır.
Docker/VPS'te `.env` dosyasına ekle.

## 4. Sunucuyu yeniden başlat

```powershell
cd server
npm run dev
```

Logda şunu görmelisin:

```
Firebase push hazır.
```

Görmüyorsan anahtar hatalıdır; logdaki `Firebase başlatılamadı: ...` mesajına bak.

## 5. APK'yı yeniden derle

`google-services.json` olmadan derlenen APK'da FCM token alınamaz. Dosyayı ekledikten sonra:

- GitHub Actions: `GOOGLE_SERVICES_JSON` secret'ını ekle ve workflow'u çalıştır.
- Yerel: `npx expo prebuild -p android --clean` + Gradle.
- EAS: dosya `mobile/` içinde olduğu için otomatik dahil edilir (`.gitignore` nedeniyle EAS'a
  yüklenmesi için `eas secret` veya `.easignore` ayarı gerekebilir).

## 6. Test et

1. Uygulamayı aç, bildirim iznini ver.
2. **Ayarlar** ekranında:
   - Sunucu: **bağlı**
   - Push altyapısı: **Firebase bağlı**
   - FCM token: dolu
3. **Test bildirimi gönder** → birkaç saniye içinde bildirim gelmeli.
4. Uygulamayı tamamen kapat (son uygulamalardan kaydır) → tekrar test et.
   Bildirim yine gelmelidir.

## 7. Nasıl çalışıyor?

1. Uygulama açılırken `Notifications.getDevicePushTokenAsync()` ile FCM token alır.
2. Token `POST /api/devices` ile sunucuya kaydedilir.
3. Zamanlayıcı yeni ilan bulunca `firebase-admin` ile şu mesajı gönderir:

```json
{
  "token": "...",
  "notification": { "title": "Gaziantep · satış", "body": "3 yeni ilan: Satış Uzmanı — ..." },
  "android": { "priority": "high", "notification": { "channelId": "isbul_jobs" } }
}
```

4. Android sistem bildirimi uygulama kapalıyken de gösterir.

## 8. Sorun giderme

| Hata | Neden |
|---|---|
| `Firebase push hazır` yok | `FIREBASE_SERVICE_ACCOUNT` boş/bozuk; JSON'u tek satır yap |
| `Push altyapısı: yapılandırılmadı` | Sunucu anahtarı okumadı; yeniden başlat |
| `FCM token: Alınamadı` | APK'da `google-services.json` yok veya paket adı yanlış |
| `messaging/registration-token-not-registered` | Uygulama silinmiş/yeniden kurulmuş; yeni token otomatik kaydedilir |
| Bildirim geliyor ama ses yok | Kanal ayarı; Android Ayarlar → Uygulamalar → İşBul → Bildirimler |
| Uygulama açıkken bildirim görünmüyor | `setNotificationHandler` ayarlı; izinleri kontrol et |

## 9. Güvenlik

- Servis hesabı anahtarı **sunucu tarafında** kalmalı; APK'ya koyma.
- `google-services.json` gizli değildir ama yine de repoya koymamak daha temizdir.
- Anahtar sızarsa Firebase Console'dan **Delete key** yapıp yenisini üret.