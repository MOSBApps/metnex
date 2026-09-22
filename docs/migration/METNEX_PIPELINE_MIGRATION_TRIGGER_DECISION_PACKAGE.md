# Pipeline Migration Tetikleme Karar Paketi (Q-DP02 / TASK-027.28)

> **Güncel durum (TASK-027.30):** §1–§6 TASK-027.28 anındaki karar paketidir (tarihsel; aşağıdaki "DEĞİŞTİRİLMEDİ" ifadesi o task için geçerliydi). AI1'in control-plane kararları **uygulanmıştır**; kayıt ve açık kalanlar **§7**'dedir.
> **Durum (TASK-027.28 anı): Karar paketi. Pipeline, Dockerfile, production kodu, migration mekanizması DEĞİŞTİRİLMEDİ; yeni migration komutu eklenmedi; runner/`pgSchema()` yazılmadı;
> gerçek migration/DB bağlantısı yok.** AI2 öneri sunar; **nihai karar AI1/PO'dadır** (§8 form boş). `isSystemAdmin`/PLATFORM_ROOT kullanıcı erişimi hiçbir seçenekte runner yetkisi sayılmaz.
> **Tarih:** 2026-09-21 · **Hazırlayan:** AI2 · **Zemin:** `METNEX_MIGRATION_ENTRYPOINT_PROVENANCE.md`, `METNEX_DATA_PLANE_MIGRATION_FANOUT_STANDARD.md`, TASK-027.27 paketi.

**Mevcut kanıt özeti:** deploy işi `self-hosted` runner'da, GitHub Environment (`dev/test/prod`; prod'da reviewer onayı — runbook) ile çalışır; migration adımı deploy adımının **içinde** `docker run --rm … node apps/api/dist/migrate.js` (hedef dosya yok, M4);
workflow düzeyinde `concurrency` **vardır** (`group: workflow-ref`) ama **`cancel-in-progress: true`** — aynı ref'e yeni push gelirse **çalışan deploy/migration adımı iptal edilebilir** (yeni bulgu **P6**); migration artifact doğrulaması **yok**; startup'ta migration **yok**; secret `/opt/metnex/<env>/.env` içinden `source` edilir.

---

## 1. Control-plane ↔ data-plane ↔ diğer ayrımı (tek entrypoint hepsini çalıştırmamalı)

| Tür | Kapsam | Bugün mekanizma | Hedef sınır |
|---|---|---|---|
| **Public control-plane migration** | `public` şeması (`apps/api/drizzle/migrations`) | M1/M2 (dev), M4 (bozuk) | **Kendi giriş noktası** (yalnızca `drizzle/migrations`) |
| **Customer-root data-plane migration** | Tek müşteri schema'sı içindeki nesneler (henüz yok) | Yok | **Ayrı giriş noktası**; hedef = tek `schemaName` (registry'den) |
| **Fan-out migration** | Tüm `ACTIVE` registry satırları üzerinde data-plane migration | Yok | Ayrı **fan-out runner**; control-plane girişini **çağırmaz** |
| **Identity dry-run/apply** | Wave 1 kimlik uzlaştırma | M6 (yalnızca in-memory dry-run/reconcile) | Şema migration'ından bağımsız; **apply yok**; ayrı CLI |
| **Vardiya migration** | BOTC→Metnex **veri** taşıma (ShiftReport) | Yok | Veri migration'ı ≠ şema migration'ı; staging/ledger üzerinden; şema girişinden ayrı |
| **Archive migration** | Arşiv verisi taşıma | Yok | Vardiya ile aynı sınıf; ayrı |

**Sınır kuralları (öneri):** (1) her giriş noktası **açık bir hedef-sınıf parametresiyle** (`--plane=control|data`) ya da ayrı ikili dosyayla çalışır; parametresiz çalıştırma **hiçbir şey yapmaz** (hata);
(2) control-plane girişi yalnızca `apps/api/drizzle/migrations`'ı okur — data-plane veya veri migration dosyalarına **erişemez**; (3) fan-out runner control-plane migration'ı **çalıştırmaz**, ön koşul olarak **control-plane sürümünün beklenen sürümde olduğunu doğrular** (registry tabloları);
(4) veri migration'ları (Vardiya/arşiv/identity) şema migration girişlerinden **kod düzeyinde ayrı** paketlerdir; (5) her giriş noktası kendi `migrationRunId` ve kendi advisory lock anahtarını kullanır.

---

## 2. Tetikleme seçenekleri

