---
id: TASK-027.54-R2
title: Reporting Navigation ve Analysis Entry Point
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
related: [TASK-027.54]
updated_at: 2026-09-23
---

# TASK-027.54-R2: Reporting Navigation ve Analysis Entry Point

## Amaç

TASK-027.54 ile oluşturulan analiz ekranına web uygulaması içinden erişilebilir
bir Raporlar menüsü ve rapor seçim ekranı eklemek.

## Teslim notu (2026-09-23, AI2)

### Keşif ve kapsam kararı

`ReportingController`/`ReportingService.listArtifacts` incelendi: `GET
/reports/artifacts` zaten mevcuttu, `REPORT:ARTIFACT:VIEW` guard zinciriyle
korunuyordu ve `report_artifacts` tablosundan `isActive = true` filtreli satırları
(`code`, `title`, `description`, `isActive`, ...) döndürüyordu. Bu sözleşme, bu
task'ın ihtiyacı için yeterliydi — **backend değişikliği yapılmadı.** Web tarafında
bu endpoint'i hiçbir sayfa çağırmıyordu (grep sonucu boş); bu task'ın kapsamı
tamamen frontend'de kaldı.

### Menü (nav-config.ts / app-sidebar.tsx)

- `apps/web/src/lib/nav-config.ts`'e yeni bir `NAV_MODULES` girdisi eklendi:
  `REPORTING` (`label: 'Raporlar'`, `scope: 'TENANT'`, `requiredPermission:
  'REPORT:ARTIFACT:VIEW'` — **yeni permission kodu uydurulmadı**, mevcut kod
  kullanıldı), tek bağlantı: `Dashboard → /app/reports` (kod tabanındaki
  "Dashboard-first" standardına uyumlu — `nav-config.spec.ts`'teki genel test
  bunu otomatik doğruluyor).
- `AppSidebar`/`resolveNavModules` hiç değiştirilmedi; frontend görünürlüğü
  zaten var olan `useTenantPermissions().can()` mekanizmasıyla çalışıyor — bu,
  yalnızca menü öğesini gizler, backend guard'ının yerine geçmez (kod tabanındaki
  mevcut doc-comment ve davranış korundu).

### Yeni route: `/app/reports` (liste)

- `apps/web/src/app/(app)/app/reports/page.tsx` (yeni, sunucu bileşeni) +
  `reports-list-client.tsx` (yeni, `'use client'`) — mevcut
  `[id]/analysis/page.tsx`/`report-analysis-client.tsx` ile aynı kardeş
  dizinde, aynı desen (yükleniyor/hata/boş durum, tenant-switch'te temizle+
  yeniden yükle, ApiError status'una göre güvenli mesaj).
- Her satırda: başlık, kod (`font-mono`), `StatusBadge` ile aktif/pasif durumu
  (mevcut bileşen, ACTIVE/INACTIVE haritasını zaten biliyor), ve **yalnızca
  `artifact.isActive === true` olan** satırlarda bir "Analiz" bağlantısı:
  `/app/reports/${encodeURIComponent(artifact.code)}/analysis`. Kod, backend'in
  şu an zaten sadece aktif satır döndürdüğüne güvenmiyor — `isActive` alanı
  frontend'de de ayrıca kontrol ediliyor (savunmacı, ileride API değişse bile
  doğru davranır).
- Boş durum metni tam olarak istenen: **"Henüz kullanılabilir bir rapor
  tanımlanmamış."**
