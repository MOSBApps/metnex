---
id: TASK-027.71-R1
title: Development Virtual Column Store ve Yönetim Akışı
status: done
parent_epic: EPIC-004
related: [TASK-027.70, TASK-027.71, TASK-027.72-R1, TASK-027.73, TASK-027.73-R4]
updated_at: 2026-09-24
---

# TASK-027.71-R1: Development Virtual Column Store ve Yönetim Akışı

## Durum
done (AI1 onayı, 2026-09-24)

## Amaç
Development ortamında: sanal kolon oluştur → formülü doğrula → kaydet → aktif et → analiz ekranında seç → gerçek CSV verisiyle hesapla → grafik/tabloda fiziksel seriyle birlikte gör. PostgreSQL/migration/seed yok; veri API restart'ında silinir; yeni permission yok.

## Teslim edilen — backend
- **`api/dev-virtual-column.store.ts` (`DevVirtualColumnStore`):** yalnız süreç belleği (db/fs/ağ/cache import'u yok — testle taranır). customer-root'a göre izole; kimlik = (root, catalogId, seriesKey): aynı seri yeniden tanımlanırsa **aynı `virtualColumnId`nin yeni sürümü** (monoton 1,2,3…; tekrar/atlama `VERSION_CONFLICT`); girdi/çıktı derin kopya; **silme yok** (yalnız DRAFT/ACTIVE/DISABLED/BLOCKED). Expression yalnızca burada, bellekte tutulur.
- **Etkinlik (dört koşul):** store **ve** yönetim controller'ı (`scada-virtual-column.controller.ts`) yalnız `NODE_ENV=development` + `REPORTING_DEV_FIXTURES=true` + `REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=true` + geçerli IANA dilim ile kayıtlıdır (`scadaApiControllers()` / `scadaApiProviders()`); aksi halde **rotalar yoktur (404)**, store yoktur. Gerçek `@Module` metadata testiyle kanıtlandı.
- **Endpoint'ler:** `GET/POST /reports/:code/analysis/virtual-columns`, `POST …/:id/activate`, `POST …/:id/disable`. Aynı guard zinciri (JWT→MFA→header→membership) ve **mevcut `REPORT:ARTIFACT:VIEW`** (yeni izin yok). Yazma yetkisi serviste mevcut rol modeliyle: **aktif sistem yöneticisi veya ilgili customer-root `TENANT_ADMIN`** (composition'daki `DbScadaPresetAuthorization`); normal kullanıcı yalnız **listeler** (`canManage:false`) ve ACTIVE kolonu kullanır; port yoksa kimse yazamaz (fail-closed). Ret = `SCADA_SCOPE_DENIED`.
- **İstek alanları (TASK-027.70 sözleşmesi):** yalnız `label, unit, catalogId, seriesKey, expression, inputSeriesKeys`. Diğer her alan (`tenantId, customerRootTenantId, role, permissions, sql, schema, database, table, connectionString, version, status, createdBy, expressionAst, virtualColumnId, valueType, effectiveFrom…`) `SCADA_REQUEST_UNKNOWN_FIELD`; `version/status/id/createdBy/valueType/pencere` sunucuda üretilir/türetilir (valueType = girdi serilerinin tipi; karışık ⇒ `SCADA_MIXED_VALUE_TYPES`). **`name`** sözleşmede yoktur: yalnız `label` takma adı olarak kabul edilir (ikisi farklıysa ret) — bkz. Q-W541.
- **Doğrulama = 027.70 `compileDefinition`** (doğrudan): allowlist DSL, JS/SQL/eval/property/atama/yorum/`;`/ok fonksiyonu reddi, bilinmeyen/doğrulanmamış girdi, kendine referans, ROUND hassasiyeti, derinlik/operatör/uzunluk limitleri (dışarıdan), fiziksel kolon adını gölgeleme reddi. Başarısızlıkta **hiçbir şey saklanmaz**; hata yalnız statik kod (`SCADA_VIRTUAL_COLUMN_INVALID` / `SCADA_LIMIT_EXCEEDED` / `SCADA_REQUEST_INVALID`), expression yankılanmaz.
- **Durumlar:** create ⇒ DRAFT; activate = **son sürüm**, mevcut katalogla yeniden doğrulanır (uymazsa **BLOCKED** ve hata), diğer ACTIVE sürümler DISABLED; disable ⇒ DISABLED. Başka root'un kolonu = `SCADA_NOT_FOUND`.
- **Analiz zinciri:** mevcut `virtualColumnIds` yolu (027.71 çözümleyici + 027.70 değerlendirici) kullanılır; CSV → sorgu → kalite → aggregation → fiziksel seri → sanal kolon → multi-series/istatistik. Kaynak null ⇒ sanal sonuç **null** (0 değil), kalite bayrakları korunur (`analysisAllowed=false` olabilir); gerçek 0 geçerli; sıfıra bölme/NaN/taşma ⇒ `null` + statik bayrak. Yanıtta sanal seri `virtual:{virtualColumnId, versions, sourceSeriesKeys}` taşır; **expression/createdBy hiçbir yanıtta yok** (whitelist projeksiyon).
- Audit: aynı üç action (başarı/ret); expression audit'e girmez.

