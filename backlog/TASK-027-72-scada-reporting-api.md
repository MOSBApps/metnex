---
id: TASK-027.72
title: SCADA Reporting API Integration
status: done
srs_refs: [FR-014, FR-016, FR-018, FR-019, FR-020, FR-021, FR-024, FR-028, FR-039, FR-047, FR-051, FR-057, SEC-DATA-001, AC-004, AC-005]
parent_epic: EPIC-004
related: [TASK-027.65, TASK-027.67, TASK-027.68, TASK-027.69, TASK-027.70, TASK-027.71, TASK-027.64-R2]
updated_at: 2026-09-24
---

# TASK-027.72: SCADA Reporting API Integration

> Planlama dosyası: `backlog/TASK-027-72-hourly-consumption-api-integration.md` (TASK-027.62 çıktısı). Bu dosya AI1'in `ready` spesifikasyonuna göre **teslim kaydıdır**; ID aynıdır.

## Durum
done (AI1 onayı, 2026-09-24)

## Amaç
027.65–71 çekirdeklerini mevcut reporting modülüne, mevcut guard zinciri arkasında **ek (additive)** bir API sınırıyla bağlamak. Web ekranı (027.73), export/Jasper (027.74), gerçek SQL Server/PostgreSQL, migration, Docker, smoke test kapsam dışı.

## Teslim edilen (`apps/api/src/reporting/scada/api/`)
- **Endpoint'ler** (`scada-analysis.controller.ts`, `/reports` altında, ek):
  - `POST /reports/:code/analysis/query`
  - `POST /reports/:code/analysis/compare` (`PERIOD` | `SOURCE`)
  - `GET /reports/:code/analysis/presets`
  - `GET /reports/:code/analysis/presets/:presetId`
  - Guard sırası (sınıf düzeyinde, hiçbir route atlayamaz): `JwtAuthGuard → MfaEnforcementGuard → TenantHeaderFormatGuard → TenantMembershipGuard → PermissionGuard`, `@RequireMfaSetupComplete()`; izin **mevcut `REPORT:ARTIFACT:VIEW`** — yeni permission yok, export izni kullanılmadı. `endpoint-authorization-inventory` snapshot'ına 4 satır eklendi.