| Kriter | **O1** Startup | **O2** Pipeline içinde doğrudan (bugünkü desen) | **O3** Ayrı tek-seferlik migration job | **O4** Manuel platform CLI | **O5** CI onay kapısı sonrası job | **O6** Ayrı fan-out runner |
|---|---|---|---|---|---|---|
| Yetki modeli | Uygulama DB kimliği **DDL yetkisi** ister | Runner host'un `.env` secret'ı; deploy kimliği | Migration'a özel DB kimliği (DDL) ayrı secret | Operatör kimliği (platform ekibi) — **uygulama kullanıcısı değil** | GitHub Environment reviewer + migration kimliği | Migration servis kimliği; müşteri sayısı boyunca yetki |
| Yarış koşulu | **Yüksek** (çok replika aynı anda) | Düşük (tek deploy işi) ama iki eşzamanlı deploy'da yarış | Job başına tek örnek + **env başına, `cancel-in-progress: false`** ayrı `concurrency` grubu (mevcut grup iptal eder, P6) + DB advisory lock | Elle çakışma | O3 ile aynı + onay serileştirir | Global advisory lock + schema başına kilit |
| Retry | Uygulama çökme-yeniden başlatma döngüsü = kontrolsüz retry | Deploy yeniden çalıştırma | Job yeniden çalıştırma (idempotent migrator) | Operatör kararı | Onay sonrası yeniden çalıştırma | Standart §4 (retryable kategorileri) |
| Canary | Yok | Yok (env sırası dev→test→prod fiili canary) | Env sırası | Operatör seçer | Env sırası + onay | **Var** (canary schema önce) |
| Rollback | Zor (uygulama açılmaz) | Yok (forward-only) | Yok (forward-only) + öncesinde yedek | Operatör kararı + yedek | Yedek doğrulanmadan onay yok | Standart §6 |
| Secret erişimi | Uygulama secret'ı (geniş) | Runner `.env` (geniş: tüm ortam değişkenleri `source` ediliyor) | **Yalnızca gereken** secret | Operatör oturumu | Onay kapısı + minimum secret | Minimum, ayrı kimlik |
| Log/audit | Uygulama logu | Deploy logu | Job logu + migration ledger/audit | Operatör/CLI logu (dry-run desteği doğal) | Onay kaydı + job logu | Ledger + `PlatformAuditService` |
| Operasyonel risk | **En yüksek** (açılış = migration; başarısız = kesinti) | Deploy tıkanır (bugün **M4 yok**) | Düşük-orta | İnsan unutması | Düşük (onay gecikmesi) | Orta (karmaşıklık) |
| Docker image ihtiyacı | Uygulama image'ı | Uygulama image'ı + M4 (yok) | Aynı image, farklı komut (M3 önerisi) | Aynı image veya operatör host'u | Aynı image | Aynı image (fan-out ikilisi ayrı) |
| Data-plane uyumu | Kötü (N müşteri × açılış) | Yetersiz (canary/onay yok) | Control-plane için uygun | Acil/elle için uygun | Control-plane + ilk üretim için uygun | **Data-plane için tasarlanan** |

