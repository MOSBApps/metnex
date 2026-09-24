---
id: TASK-027.73-R3
title: Development CSV Fixture Environment Activation
status: done
parent_epic: EPIC-004
related: [TASK-027.73-R2, TASK-027.73-R1, TASK-027.55]
updated_at: 2026-09-24
---

# TASK-027.73-R3: Development CSV Fixture Environment Activation

## Durum
done (AI1 onayı, 2026-09-24)

## Kök neden
`dev.sh` `apps/api/.env` içine yalnız `NODE_ENV=development` yazıyordu; `REPORTING_DEV_FIXTURES` ve `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE` eksik olduğundan `SCADA_HOURLY_ANALYSIS` artifact'i API'ye hiç eklenmiyordu.

## Teslim edilen
- **`scripts/dev-fixture-env.sh`** (yeni, `dev.sh` tarafından `source` edilir): `resolve_dev_fixture_env` iki değeri çözer. Öncelik: **çağıran ortamda export edilmiş değer > mevcut `apps/api/.env` içindeki değer > varsayılan** (`true`, `Europe/Istanbul`). Açık `REPORTING_DEV_FIXTURES=false` korunur. Geçersiz saat dilimi **düzeltilmez**, olduğu gibi yazılır (API fail-closed: analiz yok). `.env` satırını bozabilecek karakter (boşluk, tırnak, `#`, `$`, `\`, `;`, satır sonu) içeren değer **reddedilir** (hiçbir şey yazılmaz, değer hata mesajında da yankılanmaz). Yorum satırı (`# REPORTING_…`) değer sayılmaz.
- **`dev.sh`:** API `.env` yazımı `write_api_env` fonksiyonuna alındı (davranış aynı) ve iki satır eklendi: `REPORTING_DEV_FIXTURES=${DEV_FIXTURE_FLAG}`, `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=${DEV_FIXTURE_TZ}`. Değerler `.env` **yazılmadan önce** çözülür (kullanıcının önceki değeri ezilmez). Başlangıç mesajı statik: `Development CSV fixture: enabled` + `Source timezone: <değer>` (veya `disabled`; geçersiz dilimde fail-closed uyarısı). CSV satırı/yol/bağlantı dizesi/parola/ham hata yazdırılmaz.
- Değişkenler **yalnız local development bootstrap'inde**: `infra/`, Dockerfile, docker-compose ve production yapılandırmalarında yok (testle taranır). `NODE_ENV=production` iken fixture etkinleşmez (API tarafındaki mevcut kapı; test edildi). `apps/api/.env.example`'a ikinci değişken belgelendi (yorum satırı).
- **Runbook:** `docs/runbooks/local-development.md` §9.1 (değişkenler, öncelik, örnekler, kurallar).
- **Web:** değişiklik yok (yalnız test eklendi).

## Testler
`dev-fixture-environment.spec.ts` (28; gerçek shell kodunu geçici dizinde çalıştırır — Docker/port/DB yok, CSV okunmaz): `bash -n`; varsayılan çıktıda iki değişken ve `Europe/Istanbul`; üretilen ortamın gerçekten fixture kapısını açtığı (artifact, zone `DEVELOPMENT_OVERRIDE`, fixture sağlayıcıları); kullanıcı flag'i ve saat diliminin korunması; mevcut `.env` değerlerinin korunması + export'un onu ezmesi; yorum satırının okunmaması; `false` ile fixture'ın kapanması (artifact/sağlayıcı yok, "disabled"); production'da etkinleşmeme; 4 geçersiz dilim olduğu gibi yazılır ve analiz yok (fail-closed); 7 güvensiz değer reddi; statik mesaj; credential sızıntısı yok (fixture bloğu tam iki değişken); dev.sh sırası (çöz → yaz); production/Docker dosyalarında değişken yok; artifact'in etkin fixture'da listelenmesi **ve DB'ye hiçbir yazma yapılmaması**; kapalı/production'da listelenmeme ve 404; seed/`onModuleInit` yokluğu. Ek: gerçek CSV üzerinde katalog+analizde `console` sessiz (ham satır loglanmaz); web: liste artifact linkini gösterir / fixture kapalıyken göstermez. Mevcut testler gerçek CSV ile katalog discovery ve analiz endpoint'ini (R1/R2) ve web'in provider-yok durumunu zaten kapsıyor. Toplam: api 3103/3103 (105 suite), web 292/292.

## Mutasyon kontrolleri (uygulandı, geri alındı, `cmp` ile doğrulandı — hepsi testleri kırdı)
`REPORTING_DEV_FIXTURES` satırını kaldırma (9) · saat dilimi satırını kaldırma (10) · fixture'ı production'da açma (12) · açık `false`'u yok sayma (2) · kullanıcı saat dilimini ezme (13) · geçersiz dilimi varsayılanla düzeltme (11) · artifact'i DB'ye seed etme (6) · CSV içeriğini loglama (3) · artifact kodunu yanlış yazma (24) · fixture kapalıyken artifact'i listeleme (8).

## Doğrulama
`bash -n dev.sh` ve helper: geçerli. `pnpm --filter api exec tsc --noEmit` ve `--filter web` temiz; api `jest src` 105 suite / 3103 test; web `vitest run` 25 dosya / 292 test; `./scripts/check.sh --skip-docker` yeşil. Docker, SQL Server/PostgreSQL, migration ve production verisi kullanılmadı; git commit/push yok.
**Manuel local doğrulama (`pnpm dev` + tarayıcı) yapılamadı:** `./dev.sh` Docker (postgres/redis/minio/jasper) başlatıp `db:migrate` çalıştırdığından ve çalışan geliştirme sunucularınıza dokunmamak için çalıştırılmadı; mevcut `apps/api/.env` dosyanıza da dokunulmadı. Sizin adımlarınız: (a) `./dev.sh` yeniden çalıştırın **veya** `apps/api/.env`'e `REPORTING_DEV_FIXTURES=true` ve `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=Europe/Istanbul` ekleyin; (b) API'yi yeniden başlatın (değişkenler açılışta okunur); (c) Raporlar → "SCADA Saatlik/Günlük Analiz" → kaynak → doğrulanmış seri → tarih aralığı → Saatlik → Analiz Çalıştır → grafik + tablo.

## AI1 Onayı (2026-09-24)
`done`. Environment aktivasyonu ve güvenlik kontrolleri testlerle doğrulandı; manuel Docker/dev doğrulamasının yapılmamış olması kapanışa engel değil (açıkça raporlandı).

## R4 referansı (2026-09-24)
Registry'siz geliştirme veri kapsamı (üçüncü değişken `REPORTING_DEV_FIXTURE_SCOPE_BRIDGE`) `TASK-027.73-R4` ile eklendi: `backlog/TASK-027-73-R4-development-scope-bridge.md`.