- **Port sınırı** (`scada-api.contract.ts`): `ScadaSourceCatalogPort`, `ScadaAnalysisQueryPort` (027.65 `runMany` şekli), `ScadaPresetStorePort` (yalnız okuma), `ScadaVirtualColumnStorePort`, `ScadaCallerDirectory`, `ScadaApiLimitsProvider`, audit (`ScadaQueryAuditPort` = mevcut `PlatformScadaQueryAudit`), opsiyonel `RolloverPolicyProvider`. Kaynak katalog görünümü (`ScadaApiSource`) fiziksel `table/dateColumn/timeColumn` **yalnızca içeride** taşır; hiçbir zaman projekte/audit edilmez.
- **Provider yokluğu:** katalog, sorgu veya (preset isteğinde) preset deposu tokenı kayıtlı değilse `503 SCADA_SOURCE_NOT_CONFIGURED`; sentetik veri, rastgele bağlantı, boş/yanıltıcı grafik yok. Limit yapılandırması eksik/geçersizse `503 SCADA_LIMITS_NOT_CONFIGURED`.
- **Dev fixture** (`dev-scada-fixture.ts`, `scada-api.providers.ts`): simülasyon katalog/sorgu/limit **yalnızca `NODE_ENV=development` ve `REPORTING_DEV_FIXTURES=true`** ile DI'a eklenir (reporting'in mevcut `isDevFixtureEnabled` anahtarı); aksi halde sınıflar hiç kaydedilmez (davranışsal + statik testlerle sabit). Deterministik, kasıtlı bir MISSING boşluğu içerir, gerçek veri değildir.
- **Limitler** (`scada-api.env.ts`): 13 ortam değişkeni (`SCADA_API_MAX_*`, `SCADA_API_VC_MAX_*`); **kodda varsayılan yok**, biri eksik/sayısal değil/≤0 ise tüm profil geçersiz (fail-closed). Dev fixture kendi dev-only limitlerini sağlar.
- **Pure validator** (`scada-api.validator.ts`): tüm servis/scope/katalog/adapter erişiminden **önce** çalışır; ham gövde yalnızca buna verilir. Kabul edilmeyen: `sql, database, schema, table, connectionString, filters, correlationId, tenantId, customerRootTenantId, isSystemAdmin, role, permissions, sourceKey, catalogId, columns…` (bilinmeyen alan ⇒ `SCADA_REQUEST_UNKNOWN_FIELD`), naif tarih, `start≥end`, azami dönem, bilinmeyen interval/istatistik/saat dilimi, UUID/tekrar/limit ihlalleri, karşılaştırmada gizli tolerance ve mapping şekli. Hata mesajı = statik kod.
- **Orkestrasyon** (`scada-analysis-api.service.ts`): limitler → pure doğrulama → provider varlığı → artifact → `TenantScopeService` scope → çağıran kaydı → **027.71 resolver** (ad-hoc istek de geçici PRIVATE preset olarak çözülür; böylece kaynak/kök/tenant/sanal-kolon-sürüm kuralları tek yerde) → 027.65 `runMany` (okuma + audit) → 027.67 kalite → 027.68 seri (+ DAILY için `rollUpToDaily`) → 027.70 sanal kolon → (027.69 karşılaştırma) → whitelist projeksiyon.
- **Audit tek sınır:** kaynak okumalarını 027.65 sorgu servisi audit eder; okumaya hiç ulaşmayan her ret (doğrulama, scope, preset, provider yok, limit) aynı port ve **aynı üç action** (`SCADA_QUERY_SUCCEEDED/DENIED/FAILED`) ile bir kez yazılır (entityId yoksa `null`, correlation id sunucu üretimli, metadata: `tenantId, customerRootTenantId, reasonCode(statik), rowCount, columnCount, durationMs, limitReason`). Preset okumaları da başarıda audit edilir. **Audit yazılamazsa veri dönmez** (`503 SCADA_AUDIT_FAILED`); ret zaten kapalıdır, ret kaydı yazılamasa da ret kalır.
- **Hata sözleşmesi:** `{statusCode, code, message}`, `message = code`; 400 doğrulama, 403 scope, **404 bilinmeyen ve "senin değil" aynı** (başka kök/başka kullanıcı preset'i, başka kök kaynak/sanal kolon), 409 alan reddi (`SCADA_PRESET_NOT_ACTIVE`, `SCADA_PRESET_VERSION_CONFLICT`, `SCADA_VIRTUAL_COLUMN_VERSION_AMBIGUOUS`, `SCADA_TIMEZONE_MISMATCH`, …), 503 yapılandırma/kaynak/audit, 500 `SCADA_INTERNAL_ERROR`. Ham provider/driver hatası hiçbir zaman dışarı çıkmaz.
- **Projeksiyon** (`scada-api.projection.ts`): alan alan whitelist; seri kimliği/etiket/birim, bucket zamanı, değer, kalite + bayraklar, tamamlanma, analiz yapılabilirlik, seçili istatistikler, kalite özeti, sanal seride yalnız `virtualColumnId/versions/sourceSeriesKeys`, preset id/sürüm, karşılaştırma (027.69 chart sözleşmesi; karşılaştırılamayan satırlar durum+neden ile görünür), kaynak durumları, statik hata kodları. İfade, SQL, fiziksel ad, credential, iç nesne yok.
- **Preset uçları:** liste ve tekil çözümleme; PRIVATE yalnız owner (başkasının id'si yerine `isOwner`), TENANT_SHARED aynı kök, inaktif preset çalıştırılmaz; tekil uç inaktif preset için okunur ama `resolution: NOT_RESOLVED` + statik kod döner. Kalıcı depo yok (CRUD kapsam dışı) ⇒ depo tokenı yoksa 503.

## Testler (213 yeni; api tam paket 2933/2933)
`__tests__/scada-analysis-api.service.spec.ts`, `scada-analysis.controller.spec.ts`, `scada-api-wiring.spec.ts`. Kapsam: geçerli analiz/karşılaştırma/preset; provider yokluğu; dev-fixture bayrağı (env kombinasyonları + gerçek `@Module` metadata); auth olmadan ret; MFA doğrulanmamış/kurulmamış ret (gerçek `MfaEnforcementGuard`); tenant kapsam dışı, başka kök, PLATFORM_ROOT/pasif/MOSEDAŞ/pasif kullanıcı; eksik/bozuk tarih, interval, istatistik, bilinmeyen alan, SQL/schema/database, correlation-id enjeksiyonu; source/series mapping zorunluluğu; PRIVATE/TENANT_SHARED izolasyonu; inaktif preset; sanal kolon sürüm belirsizliği; audit success/denied/failure-fail-closed; response/provider-hata redaksiyonu; boş kaynakta sentetik veri yok; determinizm; gerçek 0 ≠ null; DST/roll-over bayrak korunumu; 027.69 uyumu; statik (SQL/driver/log yok, MOSEDAŞ/Sirket yok, yeni permission/action yok, fixture yalnız gated, doğrulama sırası, ham gövde yalnız validator'a).
- **Mevcut testlerde iki kasıtlı güncelleme:** (1) `scada-static-security.spec.ts` ve `scada-csv-fixture.provider.spec.ts` "reporting.module SCADA içermez" kontrolleri, modülün yalnız `ScadaAnalysisController` ve `scadaApiProviders` adlarını anmasına izin verecek şekilde daraltıldı (fixture/port tokenı/CSV provider hâlâ yasak); (2) endpoint inventory snapshot'ı 4 satır.

## Mutasyon kontrolleri (gerçekten uygulandı, geri alındı, `diff` ile doğrulandı; hepsi testleri kırdı)
MFA guard kaldırma (M1) · tenant scope kontrolü: istemci-üretimli scope (M2a) ve membership guard kaldırma (M2b) · permission: guard kaldırma (M3a) ve decorator kaldırma (M3b) · provider yokken sentetik veri (M4) · istemci correlation id: audit'e (M5a) ve alan kabulü (M5b) · SQL/schema/database alanı kabulü (M6) · audit başarısızken veri (M7a) ve sorgu audit hatasının yutulması (M7b) · private preset'i başkasına gösterme (M8) · başka kök preset'ini çözme: güvenlik kuralı (M9a) ve API görünürlük kontrolü (M9b) · ham provider hatası response'a (M10) · ifade response'a (M11) · fixture'ı production'da açma (M12) · doğrulamayı scope/servis sonrasına taşıma (M13) · credential alanı projeksiyona (M14) · çağıran standing kontrolü kaldırma (M15).
**Dürüstlük notu:** M10 ilk çalıştırmada *yakalanmadı* — nedeni testin kendisiydi (sanal-kolon gövdesi sorgu sağlayıcısına ulaşmadan reddediliyordu). Test, her portu gerçekten tetikleyecek şekilde ayrıştırıldı ve M10 yeniden uygulanınca yakalandı (2 test).

## Doğrulama
`pnpm --filter api exec tsc --noEmit` temiz; `jest src --runInBand`: 98 suite / 2933 test yeşil; `./scripts/check.sh --skip-docker` (Q-ENV01 workaround) yeşil. Gerçek SQL Server/PostgreSQL, Docker, migration, smoke test **çalıştırılmadı**; git commit/push yok.

## Bilinen sınırlar / devredilenler
- Üretimde **gerçek provider yok**: katalog portu, 027.65 sorgu servisinin gerçek adaptörle kurulumu, preset/sanal-kolon depoları, roll-over politika sağlayıcısı henüz kayıtlı değil ⇒ tüm uçlar `503 SCADA_SOURCE_NOT_CONFIGURED`. Bunların kaydı gerçek kaynak/depo kararı gerektirir (aşağıda Q-W534/Q-W535).
- TENANT_SHARED **paylaşma/değiştirme/silme** (customer-root TENANT_ADMIN / sistem yöneticisi) uçları bu task'ta yok (CRUD kapsam dışı); `PresetAuthorizationPort` adaptörü CRUD task'ına devredildi.
- Export (`REPORT:ARTIFACT:EXPORT`) uçlarına dokunulmadı (027.74).

## AI1 Onayı ve Kararlar (2026-09-24)
`done`. Q-W534 kararları: (a) API zinciri **Query → Quality/Rollover → Hourly/Daily Aggregation (027.66) → Multi-Series → Comparison/Virtual Columns → Response**; (b) DAILY: INDEX = SUM, REAL_VALUE için katalogda açık aggregation policy yoksa istek reddedilir; (c) `qualityStates` yalnız görüntülenen noktaları filtreler, istatistikleri değiştirmez; (d) mevcut statik `SCADA_QUERY_*` ve domain hata kodları korunur, gereksiz yeni action/hata kodu eklenmez; (e) guard sırası korunur: JWT → MFA → Tenant Header → Membership → Permission → Input Validation; (f) 13 değişkenli, varsayılansız fail-closed limit modeli korunur, değişken adları bu dosyada ve `scada-api.env.ts` içinde belgelidir.
**Açık fark (dürüstlük notu):** teslim edilen kod zinciri 027.66 motorunu **kullanmıyor** (027.67 kalite → 027.68 `rollUpToDaily`). Karar (a) bu yüzden kod değişikliği gerektirir; `done` onayına rağmen bu hizalama `TASK-027.72-R1` kapsamına alındı (bkz. `backlog/TASK-027-72-R1-scada-provider-composition.md`). Q-W535 açık blocker olarak R1'e devredildi.

## R1 referansı (2026-09-24)
Zincir hizalaması (027.66), provider composition, dev CSV fixture ve preset authorization adaptörü `TASK-027.72-R1` ile teslim edildi (`review`): `backlog/TASK-027-72-R1-scada-provider-composition.md`. Bu dosyadaki "027.67→027.68 `rollUpToDaily`" zincir açıklaması ve sentetik `dev-scada-fixture.ts` R1 ile değiştirildi.
