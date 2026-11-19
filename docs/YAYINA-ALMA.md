> **Sürüm 0.2.0 notu:** Hazır APK sunucusuz çalışır; bu belge yalnızca **opsiyonel merkezi sunucu
> modu** içindir.

# Sunucuyu Yayına Alma

Push bildirimlerinin çalışması için sunucunun **7/24 ayakta** olması gerekir. Telefon uyurken
tarama yapılamaz.

## Gereksinimler

| İhtiyaç | Neden |
|---|---|
| Sürekli çalışan süreç | 5 dk'da bir tarama |
| Kalıcı disk | SQLite + kayıtlı aramalar |
| HTTPS | Üretim APK'sında `http://` yerine |
| Firebase anahtarı | FCM push |

## Seçenek 1 — Render (en kolay)

1. Repoyu GitHub'a push et.
2. Render → **New → Blueprint** → repoyu seç. `render.yaml` otomatik okunur.
3. `FIREBASE_SERVICE_ACCOUNT` değerini gir (base64).
4. Deploy bitince URL: `https://isbul-api.onrender.com`

**Önemli:** Render'ın **Free** planı 15 dk trafik olmazsa uykuya geçer ve diski kalıcı değildir.
Gerçek 7/24 bildirim için:
- **Starter** plan + 1 GB disk (render.yaml'da tanımlı), veya
- Free plan + dış cron ile her 10 dk'da `/health` ping'i (uykuyu engeller, disk yine geçici).

### Free planda uyanık tutma

[cron-job.org](https://cron-job.org) üzerinden her 10 dakikada:

```
GET https://isbul-api.onrender.com/health
```

Bu yöntem resmî olarak önerilmez ve deploy sırasında veri kaybı olabilir; kalıcı çözüm değildir.

## Seçenek 2 — VPS (Docker)

Herhangi bir Linux VPS (1 vCPU / 1 GB RAM yeterli):

```bash
git clone <repo> isbul && cd isbul
cp server/.env.example server/.env
nano server/.env          # FIREBASE_SERVICE_ACCOUNT, SCAN_TOKEN vb.
docker compose up -d --build
```

Kontrol:

```bash
docker compose logs -f server
curl http://localhost:8787/health
```

### HTTPS (Caddy örneği)

`/etc/caddy/Caddyfile`:

```
isbul.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

```bash
systemctl reload caddy
```

APK'da varsayılan adres: `https://isbul.example.com`

## Seçenek 3 — Fly.io / Railway / Koyeb

- Docker imajı hazırdır: `server/Dockerfile`
- Kalıcı volume'u `/app/.data` (veya `DATA_DIR`) yoluna bağla.
- Ortam değişkenlerini panelden gir.
- Tek instance yeterli; SQLite dosya tabanlı olduğu için **birden fazla replika kullanma**.

## Ortam değişkenleri

| Değişken | Örnek | Açıklama |
|---|---|---|
| `PORT` | `8787` | HTTP portu |
| `DATA_DIR` | `/var/data` | SQLite klasörü (kalıcı disk) |
| `SCAN_INTERVAL_MS` | `300000` | Tarama aralığı |
| `SCAN_START_DELAY_MS` | `8000` | Açılışta ilk tarama gecikmesi |
| `DISABLE_SCHEDULER` | `0` | `1` ise tarama kapalı (sadece API) |
| `SEARCH_CACHE_MS` | `600000` | On-demand arama önbelleği |
| `SCAN_TOKEN` | rastgele | `POST /api/scan` için gizli anahtar |
| `FIREBASE_SERVICE_ACCOUNT` | base64 | FCM servis hesabı |
| `CORS_ORIGIN` | `*` | Web istemcisi için |
| `LOG_LEVEL` | `info` | Pino log seviyesi |

`SCAN_TOKEN` boşsa `/api/scan` herkese açıktır. Üretimde mutlaka doldur:

```bash
curl -X POST https://isbul.example.com/api/scan -H "x-scan-token: GIZLI"
```

## İzleme

- `GET /health` → servis ayakta mı?
- Loglarda `Tarama başladı` / `Tarama bitti: N yeni ilan` satırları.
- Hata durumunda `errors` dizisi tarama özetinde döner.

Docker log:

```bash
docker compose logs -f --tail=200 server
```

## Yedekleme

```bash
# Sunucu durdurulmuşken
cp .data/isbul.sqlite yedek-$(date +%F).sqlite
```

SQLite WAL modunda çalışır; canlı kopya için `sqlite3 .data/isbul.sqlite ".backup yedek.sqlite"`
kullan.

## Ölçekleme ve çok kullanıcı

Mevcut sürüm tek sunucu + SQLite için tasarlandı. Yüzlerce kullanıcıya çıkarsan:

1. PostgreSQL'e geç (Supabase/Neon).
2. Cihaz kimliği yerine kullanıcı hesabı + JWT ekle.
3. Tarama sonuçlarını şehir/meslek bazında **paylaşımlı önbelleğe** al; her kullanıcı için ayrı
   tarama yapma (şu an aynı sorgu gruplanıyor).
4. Kaynak başına istek limitlerini ve hata oranlarını metrikle.
5. Yasal izinler ve site kullanım şartlarını gözden geçir.

## Güvenlik kontrol listesi

- [ ] `SCAN_TOKEN` güçlü ve gizli
- [ ] `FIREBASE_SERVICE_ACCOUNT` repoya commit edilmedi
- [ ] `google-services.json` repoda değil
- [ ] HTTPS aktif
- [ ] `DATA_DIR` kalıcı diskte
- [ ] Sunucu saat dilimi doğru (bildirim zamanları için)
- [ ] Düzenli yedek