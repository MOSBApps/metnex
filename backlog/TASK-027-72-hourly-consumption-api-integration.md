---
id: TASK-027.72
title: Hourly Consumption API Entegrasyonu
status: done
srs_refs: [FR-014, FR-016, FR-018, FR-019, FR-020, FR-021, FR-024, FR-028, FR-039, FR-047, FR-051, FR-057, SEC-DATA-001, SEC-EXPORT-001, AC-004, AC-005]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.72: Hourly Consumption API Entegrasyonu

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.72

## Başlık

Hourly Consumption API Entegrasyonu

## Durum

planned

## Amaç

Önceki servisleri (katalog, analiz sorgusu, aggregation, kalite, seri/istatistik, karşılaştırma, sanal kolon, preset) **HTTP API** olarak sunmak; guard zinciri, tenant scope, hata sözleşmesi ve audit’i uçtan uca uygulamak.

## Ön koşullar

- TASK-027.71 `done`; önceki task’ların kalan noktaları kapanmış olmalı.
- **Kapanan karar kapıları:** Q-W511, Q-SC03, Q-W513, Q-SA01–Q-SA07, Q-SP02.
- **Kalan (ready olmadan önce):** Q-W516 (katalog yönetimi platform operasyon yetkisi — bu task yönetim endpoint’i içermeyecekse **engel değil**), Q-W517, Q-W520; PackageFeature guard gereksinimi (güvenlik mimarisi §3.5) ve API yolları/DTO adları AI1 onayı.

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W511 C:** analiz görüntüleme/export için mevcut `REPORT:ARTIFACT:VIEW` / `REPORT:ARTIFACT:EXPORT`; katalog/allowlist yönetimi analiz kullanıcılarına verilmez; **yeni permission kodu uydurulmaz**.
- **Q-SC03 B / Q-W513 C:** ayrı SCADA analiz sözleşmesi; yanıt versiyonlu normalize analiz sonucu sözleşmesidir.
- **Audit (Q-SA01–07):** tek yazım noktası ve `SCADA_QUERY_*` sözleşmesi; **audit yazılamazsa sonuç dönmez**; correlation id sunucuda.
- **Q-E04:** `apps/api/src/reporting/scada/api/`.

## Kapsam

- Endpoint’ler (öneri, **yol/ad kararı AI1’de**): kaynak listesi, seçili kaynağın kolon listesi, analiz çalıştırma (çözünürlük, aralık, kolonlar, karşılaştırma), sanal kolon CRUD, preset CRUD.
- Guard zinciri mevcut kalıpla: `JwtAuthGuard` → `PermissionGuard` (`REPORT:ARTIFACT:VIEW` görüntüleme/analiz; `REPORT:ARTIFACT:EXPORT` export) → `MfaEnforcementGuard` (+ `PackageFeatureGuard` gerekiyorsa); tenant `requireTenantId()`; **istekten gelen tenant/`Sirket`/kaynak adı alanları reddedilir**. **Katalog yönetimi endpoint’i bu task’ta yok** (Q-W511 C, Q-W516).
- DTO doğrulaması (ValidationPipe/şema), boyut/aralık sınırları, statik hata kodları (403/404 ayrımı bilgi sızdırmaz), timeout/iptal yayılımı.
- Export endpoint’leri TASK-027.74’te; bu task yalnızca görüntüleme/analiz.
- Endpoint yetkilendirme envanteri (`endpoint-authorization-inventory.spec.ts`) güncellenir; yetki matrisi teslim raporunda verilir.

## Kapsam dışı

- UI (TASK-027.73), export/Jasper (027.74), E2E kabul (027.59).
- Yeni permission/rol, yeni tenant, MOSEDAŞ tenantı, `Sirket` yetkisi.
- Serbest SQL/kullanıcı kontrollü identifier; write endpoint’leri SCADA kaynağına.

## Bağımlılıklar

