---
id: TASK-027.57
title: Export Permission ve Audit
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
related: [TASK-027.54, TASK-027.55, TASK-027.56]
updated_at: 2026-09-23
---

# TASK-027.57: Export Permission ve Audit

## Amaç

Grafik analiz ekranındaki görüntüleme ve export yetkilerini ayırmak; CSV, PNG,
PDF ve XLSX işlemlerini audit'lemek.

## Bağımlılık

TASK-027.54, TASK-027.55, TASK-027.56

## Kabul kriterleri

- VIEW ve EXPORT yetkileri ayrıdır.
- Yetkisiz export render/DB çağrısı yapmadan reddedilir.
- Audit actor, tenant, format, dataset/artifact ve sonuç taşır; credential taşımaz.

## Teslim notu (2026-09-23, AI2)

### Keşif

`REPORT:ARTIFACT:EXPORT` izni (PDF/XLSX) ve `REPORT:ARTIFACT:VIEW` izni (JSON
`/data` endpoint'i, CSV/PNG'nin veri kaynağı) TASK-027.54/56'dan beri zaten
ayrı permission code'lardı — **yeni bir permission code eklenmedi**.
`PlatformAuditService` (`apps/api/src/audit/platform-audit.service.ts`) zaten
vardı: `log({actorId, actionCode, entityType, entityId, summary, metadata})`,
actor snapshot için bir `SELECT`, `scrubSecrets()` ile credential-şekilli alan
redaksiyonu, ham SQL `INSERT`, eksik tablo durumunda sessiz best-effort —
**yeni bir audit tablosu/migration eklenmedi**, mevcut sözleşme aynen
kullanıldı. `PlatformAuditController` salt-okunur ve system-admin-only —
client'ın audit yazabileceği bir endpoint yok ve bu task **böyle bir endpoint
eklemedi** (CSV/PNG sınırı için aşağıya bkz.).

`PermissionGuard` (`apps/api/src/platform/permission.guard.ts`) — platformdaki
neredeyse her korumalı endpoint'i kapsayan paylaşılan guard — daha önce hiç
kendine ait test dosyası yoktu. `platform.module.ts`/`settings.module.ts`/
`reporting.module.ts` üçü de zaten `AuditModule`'ü import ediyordu; izole bir
portta gerçek bir Nest app boot ederek doğrulandı ki `PermissionGuard`'a yeni
bir constructor bağımlılığı (`PlatformAuditService`) eklemek bu üç modülün
hiçbirini bozmuyor.

### Backend değişiklikleri (additive, mevcut sözleşme korunarak)

1. **`PermissionGuard`** — `AUDITED_DENIAL_PERMISSIONS = new Set(['REPORT:ARTIFACT:EXPORT'])`
   adlı dar bir allowlist eklendi. Sadece bu izinlerin reddi audit'leniyor —
   guard'ın kapsadığı diğer yüzlerce endpoint'in reddi platform genelinde
   audit'lenmiyor (kapsam dışı, istenmeyen bir genişleme olurdu). Red kararı
   `ForbiddenException` fırlatılmadan **önce** audit'leniyor
   (`REPORT_EXPORT_DENIED`, `entityId` route'un `:code` param'ı veya
   `'unknown'`, metadata `{tenantId, format, result:'DENIED', reasonCode:'PERMISSION_DENIED'}`).
   Audit yazımı best-effort try/catch — audit alt sistemi çökse bile red
   kararı (`ForbiddenException`) değişmiyor (fail-closed).
2. **`ReportingService.exportReport`** — 5. parametre olarak `actorId: string`
   eklendi (mevcut parametreler yeniden sıralanmadı). İçeride Jasper/fallback
   render mantığı `renderExport()` private metoduna çıkarıldı ve tek bir
   try/catch'e sarıldı:
   - Başarı → `REPORT_EXPORT_SUCCEEDED`, **sadece dosya bytes'ı gerçekten
     üretildikten sonra** yazılıyor.
   - Hata → `REPORT_EXPORT_FAILED`, orijinal hata **her zaman yeniden
     fırlatılıyor** (audit yazımı asla başarıyı/başarısızlığı maskelemiyor).
   - `classifyExportFailureReason(error)` ham exception mesajını asla audit'e
     sızdırmadan sabit bir reason code kümesine eşliyor
     (`RENDERER_NOT_CONFIGURED`, `RENDERER_HTTP_ERROR`, `RENDERER_UNREACHABLE`,
     `RENDERER_ERROR`, `INVALID_REQUEST`, `EXPORT_FAILED`).
   - Metadata: `{tenantId, artifactCode, format, result, reasonCode,
     rendererMode:'JASPER'|'FALLBACK'}` — dev fixture export'ta ayrıca
     `simulation: true` (gerçek export'ta bu alan hiç yok, `false` olarak da
     yazılmıyor — anahtar yapısal olarak yok).
   - Pasif (`isActive:false`) veya var olmayan artifact hâlâ `getArtifact`
     içinde, render/provider/audit'e hiç ulaşmadan 404 — mutation test ile
     doğrulandı (aşağıya bkz.).
