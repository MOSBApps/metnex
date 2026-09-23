---
id: TASK-027.54
title: Reporting Web Analysis Screen
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-22
---

# TASK-027.54: Reporting Web Analysis Screen

> **R2 notu (2026-09-23):** Bu ekrana web uygulaması içinden erişilebilir bir
> menü girişi ve rapor seçim ekranı `TASK-027.54-R2` ile eklendi — bkz.
> `backlog/TASK-027-54-R2-reporting-navigation.md`. Bu dosyadaki `done` durumu
> ve içerik R2 tarafından değiştirilmedi; R2 tamamen additive bir üst katman.
>
> **TASK-027.55 notu (2026-09-23):** Bu analiz ekranına development-only
> simülasyon verisi (env bayrağıyla, DB'ye hiç yazmadan) ve CSV/PNG export
> `TASK-027.55` ile eklendi — bkz.
> `backlog/TASK-027-55-csv-png-export.md`. Bu dosyanın `done` durumu ve
> içeriği TASK-027.55 tarafından değiştirilmedi; TASK-027.55 de tamamen
> additive bir üst katman (yeni backend endpoint yok).

## Amaç

Yetkili kullanıcı için SCADA/DMS kaynak ve kolon seçimi, analiz sonuçları ve
çoklu seri grafik gösterimini içeren ilk grafik ekranını oluşturmak.

## Bağımlılıklar

- TASK-027.31–027.37: registry, query, scope ve analiz temelleri
- TASK-027.49: tenant role delegation
- SQL Server read-only adapter ve dynamic query contract

## Kabul kriterleri

- Kaynak, tablo, tarih, çözünürlük ve analiz kolonları güvenli API sözleşmesiyle seçilir.
- Saatlik/günlük analiz sonuçları grafikte gösterilir.
- Çoklu seri, bağımsız scale ve empty/error/loading durumları desteklenir.
- Tenant/data scope backend tarafından uygulanır; UI parametresi yetki vermez.
- Grafik ekranı kaynak SQL Server verisini değiştiremez.
- Web/API testleri ve `./scripts/check.sh --skip-docker` raporlanır.

## Teslim notu (2026-09-22, AI2) — R1: AI1 düzeltme turu uygulandı

İlk teslimde `DemoAnalysisDatasetProvider` ve `ReportingService.onModuleInit`
ile bir demo `report_artifacts` seed'i eklenmişti. AI1 bunu haklı olarak
reddetti: bu, `docs/decisions/DEC-0012-demo-operations-removal.md` kararının
açıkça tersiydi — DEC-0012 "no rows are seeded by default" ve "zero dataset
providers registered by default" durumunu kasıtlı olarak bırakmıştı (Demo
Operations modülünün kaldırılan `DemoTransactionsDatasetProvider` + otomatik
demo artifact seed'i tam olarak bu şekildeydi). Task'ın kendi talimatı da
zaten yeni bir demo dataset/domain oluşturulmamasını söylüyordu. Bu bölüm bu
düzeltme turunu belgeler.

### 1) Demo provider/seed kaldırıldı

- `apps/api/src/reporting/dataset/demo-analysis-dataset.provider.ts` ve
  `.spec.ts` **silindi**.
- `ReportingService.onModuleInit` (idempotent demo artifact seed) **kaldırıldı**
  — servis artık `OnModuleInit` implement etmiyor, `report_artifacts` tablosuna
  hiçbir `insert` çağrısı yapmıyor.
- `ReportingModule`, `REPORT_DATASET_PROVIDERS` token'ını DEC-0012'nin
  öngördüğü şekilde tekrar literal boş diziye (`useValue: []`) döndürdü;
  `useFactory`/provider class yok.

### 2) Ekran, provider olmadan çalışıyor

Gerçek SCADA/SQL Server kaynağı yok (TASK-027.58 kapsamı, henüz implemente
edilmedi). Bu durumda `/reports/:code/data` 404 döner (artifact tanımsız veya
provider kayıtlı değil) — bu, DEC-0012'nin `render`/`export` için zaten
belirlediği ve bu ekranın da miras aldığı davranış. Ekran bu durumu ayrı,
açık bir "**Veri kaynağı yapılandırılmamış**" boş-durumuyla gösterir (önceki
turda "Rapor bulunamadı" idi — daha isabetli metne çevrildi: bu bir hata değil,
henüz hiçbir domain modülünün `ReportDatasetProvider` kaydetmediği beklenen
varsayılan durum).

Ekranın grafik/tablo/filtre/sıralama/sayfalama davranışı, gerçek bir provider'a
bağlı olmadan, yalnızca **test fixture'larıyla** (`report-analysis-client.spec.tsx`
içinde `tenantApiGet` mock'lanarak) doğrulanır — production'da hiçbir sentetik
satır üretilmez veya seed'lenmez.

### 3) "Production'da sentetik veri/artifact oluşturulmuyor" — testle kanıtlandı

- `apps/api/src/reporting/reporting.service.spec.ts` → "no regression against
  DEC-0012" bloğu: `ReportingService`'in `onModuleInit` metodu olmadığını ve
  `loadData` çağrısının hiçbir zaman `db.insert` tetiklemediğini doğrudan
  assert eder.
- `apps/api/src/reporting/reporting.module.spec.ts` (**yeni**) → statik
  kaynak-kodu taraması: `REPORT_DATASET_PROVIDERS`'ın literal boş dizi olduğunu,
  `useFactory` kullanılmadığını, providers listesinde `Seed`/`Demo` adlı hiçbir
  şey olmadığını ve demo provider dosyasının artık var olmadığını doğrular.
  Mock DB davranışsal testi "bir provider kayıtlı değil" ile "kayıtlı bir
  provider bu testte eşleşmiyor" durumunu ayırt edemediği için (bu oturumda
  daha önce de karşılaşılan bir mock sınırlaması) statik kaynak taraması tercih
  edildi.