TASK-027.71. Sonraki: TASK-027.73.

Zincir: `TASK-027.71` → **TASK-027.72** → `TASK-027.73`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/api/* (controller/DTO; yeni, **olası**) ve uygulama modülü kaydı (apps/api/src/app.module.ts)
- apps/api/src/platform/endpoint-authorization-inventory.spec.ts (yeni endpoint’ler)
- docs/security/APPLICATION_SECURITY_ARCHITECTURE.md (yalnızca izin modeli değişirse), docs/runbooks/*

## API/UI/veri sözleşmesi

- **API (yollar/DTO alanları AI1 onayıyla kesinleşir):** liste/kolon/analiz/sanal kolon CRUD/preset CRUD; yanıt versiyonlu normalize analiz sonucu (Q-W513 C: zaman kovası, seri, ham, analiz, karşılaştırma, kalite) + istatistik + ölçek ipuçları. Hata gövdesi statik kod; DENIED/FAILED ayrımı D6.1’e göre.
- Sayısal değerler ham `number`; biçim/locale UI’da (`tr-TR`).
- **UI:** yok.

## Tenant ve permission kuralları

- Her endpoint: kimlik + izin (`REPORT:ARTIFACT:VIEW/EXPORT`) + tenant scope + katalog allowlist; “UI parametresi yetki vermez” (AC-004). Yeni permission yok.
- Analiz VIEW/EXPORT reddi audit’i: SCADA sorgu reddi `SCADA_QUERY_DENIED` sözleşmesiyle (Q-SA01); export reddi mevcut `REPORT_EXPORT_DENIED` kalıbıyla (TASK-027.57) — çift yazım olmaz.
- Root aggregation yalnızca çözümlenen kapsam; impersonation mevcut kurallarını korur.

## Audit ve güvenlik kuralları

- Audit sözleşmesi (`SCADA_QUERY_*`, D1–D7) uygulanır; **audit yazılamazsa yanıt dönmez**; correlation id sunucu üretimli ve yanıt/log/audit zincirinde aynıdır; endpoint audit’i servis audit’iyle **çift yazılmaz** (tek yazım noktası).
- Hata yanıtları ve loglar SQL/host/schema/secret içermez; korelasyon kimliği kaynağı Q-SA07.

## Test senaryoları

1. Her endpoint için: kimlik yok/izin yok/tenant yok/kapsam dışı kaynak → beklenen kod, sürücüye/servise ulaşmadan.
2. DTO: fazladan alan (`sql`, `tenantId`, `sirket`, `database`…) reddi; sınır aşımı; tip hataları.
3. Yetki matrisi testi + `endpoint-authorization-inventory` güncel; tenant izolasyonu ve root aggregation uçtan uca (mock adapter).
4. Hata sözleşmesi: statik kodlar, ham hata sızıntısı yok; timeout/iptal.
5. Audit: başarı/ret/hata satırları izinli alanlarla (matris).

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Guard/izin kaldırılınca yetki matrisi testi kırılır.
2. DTO alan katılığı kaldırılınca fazladan-alan testi kırılır.
3. Scope kontrolü kaldırılınca izolasyon testi kırılır.
4. Hata maskeleme kaldırılınca sızıntı testi kırılır.

## Kabul kriterleri

- Tüm endpoint’ler guard zincirine sahiptir; yetki matrisi teslim raporundadır; yeni izin yoktur (veya AI1 kararıyla vardır).
- Gerçek SQL Server olmadan mock adapter ile uçtan uca akış çalışır.
- `tsc`, `jest reporting platform audit`, `check.sh --skip-docker` geçer; gerçek DB/HTTP/tarayıcı testi yapılmadıysa açıkça raporlanır.
- Security architecture belgesi (yetki modeli) ve endpoint envanteri güncel.

## Rollback yaklaşımı

Controller/modül kaydı kaldırılarak endpoint’ler kapatılır; alttaki servisler çağıransız kalır. Migration bu task’ta yok.

## Sonraki task

TASK-027.73

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Hayır (mock adapter/DB). Canlı HTTP doğrulaması kullanıcının kendi dev sunucusunda, açık onayla; Docker/SQL Server yok.

## AI1/PO kararı gerektiren açık sorular

- **Q-W516** — Katalog/allowlist yönetim yetkisi: “daha yüksek yetkili platform operasyon kapsamı” mevcut hangi izin/rol (yeni kod uydurulmaz)
- **Q-W517** — `TENANT_SHARED` preset paylaşma/yönetme yetkisi hangi mevcut izinle sınırlanacak
- **Q-W520** — `CANCELLED` audit action kodu ve güncel reasonCode sözlüğü
- PackageFeature guard gereksinimi
- API yolları/DTO adları (AI1 onayı)

## BOTC referansı

- **Referans davranış:** `HourlyConsumptionWindow` akışının tamamı (kaynak → tablo → kolon → hesapla), `DataSourceService`/`QueryService` UI çağrıları.
- **Taşıma sınırı:** Taşınmaz: UI’nın doğrudan servis/`SqlConnection` çağırması, `_dataSources.GetConnectionString(...)` çağrısının istemci koduna sızması, istemci tarafı yetki (`CanViewHourlyReport`) kontrolü.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Sanal kolon çıktı sözleşmesi (TASK-027.70)
`VirtualColumnResult { status: OK|PARTIAL|BLOCKED, code, customerRootTenantId, series[VirtualSeriesOutput], failures[{virtualColumnId, code}] }`; `series[]` 027.68/027.69 girdi/çıktısıyla uyumlu (`ScadaSeriesOutput` + `virtual` meta). İfade metni, SQL, tablo/şema/DB adı hiçbir yanıtta dönmez; hata kodları statik (`VIRTUAL_COLUMN_*`). Audit event'i (`virtualColumnId, catalogId, customerRootTenantId, version, result, reasonCode`) yalnızca port üzerinden (action adları Q-W519). Ayrıntı: `backlog/TASK-027-70-scada-virtual-columns.md`.


## 2026-09-24 — Preset çözümleme sözleşmesi (TASK-027.71)
API, `resolvePreset({caller, presetVersions, at, limits, sources, virtualColumnDefinitions})` / `ScadaPresetService.resolve` ile **`AnalysisPlan`** alır (`ok:false` ⇒ statik `PresetErrorCode`; `PRESET_SCOPE_BLOCKED` başka kök/başka kullanıcı/pasif-çözümsüz tenant için aynıdır, neden söylenmez). Plan tenant kapsamı, çözülmüş sanal kolon sürümleri, zaman aralığı/interval/saat dilimi taşır; `planToSeriesRequestBase`/`planToComparisonInputs`/`selectPlannedDefinitions` 027.68/.69/.70 girdilerini üretir. Kalıcı repository, `PresetAuthorizationPort` adaptörü (**Q-W517 kararı gerekir**) ve audit adaptörü (action adları Q-W519) bu task'ta yazılacak; `PresetLimits` ve kaynak kataloğu görünümü (`PresetSourceInfo`) API tarafından sağlanır.

## 2026-09-24 — Q-W517/Q-W533 kararları (027.72'ye devir)
`PresetAuthorizationPort` adaptörü: paylaşma/değiştirme/silme = customer-root TENANT_ADMIN veya sistem yöneticisi; kullanma/görüntüleme = mevcut `REPORT:ARTIFACT:VIEW`; yeni permission yok. `PresetLimits` environment/source profile'dan okunur, eksik/geçersiz ⇒ istek bloklanır.

> **Durum notu (2026-09-24):** Teslim kaydı `backlog/TASK-027-72-scada-reporting-api.md` (`review`). Bu dosya yalnızca planlama kaydıdır.