3. **`ReportingController.export`** — `@CurrentUser()` decorator'ı (mevcut
   `me.controller.ts` deseni) ile JWT doğrulanmış actor'ı enjekte edip
   `exportReport`'a `user.id` olarak geçiyor.
4. **Frontend (`report-analysis-client.tsx`)** — `useTenantPermissions()` ile
   `canExportFile = can('REPORT:ARTIFACT:EXPORT')`; PDF/XLSX butonları bu
   `false` ise hiç render edilmiyor (disabled değil, DOM'da yok). Bu **sadece
   UX** — gerçek yetki sınırı hâlâ `PermissionGuard`; sahte/bayat client
   state'i olan bir kullanıcı hâlâ gerçek bir 403 alır (güvenli mesajla, ham
   backend hatası asla gösterilmez — TASK-027.56'dan beri değişmedi).

### CSV/PNG — frontend-only export sınırı (açık dokümantasyon)

CSV ve PNG dosyaları tarayıcıda, `/reports/:code/data` (JSON, `REPORT:ARTIFACT:VIEW`
gated) çağrısından dönen satırlardan üretiliyor — backend'de ayrı bir export
endpoint'i yok. Bu nedenle:

- **Yetkisiz kullanıcı veriye hiç ulaşamaz**: `/data` endpoint'i VIEW izni
  olmayan bir kullanıcıya zaten hiç satır döndürmüyor (`PermissionGuard` bunu
  render'dan önce reddediyor) — dolayısıyla CSV/PNG "export"u da dolaylı ama
  gerçek şekilde yetkilendirilmiş: yetkisiz kullanıcı export edecek veriyi
  asla göremiyor.
- **Ancak "kullanıcı CSV/PNG butonuna tıkladı" olayının kendisi
  `platform_audit_logs`'a yazılmıyor** — PDF/XLSX'in aksine. Bu bilinçli bir
  sınırdır, bir açık değil: yeni bir client-audit endpoint'i eklemek
  (`PlatformAuditController` salt-okunur/system-admin-only, client'ın audit
  yazabileceği bir yüzeyi yok) bu task'ın onaysız yeni endpoint ekleme
  yasağına takılıyordu; task ekibine (AI1) bu bir blocker olarak değil, açık
  bir kapsam kararı olarak raporlanıyor — istenirse ayrı bir task olarak
  ele alınabilir.
- Frontend'e credential/secret hiçbir amaçla (audit dahil) gönderilmedi.

### Audit sözleşmesi — kesin garantiler

- Metadata **sadece**: `actorId` (audit satırının kendi `actorId` alanı,
  `PlatformAuditService.log` içinde ayrıca actor snapshot alıyor),
  `tenantId`/`customerRootId`, `artifactCode`, `format`, `result`,
  `reasonCode` (sabit küme), `rendererMode`, (fixture ise) `simulation:true`.
- Metadata'da **asla** yok: password/hash, access/refresh token, cookie, MFA
  kodu, secret, `DATABASE_URL`, SQL metni, schema adı, ham request body,
  dosya içeriği, satır verisi (`rows` asla audit'e geçmiyor).
- Audit yazım hatası asla export sonucunu değiştirmiyor (ne success'i
  failure'a, ne failure'ı success'e çeviriyor) — hem izin reddi hem export
  render/fallback yolunda.
- Jasper ve fallback yolu **ikisi de** audit'leniyor (`rendererMode` alanıyla
  ayrıştırılıyor).

### Test kapsamı (gerçek mutation testleri ile)

**`permission.guard.spec.ts`** (yeni dosya, 11 test) — no-permission allow,
no-user deny, system-admin bypass (audit yok), granted/TENANT_ADMIN allow
(audit yok), export denial → throw + audit (tam payload assert), audit-önce-throw
sıra kontrolü, **başka bir permission code'un reddi asla audit'lenmiyor**
(scoping'in gerçek olduğunu kanıtlıyor), `entityId` fallback, audit-yazım
hatası hâlâ `ForbiddenException` (fail-closed), metadata'da credential-şekilli
alan yok.

**`reporting.service.spec.ts`** — mevcut 21 `exportReport` çağrı sitesi yeni
`actorId` parametresiyle güncellendi; yeni 13 testlik audit bloğu: success
sadece render'dan **sonra** audit'leniyor (call-order kanıtı), tam metadata
şekli (rows/simulation yok), Jasper path `rendererMode:'JASPER'`, renderer
hatası → `REPORT_EXPORT_FAILED` + güvenli reasonCode + orijinal hata aynen
yeniden fırlatılıyor (mock hata mesajının içine bilinçli olarak sahte bir
`postgres://user:pw@host/db` gömülüp metadata'ya sızmadığı kanıtlandı),
fallback-path hatası da audit'leniyor, audit-yazım hatası success/failure'ı
maskelemiyor, tenant isolation (art arda iki tenant için metadata karışmıyor),
dev-fixture `simulation:true` sadece gerçek fixture export'ta.

Ayrıca **pasif artifact kontrolü** testi güçlendirildi:
`provider.supports.mockReturnValue(true)` eklenerek 404'ün gerçekten
`getArtifact`'ın `isActive` kontrolünden geldiği (yoksa
`ReportDatasetResolver.resolve()`'ın konfigüre edilmemiş provider'ı reddetmesi
de aynı `NotFoundException`'ı üretip testi yanıltıyordu) kanıtlandı — mutation
test ile doğrulandı: `isActive` kontrolü koddan kaldırıldığında test
**gerçekten kırıldı** (`TypeError` bekleniyordu `NotFoundException` yerine),
restore edildiğinde tekrar geçti.

**`reporting.jasper-integration.spec.ts`** — tüm `controller.export(...)`
çağrıları `actorId` ile güncellendi; gerçek Jasper container'a karşı
dev-fixture export testinde `db.select` çağrı sayısı beklentisi
`not.toHaveBeenCalled()` → `toHaveBeenCalledTimes(1)` olarak düzeltildi (tek
çağrı artık `PlatformAuditService.log()`'un actor-snapshot lookup'ı —
`getArtifact` hâlâ fixture için DB'ye hiç dokunmuyor).

**Frontend (`report-analysis-client.spec.tsx`)** — `useTenantPermissions`
mock'landı (varsayılan `can: () => true`, mevcut PDF/XLSX testlerini
bozmadan); yeni 2 test: (1) `can('REPORT:ARTIFACT:EXPORT')` false iken PDF/XLSX
butonları DOM'da hiç yok, CSV/PNG hâlâ görünür; (2) true iken PDF/XLSX
görünür. 34 test, hepsi geçti.

**Gerçek (mock olmayan) canlı doğrulama** — kullanıcının kendi çalışan dev
sunucusu (port 3001, hiç yeniden başlatılmadı) üzerinden **bir** gerçek
authenticated HTTP export çağrısı yapıldı; gerçek Jasper container render
etti; sonuç Postgres'e gerçek `psql` sorgusuyla doğrulandı —
`platform_audit_logs`'ta temiz, credential'sız bir `REPORT_EXPORT_SUCCEEDED`
satırı (`rendererMode:"JASPER"`, `simulation:true`, doğru `tenantId`/
`artifactCode`/`format`/`result`/`reasonCode`) bulundu. **Kapsam net
belirtiliyor**: sadece bir başarı yolu gerçek ortamda test edildi; red
(`REPORT_EXPORT_DENIED`) ve hata (`REPORT_EXPORT_FAILED`) yolları sadece
unit/mutation seviyesinde doğrulandı, canlı ortamda tekrarlanmadı. Gerçek
tarayıcı/E2E testi yapılmadı (headless oturum). Docker build/run yapılmadı.

### Kapsam dışı (bilinçli olarak dokunulmadı)

Yeni permission code, yeni rol, yeni audit tablosu/migration, yeni Jasper
şablonu, Jasper renderer Java kodu, SCADA/SQL Server adaptörü, Wave 2/3, UI
yeniden tasarımı, production verisi, git commit/push, Docker build/run,
CSV/PNG için yeni bir client-audit endpoint'i (yukarıda gerekçelendirildi).

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → temiz.
- `pnpm --filter web exec tsc --noEmit` → temiz.
- `pnpm --filter api exec jest reporting platform audit --runInBand` → 30 suite,
  1112 test, hepsi geçti.
- `pnpm --filter web exec vitest run` → 18 dosya, 232 test, hepsi geçti.
- `NODE_PATH="$(pwd)/node_modules/.pnpm/node_modules" TURBO_ENV_MODE=loose
  ./scripts/check.sh --skip-docker` (Q-ENV01 workaround ile) → lint, tip
  kontrolü, 61 suite/1651 test, web+api build, hepsi geçti. Docker build
  `--skip-docker` ile atlandı.
- Mutation testleri: export permission kontrolü, tenant scope kontrolü, pasif
  artifact kontrolü, başarılı export audit'i, red audit'i, başarısız export
  audit'i, credential redaksiyonu, audit-hatası-asla-success'e-çevirmez
  kontrolü, Jasper/fallback path audit kontrolü — hepsi kod gerçekten
  bozulup test'in kırıldığı, sonra restore edilip tekrar geçtiği
  doğrulanarak yapıldı. `/tmp` yedekleri temizlendi, son diff temiz.

### Değişen/yeni dosyalar

- `apps/api/src/platform/permission.guard.ts` (değişti)
- `apps/api/src/platform/permission.guard.spec.ts` (yeni)
- `apps/api/src/platform/role-assignment-privilege-ceiling.spec.ts` (değişti,
  yeni constructor param için 1 satır)
- `apps/api/src/reporting/reporting.service.ts` (değişti)
- `apps/api/src/reporting/reporting.service.spec.ts` (değişti)
- `apps/api/src/reporting/reporting.controller.ts` (değişti)
- `apps/api/src/reporting/reporting.jasper-integration.spec.ts` (değişti)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.tsx` (değişti)
- `apps/web/src/app/(app)/app/reports/[id]/analysis/report-analysis-client.spec.tsx` (değişti)