## Teslim edilen — web
`scada-virtual-column-panel.tsx` (yalnız **katalog geliştirme etiketi taşıyorsa** ve liste rotası varsa render edilir; 404 ⇒ gizli; production'da görünmez): liste (durum/birim/sürüm), ACTIVE + seçili kaynağa ait kolonu "Kullan", yönetici için "Yeni sanal kolon" formu (etiket, birim, seri anahtarı, kaynak, doğrulanmış girdi serileri, formül), "Doğrula ve kaydet", "Aktif et", "Devre dışı bırak". Hata **statik Türkçe mesaj** (sunucu metni/expression gösterilmez); expression kayıttan sonra bellekten silinir, URL/storage/console/analytics'e yazılmaz; tenant değişiminde liste/seçim/form temizlenir, eski yanıt ezemez; işlem sırasında kontroller kilitli; etiket "Geliştirme CSV snapshot verisi". Analiz gövdesine `virtualColumnIds`; grafikte/tabloda/kartlarda sanal seri **"(sanal)"** işaretli, `getSeriesColor(seriesKey)` ile deterministik renk; label/unit store'dan.

## Testler
Api: `dev-virtual-columns.spec.ts` (61) + `scada-virtual-column.controller.spec.ts` (2): kapı/metadata (rota-yokluğu, store-yokluğu), restart (yeni store boş), sürüm monotonluğu/kopya, 19 hatalı formül (SQL/JS/eval/property/atama/yorum/ok/bilinmeyen/rekürsif/ROUND/derinlik/operatör) hiçbiri saklanmaz, uzunluk limiti, bilinmeyen/doğrulanmamış/gölgeleyen girdi, karışık tip, 16 yasak alan, `name` takma adı, alan doğrulaması, yetki (normal kullanıcı yazamaz, admin/tenant-admin yazar, port yok ⇒ ret, pasif tenant), tenant izolasyonu (sızdıran store'a karşı da), durum geçişleri + BLOCKED, gerçek hesaplama, fiziksel+sanal birlikte, null≠0, gerçek 0, sıfıra bölme/taşma/NaN, DRAFT/DISABLED çalışmaz, determinizm, expression'ın response/audit/console'a sızmaması, **gerçek CSV** ile hesaplama (snapshot yoksa atlanır). Web: `scada-virtual-column-panel.spec.tsx` (11) + client entegrasyonu (2). Toplam: api 3201/3201 (108 suite), web 306/306.

## Mutasyon kontrolleri (uygulandı, geri alındı, `cmp` ile doğrulandı — hepsi testleri kırdı)
Production'da controller (3) ve store (3) · tenant izolasyonu: store (1) ve servis süzgeci (1) · normal kullanıcıya yazma (2) · validator'ı kaldırma (18) · bilinmeyen seriyi kabul (2) · null→0 (12) · expression'ı response'a koyma (1) · version kontrolünü kaldırma (1) · restart sonrası store'u koruma (49) · formu production'da gösterme (8). **Dürüstlük notu:** servis düzeyindeki root süzgeci mutantı ilk turda kaçtı (store zaten izole ettiği için); "sızdıran store" testi eklendi ve yakalandı.

## Doğrulama
`pnpm --filter api exec tsc --noEmit` ve `--filter web` temiz; api `jest src`; web `vitest run`; eslint hata yok; `./scripts/check.sh --skip-docker` yeşil. PostgreSQL/Docker/SQL Server/migration kullanılmadı; git commit/push yok. Mevcut testlerde güncelleme: controller-modül "mentions" testleri (`scadaApiControllers`), endpoint inventory (+4 satır), wiring testinde ham gövde sayacı (3 doğrulayıcı).
**Manuel doğrulama yapılamadı** (Docker gerekir; çalışan sunuculara/`.env`'e dokunulmadı). Adımlar: `REPORTING_DEV_FIXTURES=true`, `REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=true`, geçerli dilim ile API'yi (yeniden) başlatın; **sistem yöneticisi veya kök TENANT_ADMIN** ile Raporlar → SCADA Saatlik/Günlük Analiz → "Yeni sanal kolon" → (ör. `GT2_BUHAR_URETIM_TON + GT3_BUHAR_URETIM_TON`) → Doğrula ve kaydet → Aktif et → kaynak/seri/aralık seç, kolonu "Kullan" → Analiz Çalıştır. Not: API yeniden başlayınca kolonlar silinir.

## Açık nokta
Bkz. Q-W541.

## AI1 Onayı ve Q-W541 Kararları (2026-09-24)
`done`. Kararlar: (a) `name` alanı sözleşmede olmadığı için **reddedilir** (yalnız `label`) — kod bu karara göre güncellendi: `name` artık takma ad değil, bilinmeyen alan (`SCADA_REQUEST_UNKNOWN_FIELD`); yukarıdaki "`name` takma adı" ifadesi geçersizdir; (b) activate son sürümü etkinleştirir ve aynı kolonun diğer ACTIVE sürümlerini devre dışı bırakır (mevcut davranış); (c) işlem sırası kabul edildi: Physical query → Quality/Rollover → Aggregation → Virtual Column Evaluation → Multi-Series/Statistics (sanal kolon kovalanmış fiziksel seriler üzerinde hesaplanır ve sonuç multi-series/istatistiğe dahil edilir); (d) development-only bellek-içi store (DB'ye yazmaz, dört kapıyla sınırlı) kabul edildi.

## 2026-09-24 — TASK-027.59-R1 referansı
Development bellek-içi preset store de aynı dört kapı ve in-memory desenini kullanır: `backlog/TASK-027-59-R1-wave5-preset-source-completion.md`.