### 4) Recharts bağımlılık onayı — kayıt

Repo'da grafik ekranı talep edilmeden önce hiçbir grafik kütüphanesi yoktu
(`apps/web/package.json`'da chart/recharts/visx/d3/plot için grep sonucu boş).
AI1'e AskUserQuestion ile "hangi grafik kütüphanesi?" soruldu; **açık cevap:
"Recharts olsun. ... Grafik bizim en can alıcı noktamız."** Bu, task'ın kendi
sınırındaki "Grafik kütüphanesi repo bağımlılıklarında yoksa yeni bağımlılığı
onaysız ekleme" kuralının gerektirdiği onaydır — burada resmi kayda alınıyor.
`recharts@^3.10.1`, `apps/web/package.json`'a eklendi; başka bir bağımlılıkla
(mevcut hiçbir paket grafik çizmiyor) çözülmesi mümkün değildi.

### 5) Reporting API tenant/artifact izolasyonu — korundu, ayrıca test edildi

- `getArtifact`/`listArtifacts` mevcut davranış: `report_artifacts` tenant'a
  göre filtrelenmeyen genel bir katalog (DEC-0012 öncesi de böyleydi) —
  gerçek veri izolasyonu her domain modülünün kendi `ReportDatasetProvider`'ında
  `tenantId` ile uygulanır. Bu mimari değiştirilmedi.
- `ReportingService.loadData` her çağrıda `tenantId`'yi filtrelerden bağımsız,
  değiştirmeden `provider.loadDataset(tenantId, filters)`'a iletir — yeni
  "tenant isolation" test bloğu bunu doğrudan doğrular: (a) `filters` içine
  başka bir tenant kimliği konsa bile gerçek `tenantId` argümanı bozulmuyor,
  (b) art arda iki farklı tenant için çağrı, provider'a çağrı başına doğru ve
  ayrık `tenantId` iletiyor (paylaşılan/kalıcı state yok).
- `endpoint-authorization-inventory.spec.ts` snapshot'ı değişmedi (97 endpoint)
  — `GET /reports/:code/data` guard zinciri (`JwtAuthGuard`/`PermissionGuard`/
  `MfaEnforcementGuard`, `REPORT:ARTIFACT:VIEW`) bu turda değişmedi.

### Backend (additive, mevcut render/export akışı değişmedi)

- `GET /reports/:code/data` — `REPORT:ARTIFACT:VIEW` (render ile aynı
  permission), `JwtAuthGuard`/`PermissionGuard`/`MfaEnforcementGuard` zinciri.
- `ReportingService.loadData` — artifact + provider çözümlemesini `renderHtml`
  ile paylaşır, HTML üretmez; `{ artifact, rows, totalAmount }` döner.
  Provider kayıtlı değilse (şu an varsayılan durum) 404 döner.
- Yeni backend testleri: `reporting.service.spec.ts` 8 test (loadData + tenant
  isolation + DEC-0012 regresyon guard'ı) + `reporting.module.spec.ts` 3 test
  (yeni) = 11.

### Frontend

- Yeni route: `apps/web/src/app/(app)/app/reports/[id]/analysis/` (mevcut
  `[id]/view/` kardeşi) — filtreler (arama, durum), stat kartları, Recharts
  `LineChart` ile günlük toplam tutar zaman serisi, durum dağılımı (status
  token renkleri + etiket, renk tek başına anlam taşımıyor), sıralanabilir ve
  sayfalanan tablo, provider yoksa "Veri kaynağı yapılandırılmamış" durumu.
- Tenant değişiminde (`TENANT_CHANGE_EVENT`) veri temizlenip otomatik yeniden
  yükleniyor; 401/403/5xx durumlarında ham backend hata mesajı UI'a sızmıyor.
- Pure veri dönüşümleri (`chart-data.ts`: `buildDailyTotals`, `buildStatusBreakdown`)
  ayrı dosyada, doğrudan test edilebilir; gerçek/demo veri kaynağı gerektirmez.
- Yeni frontend testleri: 7 (`chart-data.spec.ts`) + 7 (`report-analysis-client.spec.tsx`,
  mock fixture'larla, gerçek/demo backend verisine bağımlı değil) = 14.

### Doğrulama (bu düzeltme turu sonrası)

- `pnpm --filter api exec jest --runInBand`: 58 suite / 1571 test PASS.
- `pnpm --filter web exec vitest run`: 13 suite / 149 test PASS.
- `tsc --noEmit` (api, web): temiz.
- `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker`
  (Q-ENV01 workaround'u gerekti): PASS.
- Tarayıcı/E2E doğrulaması yapılmadı — bu oturum headless; görsel/etkileşim
  doğrulaması insan (AI1) tarafından yapılmalıdır.

### Kapsam dışı (bu task'ta yapılmadı)

CSV/PNG export, PDF/XLSX/Jasper export, export permission/audit, SCADA SQL
Server adapter, gerçek çoklu seri/kaynak seçimi, yeni permission kodu, yeni
tenant/schema/migration, yeni demo/domain veri kaynağı, Docker, gerçek
DB/production verisi, git commit/push.

### AI1 Onayı (2026-09-22)

AI1, R1 düzeltme turunu inceledi ve `done` durumuna onayladı. Onaylanan noktalar:
demo provider ve startup seed'in kaldırılmış olması; provider listesinin boş
olması ve production'da sentetik veri üretilmemesi; `/data` 404 durumunun
güvenli boş ekranla yönetilmesi; tenant izolasyonunun testlerle doğrulanmış
olması; Recharts kullanımının kayıtlı onaya dayanması; `check.sh --skip-docker`
tam PASS. **Açık risk (kapanmayı engellemiyor):** tarayıcı/E2E doğrulaması bu
oturumda yapılmadı (headless AI2 oturumu) — ileride gerçek bir veri kaynağı
(domain modülü `ReportDatasetProvider` kaydettiğinde) bu ekranın görsel/etkileşim
doğrulaması insan tarafından ayrıca yapılmalıdır. AI1 dosya/status/Git değişikliği
yapmadı.

### Değiştirilen/eklenen dosyalar (bu düzeltme turu)

- `apps/api/src/reporting/reporting.controller.ts` (değişti — R0'dan, değişmedi)
- `apps/api/src/reporting/reporting.service.ts` (değişti — demo seed kaldırıldı)
- `apps/api/src/reporting/reporting.module.ts` (değişti — provider dizisi tekrar boş)
- `apps/api/src/reporting/reporting.service.spec.ts` (değişti — demo testleri
  kaldırıldı, tenant-isolation + DEC-0012 regresyon testleri eklendi)
- `apps/api/src/reporting/reporting.module.spec.ts` (yeni — DEC-0012 statik guard)
- `apps/api/src/reporting/dataset/demo-analysis-dataset.provider.ts` (**silindi**)
- `apps/api/src/reporting/dataset/demo-analysis-dataset.provider.spec.ts` (**silindi**)
- `apps/api/src/platform/endpoint-authorization-inventory.spec.ts` (değişti —
  snapshot 97 endpoint, R0'dan değişmedi)
- `apps/web/package.json` (değişti — recharts eklendi, onay kaydı yukarıda §4)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/page.tsx` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.tsx`
  (yeni — provider-yok durumunun metni düzeltildi)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/chart-data.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/chart-data.spec.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.spec.tsx`
  (yeni — fixture adlandırması "demo" çağrışımından arındırıldı)