- 401/403 → "Bu rapor listesine erişim yetkiniz yok."; 5xx → "Rapor sunucusunda
  bir sorun oluştu..."; hiçbir durumda ham backend hata gövdesi/mesajı UI'a
  sızmıyor (mevcut `report-analysis-client.tsx`'teki desenle birebir aynı).
- Provider bulunmaması durumu bu ekranda değil, **analiz ekranında** (TASK-027.54
  R1'de eklenen "Veri kaynağı yapılandırılmamış" boş-durumu) zaten ele alınıyor
  — bu task o ekranı bozmadı (bkz. regresyon testi altta).

### Demo/sentetik veri sınırı — dokunulmadı

Bu task boyunca: yeni demo dataset provider, yeni startup seed, hardcoded demo
artifact veya sentetik production verisi **eklenmedi**. `docs/decisions/DEC-0012-demo-operations-removal.md`
kararı bu turda da korundu; TASK-027.54 R1'in DEC-0012 statik regresyon testleri
(`reporting.service.spec.ts`, `reporting.module.spec.ts`) bu turda dokunulmadan
geçmeye devam ediyor. Ayrıca yeni bir statik test eklendi:
`reports-list-client.spec.tsx` → component kaynağında hardcoded artifact kodu
veya demo/sample literal'i olmadığını doğruluyor.

### Testler (yeni)

- `apps/web/src/lib/nav-config.spec.ts` (+3 test): Raporlar modülü
  `REPORT:ARTIFACT:VIEW` ile görünür/`/app/reports`'a bağlanır; izin yoksa
  gizlenir; platform tenant'ında hiç çözümlenmez (TENANT scope).
- `apps/web/src/app/(app)/app/reports/reports-list-client.spec.tsx` (9 test):
  liste render (başlık/kod/Analiz linki), pasif artifact'ta link yok, kod URL
  encode, boş durum metni, 401/403, 5xx, tenant-switch temizle+yeniden yükle,
  hardcoded demo/sample literal yok (statik).
- `apps/web/src/app/(app)/app/reports/[id]/analysis/page.spec.tsx` (yeni, 1
  test): TASK-027.54'ün analiz route'unun bu turda bozulmadığının regresyon
  kanıtı — `page.tsx` async server component'ini doğrudan çağırıp doğru
  `artifactId` ile `ReportAnalysisClient`'a delege ettiğini doğrular.

### Doğrulama

- `pnpm --filter web exec vitest run`: **15 suite / 161 test PASS** (13 yeni:
  3 nav-config + 9 reports-list-client + 1 analysis-page regresyon).
- `pnpm --filter web exec tsc --noEmit`: temiz.
- `pnpm --filter api exec tsc --noEmit`: temiz (backend'e dokunulmadı).
- `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose
  ./scripts/check.sh --skip-docker` (Q-ENV01 workaround'u gerekti): tam PASS;
  `next build` yeni `/app/reports` route'unu (1.19 kB) ve mevcut
  `/app/reports/[id]/analysis` route'unu (110 kB, değişmedi) başarıyla derledi.
- Tarayıcı/E2E doğrulaması yapılmadı — bu oturum headless; görsel/etkileşim
  doğrulaması (menüde Raporlar'a tıklama → liste → Analiz linkine tıklama →
  analiz ekranı) insan (AI1) tarafından yapılmalıdır.

### Gerçek provider durumu — açık not

Reporting core'da hâlâ **sıfır kayıtlı dataset provider** var (DEC-0012'nin
varsayılan durumu, TASK-027.54 R1'de bilinçli olarak bu şekilde bırakıldı).
Bu, pratikte şu anlama geliyor: `report_artifacts` tablosunda hiç satır yoksa
`/app/reports` "Henüz kullanılabilir bir rapor tanımlanmamış." boş durumunu
gösterir; bir satır varsa ama ona karşılık gelen provider kayıtlı değilse, liste
ekranı o satırı normal şekilde gösterir (aktif ise Analiz linkiyle), ama
kullanıcı Analiz'e tıkladığında TASK-027.54 R1'in "Veri kaynağı yapılandırılmamış"
durumuyla karşılaşır — bu beklenen ve testlerle doğrulanmış davranıştır, bir
hata değildir.

### AI1 Onayı (2026-09-23)

AI1, teslimi inceledi ve `done` durumuna onayladı. Onaylanan noktalar: Raporlar
menüsünün eklenmiş olması; `/app/reports` liste ekranının oluşturulmuş olması;
aktif artifact'ların analiz ekranına doğru bağlanması; `REPORT:ARTIFACT:VIEW`
yetkisinin korunması; tenant değişiminde listenin yenilenmesi; demo
provider/seed/hardcoded artifact eklenmemiş olması; boş provider durumunun
güvenli şekilde gösterilmesi; web testlerinin ve tam `check.sh --skip-docker`'ın
başarılı olması.

### Kapsam dışı (bu task'ta yapılmadı)

CSV/PNG export, PDF/XLSX export, Jasper renderer değişikliği, SCADA/SQL Server
adapter, yeni dataset provider, yeni demo seed, yeni tenant/schema/migration,
yeni permission kodu, Wave 2/3, auth/kullanıcı status düzeltmesi, Docker,
git commit/push.

### Değiştirilen/eklenen dosyalar

- `apps/web/src/lib/nav-config.ts` (değişti — `REPORTING` modülü eklendi)
- `apps/web/src/lib/nav-config.spec.ts` (değişti — 3 yeni test)
- `apps/web/src/app/(app)/app/reports/page.tsx` (yeni)
- `apps/web/src/app/(app)/app/reports/reports-list-client.tsx` (yeni)
- `apps/web/src/app/(app)/app/reports/reports-list-client.spec.tsx` (yeni)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/page.spec.tsx` (yeni —
  TASK-027.54 route regresyon guard'ı)

Backend dosyaları bu task'ta değiştirilmedi.
