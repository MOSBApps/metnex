---
id: TASK-027.72-R1
title: SCADA Provider Composition ve Analysis Chain Alignment
status: done
parent_epic: EPIC-004
related: [TASK-027.72, TASK-027.71, TASK-027.66, TASK-027.65, TASK-027.63-R1, TASK-027.67, TASK-027.68]
updated_at: 2026-09-24
---

# TASK-027.72-R1: SCADA Provider Composition ve Analysis Chain Alignment

## Durum
done (AI1/PO `done` onayı alındı - 2026-09-24)

## Amaç
027.72 uçlarını composition sınırına bağlamak ve analiz zincirini bağlayıcı karara uygun hale getirmek: **Query → Quality/Rollover → Hourly/Daily Aggregation (027.66) → Multi-Series/Statistics → Comparison/Virtual Columns → API Response**.

## Teslim edilen
### 1. Composition root (`api/scada-api.providers.ts`)
- **Her zaman kayıtlı (gerçek):** audit (`PlatformScadaQueryAudit`), **preset authorization adaptörü** (`DbScadaPresetAuthorization`), çağıran dizini, API servisi.
- **Yalnız `NODE_ENV=development` + `REPORTING_DEV_FIXTURES=true`:** dev CSV fixture (`SCADA_DEV_CSV_FIXTURE`) ve ondan türeyen `SCADA_SOURCE_CATALOG`, `SCADA_ANALYSIS_QUERY`, dev limitleri. Diğer her ortamda fixture sınıfı hiç kurulmaz, CSV dosyası okunmaz, varsayılan provider uydurulmaz, veritabanından kaynak verisi çekilmez.
- **Henüz kayıtsız (gerçek üretim adaptörü yok — Q-W535 gerçek SQL Server kısmı açık):** katalog, sorgu, preset deposu, sanal kolon deposu, roll-over politikası tokenları. Token yoksa açılış bozulmaz; uçlar `503 SCADA_SOURCE_NOT_CONFIGURED` döner (roll-over: "politika yok" ⇒ counter reset çözümsüz kalır, tahmin yok).
- Limitler: 13 ortam değişkeni aynen korunur (varsayılan yok; eksik/geçersiz ⇒ `503 SCADA_LIMITS_NOT_CONFIGURED`); production sağlayıcı `loadScadaApiLimits(env)`.
### 2. Dev CSV fixture (`api/dev-csv-scada-fixture.ts`) — eski sentetik üreteç kaldırıldı
- Mevcut `ScadaCsvFixtureProvider` (manifest, yalnız `veriler/raw/`, SHA-256, yol-geçişi koruması) **gerçek 027.65 `ScadaAnalysisQueryService`'in** katalog+adaptörü olarak bağlandı: sorgu servisi DST normalizasyonunu ve audit'i kendisi yapar.
- Katalog kapıları açık: çağıranın tenant kaydı (DB'den) `assertMappableTenant`'tan geçmeli (ACTIVE, PLATFORM_ROOT değil, MOSEDAŞ değil) ve çözümlenmiş kapsamda olmalı; tablo/kolonlar manifestinki olmalı; saat dilimi geçerli IANA olmalı. Manifest tüm fixture dilimlerini `UNVERIFIED` bildirdiği için dilim yalnız **dev-only** `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE` ile verilir; yoksa/geçersizse kaynak doğrulanmamıştır ve API `SCADA_TIMEZONE_MISMATCH` ile **hiçbir şey analiz etmez**.
- Fixture SQL Server/PostgreSQL/Drizzle import etmez, MOSEDAŞ tenant üretmez; kapalıyken dosya erişimi olmaz (provider dosya okumadan reddeder — testle sabit).
### 3. Zincir (027.66 dahil), sırayla
1. Pure HTTP DTO doğrulama → 2. JWT/MFA/tenant header/membership/permission (guard'lar) … (bkz. 027.72) → 3. preset çözümü (027.71) → 4. katalog erişimi + **027.65 sorgu** (okuma + audit) → 5. **027.67 kalite/roll-over** (saatlik değer, DST, politika) → 6. **027.66 saatlik/günlük aggregation** (`aggregateDstAwareSeries`, additive) → 7. **027.68 multi-series/istatistik** → 8. **027.70 sanal kolonlar** (multi-series çıktısı üzerinde, deterministik, seri anahtarı sırasıyla) → 9. (**027.69 karşılaştırma**) → 10. whitelist projeksiyon; audit sınırı 027.65'te (okuma) + API'de (okumaya ulaşmayan retler).
- **DAILY:** INDEX = SUM; REAL_VALUE için katalogda açık `dailyOperation` yoksa **okumadan önce** `SCADA_AGGREGATION_POLICY_REQUIRED` (tek audit kaydı).
### 4. 027.66 DST uyumu (`aggregation/dst-aware-aggregation.ts`, additive; 027.66 dosyaları DEĞİŞMEDİ)
- 027.66 `occurredAtUtc: string` bekliyor ve bu **değişmedi**. Yeni giriş noktası `aggregateDstAwareSeries` nullable `occurredAtUtc` ve kalite alanlarını (`localWallTime, dstResolution, dstCandidatesUtc, dstUncertainRangeUtc, qualityFlags, isComplete, analysisAllowed`) kabul eder; zamanlı satırlar **değişmemiş** saatlik/günlük 027.66 motorundan geçer, zamansız satırlar motora girmez ama **silinmez**: `untimed` bloklu sonuç (`bucketStartUtc=null`, `DST_AMBIGUOUS`/`DST_NONEXISTENT`, değer `null`, tamamlanmamış, analiz edilemez), sahte UTC yok, geçerli veri sayılmaz. Adayları/belirsiz aralığı kapsayan **komşu delta/kova bloklanır**; zamansız üyesi olan **günün toplamı `null`** (kısmi toplam yok).
- **Etki (dürüstlük):** 027.66 kuralları değişmedi. Bilinen tutarsızlık: 027.66 günlük kovayı `YYYY-MM-DDT00:00:00.000Z` (yerel tarihin UTC gece yarısı) etiketler; additive katman günü **yerel gece yarısı anına** (`localToUtc`) çevirir, motor çıktısı olduğu gibi kalır.
- 027.67 zaten hesapladığı saatlik değeri (delta/roll-over) 027.66'ya girdi olarak verir (`hourlyOperation: RAW`); böylece delta tek yerde (027.67) hesaplanır.
### 5. Provider durumları (hiçbiri başarı değil)
kayıtlı değil → 503 `SCADA_SOURCE_NOT_CONFIGURED`; kaynak çözümsüz / pasif / tenant çözümsüz → 404 `SCADA_NOT_FOUND`; limit eksik/geçersiz → 503 `SCADA_LIMITS_NOT_CONFIGURED`; katalog kaynağı bloklu (sorgu servisi reddi) → 503 `SCADA_SOURCE_UNAVAILABLE`; audit başarısız → 503 `SCADA_AUDIT_FAILED` (veri yok); fixture kapalı → tokenlar yok → 503. **Boş sonuç** artık `status: BLOCKED`, `code: NO_VALID_DATA` (başarı gibi dönmez; hiçbir seri `OK` değilse).
### 6. Preset authorization
`DbScadaPresetAuthorization`: paylaşma/değiştirme/silme = ACTIVE sistem yöneticisi **veya** preset'in customer-root'unda ACTIVE `TENANT_ADMIN` (mevcut `PermissionGuard`/tenant-role servisiyle aynı model); yeni permission kodu yok; kullanma/görüntüleme `REPORT:ARTIFACT:VIEW`. API servisinde `authorizeShare` (henüz rota yok — CRUD kapsam dışı): port yoksa, başka kök, çözümsüz/pasif/PLATFORM_ROOT tenant, pasif kullanıcı ⇒ ret.
### 7. Audit
Tek sınır korunur; **çift kayıt yok**: okuma başına bir kayıt (sorgu servisi), okumaya ulaşmayan retler için bir API kaydı; sorgu servisinin zaten yazdığı ret ikinci kez yazılmaz (testle sabit).

## Testler (yeni; api tam paket 2999/2999)
`aggregation/__tests__/dst-aware-aggregation.spec.ts` (15), `api/__tests__/scada-api-chain.spec.ts` (33; gerçek query service, Europe/Berlin DST), `scada-api-csv-fixture.spec.ts` (14; gerçek CSV — `veriler/raw/` git-ignored olduğundan veri testleri snapshot yoksa atlanır, kapı testleri atlanmaz), `scada-preset-authorization.spec.ts`, güncellenen `scada-api-wiring.spec.ts`. Kapsam: fixture DI'a girmiyor, bayraksız CSV okunmuyor, gerçek CSV'den kontrollü veri, provider yokluğu/fallback yok, query→quality→aggregation→multi-series, karşılaştırma zinciri, daily INDEX SUM, REAL_VALUE policy reddi, DST ambiguous/nonexistent (silinmiyor, sahte UTC yok, geçerli sayılmıyor, komşu blokajı), tenant/preset izolasyonu, limit eksikliği, audit success/denied/failure, çift audit yok, redaction, SQL/schema/database reddi, determinizm, gerçek 0 ≠ null, boş sonuç ≠ başarı.

## Mutasyon kontrolleri (uygulandı, geri alındı, `diff` ile doğrulandı — 13 istenen, 16 mutant; hepsi testleri kırdı)
027.66 aggregation çağrısını kaldırma (6 test) · günlük INDEX SUM kuralını kaldırma (5) · REAL_VALUE policy eksikliğini kabul (2) · null `occurredAtUtc` için sahte zaman (8) · çözümsüz DST'yi geçerli sayma (7; ilk denemede derleme hatalı ⇒ geçersiz sayıldı, tür-güvenli yeniden yapıldı) · komşu blokajı kaldırma (2) · fixture'ı production'da açma (10) · provider yokken sentetik veri (6) · tenant scope kontrolü (56) · preset authorization (6) · audit başarısızken response: API (1) ve sorgu-audit hatası (3) · çift audit (2) · limit eksikliğinde varsayılan (25) · ham provider hatası response'a (3).

## Doğrulama
`pnpm --filter api exec tsc --noEmit` temiz; eslint 0 hata; `jest src --runInBand` 102 suite / 2999 test yeşil; `./scripts/check.sh --skip-docker` yeşil. Docker, gerçek SQL Server/PostgreSQL, migration, smoke test **çalıştırılmadı**; git commit/push yok; yeni permission/tenant/mapping/bağlantı bilgisi yok.

## Açık kalanlar
- Üretimde gerçek katalog/sorgu/preset/sanal-kolon/roll-over provider'ı yok (gerçek SQL Server adaptörü ve kalıcı depolar ayrı karar - Q-W535 üretim engelleyicisi olarak açık): tarayıcıda **yalnız dev fixture ile** (bayrak + dilim değişkeni) veri görünür.
- **Q-W536 Kararları (Çözüldü - 2026-09-24):**
  - **Dev timezone override:** `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE` yalnızca development fixture için kabul edildi; production veya katalog doğrulaması yerine kullanılamaz.
  - **Günlük kova etiketi:** Yerel gün başlangıcının UTC karşılığı kullanılacak; timezone metadata'sı korunacak.
  - **Delta sorumluluğu:** Delta tek yerde, TASK-027.67 kalite/rollover katmanında hesaplanacak. TASK-027.66 zincirde yalnızca aggregation/bucket rolünü sürdürecek; ikinci kez delta hesaplamayacak.

## Discovery bağlantısı (TASK-027.73-R1, 2026-09-24)
Dev CSV fixture artık merkezi `fixture/scada-fixture-artifact.ts` sözleşmesinden beslenir (artifact kodu `SCADA_HOURLY_ANALYSIS`, `dataOrigin`, dilim kuralı, katalog UUID'leri) ve `GET /reports/:code/analysis/catalog` ile keşfedilir: `backlog/TASK-027-73-R1-scada-csv-catalog-discovery.md`. Composition kuralları değişmedi.

## AI1 Onayı (2026-09-24)
`done`: provider composition ve analiz zinciri (027.66 dahil) kabul edildi.

## Scope bridge notu (TASK-027.73-R4, 2026-09-24)
Composition root'a dördüncü bir dev-only bağlantı eklendi: `SCADA_DEV_SCOPE_RESOLVER` (`DevFixtureScopeResolver`) yalnız `NODE_ENV=development` + `REPORTING_DEV_FIXTURES=true` + `REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=true` + geçerli dilim ile kaydedilir ve yalnız SCADA API servisinin scope kaynağı olur; aksi halde `TenantScopeService` (registry yoksa fail-closed). Bkz. `backlog/TASK-027-73-R4-development-scope-bridge.md`.