### 2.1 AI2 önerisi (karar değil)
- **Startup migration: yok** (varsayılan ve kalıcı öneri; ayrıca `main.ts`'te bugün de yok).
- **Control-plane:** **O5** — pipeline'da ayrı bir migration **işi** (aynı image, migration'a özel DB kimliği, env başına `cancel-in-progress: false` `concurrency` grubu (P6), `dev→test→prod` sırası; prod'da mevcut Environment reviewer kapısı) + giriş noktası olarak M3 (programatik migrator, `dist/migrate.js` yolu) → **yeni bir Dockerfile değişikliği gerekmez**.
- **Data-plane fan-out:** **O6**, `O3/O4` ile **elle/onaylı** başlatılır (ilk üretim run'ları insan onaylı, canary önce); pipeline'a otomatik bağlanması ayrı karar (Q-DP02 sayısal parametreleri: canary boyutu, hata eşiği, retry sayısı, timeout — **PO kararı gerekli, sayı uydurulmadı**).
- **Acil/elle:** **O4**.
- **Runner yetkisi:** migration servis DB kimliği; **uygulama-içi kullanıcı yetkisi (`isSystemAdmin`, PLATFORM_ROOT, `TENANT_ADMIN`) runner yetkisi değildir**; yeni uygulama-içi yetki icat edilmedi.

**Riskler:** O5 onay gecikmesi/onay yorgunluğu; ayrı DB kimliği secret yönetimi yükü; M3 yeni kod (test gerekir). **Geri dönüş:** tetikleme modelini değiştirmek düşük (aynı giriş noktası); giriş noktasını değiştirmek orta.
**Karar için gereken:** AI1/PO — kimlik/secret modeli, onay politikası (dev/test için de gerekli mi), `concurrency` politikası, sayısal parametreler.
**Uygulanacak dosyalar (onay sonrası; şimdi uygulanmadı):** `apps/api/src/migrate.ts` (yeni), `.github/workflows/pipeline.yml` (migration işi + `concurrency` + onay), `docs/runbooks/deployment.md` §6-7, `apps/api/Dockerfile` (gerekirse), `apps/api/package.json` (script), CI artifact doğrulama adımı.

---

## 3. Hedef akış değerlendirmesi

```text
BUILD → MIGRATION ARTIFACT VALIDATION → READ-ONLY PREFLIGHT → HUMAN APPROVAL → CANARY → FAN-OUT RUN → VERIFY → FINALIZE / BLOCKED / ROLLBACK
```

| Aşama | Bugün | Boşluk | Öneri |
|---|---|---|---|
| **BUILD** | Var (`docker-build`, Trivy taraması) | — | Korunur |
| **MIGRATION ARTIFACT VALIDATION** | **Yok** | journal ↔ `drizzle/migrations` tutarlılığı, boş DB'ye uygulanabilirlik (CI'da geçici DB gerekir — ayrı harness task'ı), `db:generate` fark kontrolü (üretilmemiş şema farkı yok) | CI adımı; **image içine giren** artifact'in checksum'ı kaydedilir (fan-out standardı `migrationChecksum`) |
| **READ-ONLY PREFLIGHT** | **Yok** | Bekleyen migration listesi, bağlantı/kimlik doğrulaması, registry/closure sağlığı (data-plane için Q-V20 preflight) | Salt-okuma; DDL yok; sonuç onaycıya sunulur |
| **HUMAN APPROVAL** | Kısmi: prod'da Environment reviewer (runbook); dev/test yok | Preflight çıktısı onaycıya gösterilmiyor | Onay **preflight raporuna** bağlanır |
| **CANARY** | Yok | Control-plane: tek DB → **env sırası** (dev→test→prod) fiili canary; data-plane: canary schema | Kavramı ikiye ayır (control-plane env sırası / data-plane canary schema) |
| **FAN-OUT RUN** | Yok | Runner yok | O6 (ayrı karar/task) |
| **VERIFY** | Yok | Migration sonrası doğrulama (tablo/sürüm eşleşmesi) | Standart §2 |
| **FINALIZE / BLOCKED / ROLLBACK** | Kısmi: `set -euo pipefail` ile hata → deploy durur (BLOCKED benzeri) | Rollback tanımı yok (forward-only; yedek kontrol noktası) | Forward-only + **migration öncesi yedek doğrulaması** (mevcut `backup-db.sh` deseni); geri alma = düzeltici migration/yedekten restore |

Not: control-plane'de **fan-out yoktur**; akışın FAN-OUT/CANARY aşamaları yalnızca data-plane'e uygulanır. Uygulama başlangıcında migration çalıştırma **varsayılan olarak yasak** kalmalıdır (§2.1).

## 4. Sonraki task önerisi (öneri sırası)
1) Q-DP08/Q-DP02/Q-DP07 kararları → 2) "Migration entrypoint & pipeline düzeltmesi" (M3 + migration işi + runbook + bağlantı politikası) → 3) CI migration artifact doğrulaması (geçici DB harness) → 4) Registry hardening G-A/G-B (TASK-027.27 planı) → 5) fan-out runner.

## 5. Karar Formu (AI1/PO doldurur — AI2 doldurmaz)

| Konu | AI2 önerisi | **AI1/PO KARARI** |
|---|---|---|
| Startup migration | Yok (kalıcı) | ☐ bekliyor |
| Control-plane tetikleme | O5 (ayrı iş + onay kapısı) + M3 giriş noktası | ☐ bekliyor |
| Data-plane fan-out | O6, elle/onaylı; otomasyon ayrı karar | ☐ bekliyor |
| Acil/elle yol | O4 | ☐ bekliyor |
| Runner kimliği | Migration'a özel DB kimliği; `isSystemAdmin`/PLATFORM_ROOT değil | ☐ bekliyor |
| Sayısal parametreler (canary/eşik/retry/timeout) | PO kararı gerekli | ☐ bekliyor |
| Onay politikası (dev/test/prod) | prod zorunlu; dev/test PO | ☐ bekliyor |

## 6. Teyit
Pipeline, Dockerfile, `apps/`, runbook, DEC dosyaları değiştirilmedi; yeni migration komutu eklenmedi; `dist/migrate.js` oluşturulmadı; gerçek DB/migration yok. Kapatılan soru yok.

## 7. TASK-027.30 Uygulama Durumu (2026-09-21) — control-plane tetikleme uygulandı

Yukarıdaki karar formu **boş bırakılmıştır**; AI1, TASK-027.30 talimatında kararları doğrudan verdi ve AI2 bunları uyguladı. Kayıt:

| AI1 kararı (TASK-027.30) | Uygulama |
|---|---|
| Startup migration yok | Değişmedi/doğrulandı (testle: `main.ts`, `app.module.ts` migrate'e referans vermez; CMD `main.js`) |
| Migration ayrı pipeline job/container | `.github/workflows/pipeline.yml` `migrate` işi (`deploy`'dan ayrı) — seçenek **O3 + O5** |
| Prod GitHub Environment onay kapısı korunur | `migrate` **ve** `deploy` işleri `environment:` kullanır (bkz. aşağıdaki not) |
| Aynı env için migration eşzamanlı çalışmaz | İş düzeyinde `concurrency: group: metnex-migration-<env>, cancel-in-progress: false` + entrypoint'te DB advisory lock |
| Migration `isSystemAdmin`/`PLATFORM_ROOT`/`TENANT_ADMIN` ile ilişkisiz | Kimlik bilgisi tek `DATABASE_URL`; iş uygulama token'ı/kullanıcı yetkisi kullanmaz (test: pipeline'da bu terimler/`Authorization` yok) |
| `dist/migrate.js` `src/migrate.ts`'ten; programatik Drizzle migrator; drizzle-kit runtime değil | Uygulandı (`METNEX_MIGRATION_ENTRYPOINT_PROVENANCE.md` §7) |
| `DATABASE_URL` fail-fast | Uygulandı (exit 1) |
| Fan-out yok; gerçek migration çalıştırılmaz | Uygulanmadı/çalıştırılmadı |

**Hedef akış (§3) karşılığı:** BUILD ✓ (mevcut) · MIGRATION ARTIFACT VALIDATION: **kısmi** — Dockerfile `RUN test -f` (build) + `migrate` işi `docker run --entrypoint test … -f apps/api/dist/migrate.js` (job, veritabanına dokunmadan önce; eksikse `::error::` + `exit 1`); journal↔klasör tutarlılık ve boş-DB uygulanabilirlik doğrulaması **hâlâ yok** · READ-ONLY PREFLIGHT: **yok** (yalnızca kilit + migrator) · HUMAN APPROVAL ✓ (Environment) · CANARY: env sırası (dev→test→prod, mevcut) · FAN-OUT: **yok** (kapsam dışı).

**Bu task'ta değişen ve dikkat isteyen davranışlar (AI1 bilgisine):**
1. **P6 giderildi (workflow düzeyi):** `cancel-in-progress` artık yalnızca `pull_request` için `true`; deployable branch'lerde yeni push çalışan bir run'ı **iptal etmez** (aksi halde workflow düzeyindeki iptal, iş düzeyindeki `cancel-in-progress: false`'u anlamsız kılardı). Yan etki: aynı ref'e art arda push'lar artık eskisi bitene kadar **kuyruğa** girer (GitHub aynı grupta en fazla bir bekleyen run tutar; ara run'lar atlanabilir).
2. **Çift onay:** `migrate` ve `deploy` işleri aynı Environment'ı kullandığından **prod'da reviewer onayı iki kez** istenir (migration için, sonra deploy için). "Onay kapısı korunur" kararı gereği ikisi de bırakıldı; tek onay isteniyorsa `deploy` işinden `environment` kaldırılması AI1 kararıdır.
3. Migration artık **GHCR'den çekilen** image ile çalışır (önceden yerel registry'ye push sonrası); içerik aynı, sıra `docker-build → scan → migrate → deploy`.

**Q-DP02 durumu:** control-plane tetikleme/yetki kısmı **uygulandı**; **açık kalan kısımlar:** data-plane fan-out tetikleyicisi ve yetkisi (O6), sayısal parametreler (canary/eşik/retry/timeout: PO), ayrı migration DB kimliği (`MIGRATION_DATABASE_URL` hiçbir kod tarafından okunmuyor). Kapanış kararı AI1'de.
