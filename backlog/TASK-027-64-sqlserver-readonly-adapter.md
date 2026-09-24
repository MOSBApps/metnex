---
id: TASK-027.64
title: SQL Server Read-only Adapter
status: done
srs_refs: [FR-014, FR-016, FR-017, SEC-DATA-001, SEC-DATA-002, AC-004, AC-005]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.64: SQL Server Read-only Adapter

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.64

## Başlık

SQL Server Read-only Adapter

## Durum

planned

## Amaç

Katalog/allowlist’e dayalı, **salt-okunur**, parametreli, timeout/iptal/limit korumalı bir SQL Server erişim katmanı (port + adapter) uygulamak. Bu task, `TASK-027.58` test sözleşmesinin **gerçek adapter’a karşı koşturulduğu** ilk yerdir.

## Ön koşullar

- TASK-027.63 `done`.
- **Kapanan karar kapıları:** Q-SC02, Q-M05, Q-SP02, Q-W512, Q-SA01–Q-SA07, Q-AD01, Q-SR01, Q-E04, Q-SC03, Q-W511 (bkz. “Bağlayıcı karar kapanışları”).
- **Kalan (ready olmadan önce):** Q-W520 (`CANCELLED` audit’inin action kodu ve güncel `reasonCode` sözlüğü), SQL Server sürücüsü/bağımlılık onayı, Q-SR01 katmanlı redaction genişletmesinin task’a bağlanması (audit adaptörü allowlist ile kurulduğundan **engel değil**, ama değer-desenli maskeleme ayrı task).
- **Bu task `planned` kalır:** TASK-027.63 tamamlanana kadar `ready` yapılmaz.

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-SC02 C:** yeni allowlist tabanlı adapter; `DynamicDataSources`/`FromSqlRaw` taşınmaz; browser’dan raw SQL/identifier yok; canlı `INFORMATION_SCHEMA` keşfi yok.
- **Q-M05 C:** ilk sürümde **canlı read-only** SQL Server sorgusu; veri PostgreSQL’e kopyalanmaz; cache/fan-out yok; gerçek performans ölçümleri toplanır.
- **Q-SP02 B:** limitler kod içine sabitlenmez, kaynak/ortam profilinden gelir; eksik/geçersiz limit → **fail-closed ret**; limit değişiklikleri versiyon+audit.
- **Q-W512 C:** kaynak saat dilimi katalogdan; veri **UTC’ye normalize**; saat dilimi bilinmeyen kaynak fail-closed; DST açık.
- **Audit (Q-SA01–07, Q-AD01 A, Q-SR01 B):** `SCADA_QUERY_SUCCEEDED/DENIED/FAILED`; `entityType=ScadaAnalysisQuery`, `entityId`=katalog UUID; kaynak başına bir satır; **limit aşımı=DENIED**; her başarı audit; **audit yazılamazsa sonuç dönmez (fail-closed)**; eşzamanlılık reddi ve iptal (`CANCELLED`) audit; metadata `rowCount/columnCount/durationMs/limitReason`; correlation id **sunucu üretimli**; mevcut `platform_audit_logs`.
- **Q-E04:** `apps/api/src/reporting/scada/adapter/`.

## Kapsam

- Port arayüzü (`read(actor, scope, request)`, `listSources(scope)`) — TASK-027.58 sözleşmesinden **kararlara göre güncellenmiş** imza: kaynak kimliği **katalog UUID’si**; istek/yanıtta zaman UTC; limitler katalog profilinden.
- Salt-okunur ifade üretimi: yalnızca katalogdaki sabit identifier’lardan `SELECT`; tüm değerler bağlı parametre; `assertReadOnlyStatement` benzeri son savunma; DML/DDL/EXEC yolu **kodda yok**.
- Ayrı read-only credential ve ayrı bağlantı havuzu (PostgreSQL `pg.Pool`’dan bağımsız); credential yalnızca secret store/ortamdan.
- Timeout/iptal (`AbortController` + sürücü iptali; sürücü sinyali yok saysa bile süre sınırı), retry yok, satır/kolon/payload/tarih aralığı/pool/eşzamanlılık limitleri **kaynak profilinden**; eksik/geçersiz limit veya bilinmeyen saat dilimi → sürücüye gitmeden **fail-closed ret**; **limit aşımı `DENIED`** (D6.1).
- Ham SQL Server hata metni asla dışarı çıkmaz; statik reason code’lar. **Audit (karar paketi kapandı):** `SCADA_QUERY_SUCCEEDED/DENIED/FAILED`, `entityType=ScadaAnalysisQuery`, `entityId`=katalog UUID, kaynak başına bir satır; başarılar örneklenmez; eşzamanlılık reddi ve iptal audit’lenir; **audit yazılamazsa sonuç kullanıcıya dönülmez**; correlation id sunucuda üretilir (istemci header’ı güvenilmez).
- **TASK-027.58 sözleşme suite’inin (105 + matris) kararlara göre güncellenmesi** ve gerçek adapter’a bağlanması: limit aşımı `DENIED`, audit **fail-closed**, ek metadata (`rowCount/columnCount/durationMs/limitReason`), katalog UUID’si, sunucu correlation id, `SCADA_QUERY_*` action’ları; mutasyon kontrolleri.
- Sonuçta zaman damgaları katalogdaki kaynak saat dilimine göre **UTC’ye normalize** edilir; naive datetime **çıktıya sızmaz**; DST belirsiz/tekrarlı saatleri açıkça ele alınır (davranış sözleşmede tanımlı, gizli varsayım yok).
- Canlı sorgu performans ölçümleri (süre, satır, payload) toplanır ve raporlanır; **eşik uydurulmaz** (Q-SP02 B: profil verisi).

## Kapsam dışı

- Analiz/aggregation mantığı (TASK-027.65–.66), API endpoint’leri, UI.
- PostgreSQL cache/read-model (Q-M05 “cache” seçilirse ayrı task).
- Gerçek SQL Server’a bağlanma/Docker (ayrı, açık onay olmadan yok).
- Yeni tenant/permission; MOSEDAŞ tenantı; `Sirket` yetkisi.

## Bağımlılıklar

TASK-027.63. Sonraki: TASK-027.65.

Zincir: `TASK-027.63` → **TASK-027.64** → `TASK-027.65`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/adapter/* (yeni, **olası**)
- apps/api/package.json + pnpm-lock.yaml (SQL Server sürücüsü — **ayrı onay**)
- apps/api/src/reporting/scada-contract/scada-readonly-port.reference.spec.ts (yeni `describeScadaReadOnlyContract(...)` çağrısı)
- apps/api/src/reporting/scada-contract/scada-static-security.spec.ts (“adapter yok” blocker-evidence testleri **bu task’ta bilinçli olarak güncellenir**)
- docs/runbooks/* (adapter işletim notu), docs/domain/DOMAIN_MODEL.md

## API/UI/veri sözleşmesi

- **Veri:** `ScadaReadRequest { sourceId(catalog UUID), columns[], filters?, timeRange, signal? }` (raw SQL / database / schema / table / tenant alanı **yok**; correlation id istemciden **alınmaz**) → `{ rows(UTC), rowCount }` veya statik `reasonCode` (DENIED/FAILED ayrımı D6.1’e göre).
- **API/UI:** yok (iç port).
- Zaman/tarih parametreleri sürücüye bağlı parametre olarak gider; tarih+saat birleştirme kuralı Q-W512’ye bağlıdır.

## Tenant ve permission kuralları

- Scope yalnızca çözümleyici çıktısından; kaynak sahibi scope’ta değilse **sürücüye gitmeden** reddedilir.
- Root aggregation, kaynak başına ayrı okuma ve uygulama katmanında birleştirme (tek birleşik SQL yok).
- Tenant A/B çağrıları arasında paylaşılan mutable state yok (test).
- Yeni permission yok; çağıran katman (TASK-027.72) mevcut guard zincirini uygular.

## Audit ve güvenlik kuralları

- Kaynak başına tek audit girdisi (D3); izinli alanlar: actorId, tenantId (+gerekirse customerRootTenantId), katalog UUID’si (bilinmeyen/kapsam dışı için `null`), result, statik reasonCode, sunucu üretimli correlationId, `rowCount`, `columnCount`, `durationMs`, `limitReason`. Ham SQL, parametre, satır, host/kullanıcı, schema/table/column adı, tarih aralığı, ham filtre, sürücü hata metni **yok**.
- **Audit yazımı başarısızsa işlem fail-closed sonlanır; sorgu sonucu dönmez** (D6.3). Ret durumunda audit yazılamazsa ret yine ret olarak kalır ve sonuç dönmez.
- Redaction alan-allowlist’iyle kurulur; katmanlı redaction (Q-SR01 B) audit’e ulaşan tüm serbest metinler için ayrıca uygulanır — genişletilmiş `scrubSecrets` **ayrı task**; adapter audit’i buna güvenmez.

## Test senaryoları

1. TASK-027.58 sözleşme suite’i (güncellenmiş) + audit matrisi **gerçek adapter’a karşı** koşar; sürücü mock’tur; matriste D6.1–D6.5, sunucu correlation id, katalog UUID’si, `CANCELLED` sonucu.
2. Sürücü mock’unda: SELECT-dışı ifade asla çıkmaz, parametre binding, timeout/iptal/retry-yok, limit aşımı fail-closed, pool/eşzamanlılık, hata sonrası state bozulmaması, hata metni sızıntısı yok.
3. Statik: SQL Server sürücüsü yalnızca adapter dizininde import edilir; web’de yok; ham SQL yürütme yolu yok; `INFORMATION_SCHEMA` yok.
4. Gerçek SQL Server smoke testi **yok** (rapor edilir).
5. Saat dilimi: bilinmeyen/eksik → fail-closed; DST ileri/geri geçişi; UTC çıktı; naive datetime çıktıda yok.
6. Limit profili: eksik/geçersiz her limit için ret; farklı profiller (test/production benzeri) farklı sınır uygular; limit değişikliği yeni sürümle (eski istek etkilenmez).
7. Audit yazımı hata verdiğinde sonuç **dönmez** (başarılı sorguda dahi); ret yolunda aynı.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. TASK-027.58’deki 24 mutasyonun adapter karşılıkları: allowlist, scope, read-only guard, parametre binding, timeout/iptal, satır/payload/kolon limiti, unresolved-mapping, audit alan allowlist’i, pool/eşzamanlılık, slot serbest bırakma.
2. Sürücü hata metninin çağırana geçmesi (iki savunma katmanı birlikte kaldırılır) testi kırar.
3. Audit fail-closed kontrolü fail-open’a çevrilince test kırılır.
4. Saat dilimi/UTC normalizasyonu kaldırılınca zaman testleri kırılır; limit profili zorunluluğu kaldırılınca eksik-limit testi kırılır.
5. Limit aşımının `FAILED`’a çevrilmesi (D6.1) test kırar.

## Kabul kriterleri

- Sözleşme suite’i adapter’a karşı tamamen geçer; mutasyonlar kırılır.
- Limitler yalnızca kaynak/ortam profilinden gelir; kodda sabit/varsayılan sayı yoktur; eksik/geçersiz limit fail-closed reddedilir.
- Gerçek credential/connection string repoda yok; bağlantı bilgisi yalnızca runtime secret’tan.
- Yalnızca SELECT çalışır; hiçbir kod yolunda INSERT/UPDATE/DELETE/EXEC yoktur (statik + davranışsal).
- `check.sh --skip-docker` geçer; gerçek SQL Server testi yapılmadıysa açıkça raporlanır.
- Audit sözleşmesi kararlarla birebir uygulanmıştır (D1–D7); sözleşme suite ve matris güncel kararlara göre geçer.

## Rollback yaklaşımı

Modül kaydı kaldırılarak devre dışı bırakılır; çağıran (TASK-027.65) henüz yoksa etki yok. Sürücü bağımlılığı geri alınabilir (ayrı onaylı değişiklik). Veri değişikliği/migration yok.

## Sonraki task

TASK-027.65

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Kod ve testler için **hayır** (mock sürücü). Gerçek SQL Server bağlantısı/smoke testi **ayrı, açık kullanıcı onayı** olmadan yapılmaz; onay verilirse yalnızca test ortamı ve read-only credential ile.

## AI1/PO kararı gerektiren açık sorular

- **Q-W520** — `CANCELLED` audit action kodu ve güncel reasonCode sözlüğü
- SQL Server sürücüsü/bağımlılık onayı
- **Q-SR01 uygulama task’ının atanması (adapter’ı engellemez)** — scrubSecrets kalan sınırı (değer taraması, rawSql/schemaName)

## BOTC referansı

- **Referans davranış:** BOTC `QueryService.RunQueryAsync` (string birleştirme), `IsletmeRaporlariWindow` `FromSqlRaw` çapraz-DB yolu, `ReportService.GetHourlyConsumptionAsync` doğrudan `SqlConnection`.
- **Taşıma sınırı:** Taşınmaz: `$"[{TableName}]"` string birleştirme, `Replace("]","")` tabanlı “kaçış”, geniş yetkili tek login, çapraz-DB üç parçalı ad, UI’dan gelen connection string.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-23 — AI1: `ready` + kapsam netleştirmesi; teslim (`review`)

AI1 TASK-027.64'ü `ready` yaptı (TASK-027.63 `done`) ve kapsamı şöyle netleştirdi: **sürücü/gerçek bağlantı yok**, mock driver ile port + adapter + query builder + SCADA sorgu audit'i; Q-W516, Q-W519, Q-W523, PostgreSQL kalıcılığı ve gerçek preflight açık kalır. Bu netleştirme yukarıdaki "SQL Server sürücüsü/bağımlılık onayı" ve "TASK-027.58 suite'inin gerçek adapter'a bağlanması" maddelerini bu turun kapsamından çıkarır (aşağıda).

### Teslim edilen (`apps/api/src/reporting/scada/adapter/`, hiçbir Nest modülüne kayıtlı değil)
- `scada-readonly.port.ts` — `ScadaReadonlyPort {read, listSources}`, `ScadaReadScope` (= `TenantScopeResult` şekli), `ScadaReadRequest` (yalnızca `catalogId, table, columns, timeRange, signal`; başka her alan `INVALID_REQUEST`), audit girdisi (sabit alan kümesi).
- `sqlserver-driver.port.ts` — `SqlServerDriver.run(statement, signal)`; `database` bağlantı seçeneği olarak ayrı taşınır (metne birleştirilmez); **sürücü/bağımlılık eklenmedi**.
- `sqlserver-query-builder.ts` — yalnızca katalog profilinden `SELECT TOP (@rowCap) [kolonlar] FROM [tablo] WHERE [tarih] >= @rangeFrom AND [tarih] < @rangeTo ORDER BY …`; identifier'lar katalogun katı desenine + köşeli parantez quoting; `assertReadOnlyStatement` son savunma (tek düz SELECT; `;`, tırnak, yorum, DML/DDL/EXEC yok).
- `sqlserver-readonly.adapter.ts` — akış: sunucu correlation id → istek şekli → `catalog.getExecutionProfile` (kapsam/mapping/VERIFIED/saat dilimi/limit profili/kolon doğrulaması; başarısızsa **driver'a gitmeden** DENIED) → kolon/tarih aralığı limiti → eşzamanlılık kotası → timeout+iptal ile driver → satır/payload limiti → yalnızca istenen kolonlara projeksiyon → **audit yazılamazsa sonuç dönmez (`AUDIT_FAILED`)**. Her sonuç tam bir audit kaydı üretir.
- `platform-scada-query-audit.ts` — audit girdisini mevcut `platform_audit_logs`'a (`PlatformAuditService.log`) eşler: `SCADA_QUERY_SUCCEEDED/DENIED/FAILED`, `entityType=ScadaAnalysisQuery`, `entityId`=katalog UUID; metadata yalnızca `tenantId, customerRootTenantId, reasonCode, rowCount, columnCount, durationMs, limitReason, correlationId`. Kayıtlı değil / bağlanmadı.
- **Katalog eki (TASK-027.63 çekirdeği değişmedi, yalnız ekleme):** `getExecutionProfile` artık okuma anında en az bir RESOLVED kapsam-içi mapping'in hâlâ mappable (aktif, root değil, MOSEDAŞ değil) tenant'a işaret ettiğini yeniden doğrular — sonradan pasifleşen tenant'ın onaylı mapping'i erişim vermez.

### Kararlar / varsayımlar (uydurma yok)
- **Sınıflandırma:** limit aşımı (satır, payload, kolon, tarih aralığı, eşzamanlılık) = `DENIED` (DEC-0015); timeout = `FAILED`/`TIMEOUT`; sürücü hatası = `FAILED`/`SOURCE_UNAVAILABLE`; iptal = çağırana `CANCELLED`, audit'te `SCADA_QUERY_FAILED` + `reasonCode=CANCELLED` — **Q-W520 (CANCELLED için ayrı action kodu) açık**, ona kadar bu geçici eşleme.
- **Geçersiz/bilinmeyen katalog id** audit'te ham girdi değil **nil UUID** (`00000000-…`) ile `entityId` olur (geçerli UUID biçimli id ise kendisi). Bu, "entityId = katalog UUID" kararının uç durumu için **varsayımdır**; AI1 onayı gerekir.
- **Schema:** katalog tablo adını schema'sız tutar (BOTC `TableDateMappings`); adapter schema uydurmaz — SQL Server oturumun varsayılan schema'sını kullanır. Schema modeli TASK-027.63'ün kapsamında değildi → gerçek preflight/persistence turunda karara bağlanmalı.
- **Filtreler:** katalogda "güvenli ölçüm filtresi" tanımı yok → istek `filters` alanı **reddedilir**; tenant izolasyonu tenant sütunu filtresiyle değil, katalog mapping'i ile sağlanır (SCADA kaynakları tenant kolonu taşımaz). İstek zaman aralığı `[from, to)` olarak tarih kolonuna bağlı parametredir; kaynak saat dilimi → UTC normalizasyonu ve saatlik/günlük toplama TASK-027.65/.66 kapsamındadır.
- **Retry yok**, havuz yönetimi gerçek sürücüye ait (`poolSize` ≥ `maxConcurrent` katalog kuralıyla zaten zorunlu).
- **TASK-027.58 105'lik test-only sözleşme suite'i gerçek adapter'a bağlanmadı:** eski sözleşme kaynak-anahtarı/allowlist/kararlar öncesi sınıflandırma (limit=FAILED, audit fail-open) varsayar; kararlarla çelişir. Yeni adapter, aynı güvenlik özelliklerini kendi specleriyle (25 senaryo + statik) kanıtlar; eski suite değiştirilmeden kalır. Sözleşme suite'inin güncellenmesi ayrı iş olarak kalır.
- Mevcut `scada-static-security.spec.ts` "adapter yok" kanıtı bilinçli güncellendi: `Scada*` bildirimleri artık `reporting/scada/` **dışında** yasak. `dec-0014` allow-list'i ve R1 envanteri `reporting/scada/**.spec.ts` negatif testleri için genişletildi.

### Testler ve mutasyon
- `sqlserver-readonly.adapter.spec.ts` (istenen 25 senaryonun tümü + ek), `sqlserver-query-builder.spec.ts`, `adapter-static.spec.ts`, `platform-scada-query-audit.spec.ts`.
- Mutasyon kontrolleri gerçekten uygulanıp yakalandı: katalog durum kontrolü, tenant kapsamı, okuma-anı tenant yeniden doğrulaması, identifier doğrulaması, tablo allowlist, parametre binding (inline literal), database adının metne birleştirilmesi, timeout, iptal, satır/payload/eşzamanlılık limiti, audit'e sürücü metni sızması, audit fail-open, istemci correlation id'sine güven, ham istek alanı kabulü, MOSEDAŞ reddi, projeksiyon, slot serbest bırakma. **Tek hayatta kalan:** `assertReadOnlyStatement` çağrısının kaldırılması — identifier doğrulaması aynı saldırıları önceden kestiğinden ulaşılamaz bir **derinlik savunması** (fonksiyon kendisi doğrudan test edilir); denk mutant olarak kabul edildi.

### Yapılmayanlar (kapsam dışı, ayrı açık onay)
Gerçek SQL Server bağlantısı/credential, **gerçek preflight**, **gerçek SQL Server smoke testi**, sürücü bağımlılığı, PostgreSQL repository/migration/seed, Docker, katalog yazma endpoint'i, Q-W516/Q-W519 kararları, aggregation/rollover/karşılaştırma/sanal kolon/preset/UI/export, Wave 2/3. Git commit/push yok.

## 2026-09-23 — AI1 Değerlendirmesi ve R1 (append-only): `review` kaldı

AI1: teslim teknik olarak güçlü; `done` verilmedi — üç nokta + eski suite için R1 istendi. **Kararlar:**
- **Q-W520 (kapandı):** iptal audit'i `action=SCADA_QUERY_FAILED`, `reasonCode=CANCELLED`, çağırana dönen durum `CANCELLED`; `SCADA_QUERY_CANCELLED` diye action **uydurulmaz**.
- **Geçersiz katalog UUID:** nil UUID kullanılmaz → `entityId = null`, `reasonCode = INVALID_CATALOG_ID`, `action = SCADA_QUERY_DENIED`; ham UUID/kullanıcı girdisi audit'e yazılmaz.
- **Schema:** adapter schema uydurmaz; schema VERIFIED katalog kaydının **zorunlu alanı**; schema yoksa kaynak UNVERIFIED/BLOCKED kalır; varsayılan `dbo` yok; gerçek preflight schema/table/column varlığını doğrular; doğrulama olmadan driver çağrılmaz.
- **Eski TASK-027.58 suite'i** (limit=FAILED, audit fail-open) DEC-0015 ile çelişen bir tutarlılık borcudur → R1'de hizalanır, çelişkili testler bırakılmaz.

### R1 teslimi
1. **Nil UUID → `null` + `INVALID_CATALOG_ID`:** adapter, katalog id biçimini istek doğrulamasının **ilk** adımında denetler (`DENIED/INVALID_CATALOG_ID`); audit `entityId` yalnızca iyi biçimli UUID iken yazılır, aksi `null` (ham girdi/nil UUID yok). Biçimi geçerli ama bilinmeyen UUID `SOURCE_NOT_FOUND` olarak o UUID ile audit'lenir. **Depolama notu (AI1 dikkatine):** `platform_audit_logs.entityId` sütunu `NOT NULL`; `PlatformScadaQueryAudit` eşleyicisi `null` entityId'yi **boş string** (`''`) olarak yazar — uydurma bir kimlik değildir ve `reasonCode=INVALID_CATALOG_ID` bu satırları ayırt eder. Gerçek `null` saklanacaksa sütunun nullable yapılması (migration) veya farklı bir karar gerekir; bu R1'de yapılmadı.
2. **Schema zorunluluğu:** `DeclaredTable/CatalogTable.schema` (opsiyonel kayıt, ama VERIFIED için zorunlu; katı identifier deseni; `INVALID_SCHEMA_NAME`). Schema'sız kaynakta `applyPreflight` → `NOT_APPLIED/PREFLIGHT_SCHEMA_UNDEFINED` (durum/sürüm değişmez, `DENIED` audit), kaynak UNVERIFIED kalır. Gözlemde `schemaExists` (yeni zorunlu alan) yanlışsa → `BLOCKED/PREFLIGHT_SCHEMA_MISSING`. Erişim kararı: `SCHEMA_UNDEFINED` (bozuk/içe aktarılmış VERIFIED kayıt için derinlik savunması); `getExecutionProfile` schema'sız tabloya profil vermez. Schema değişimi doğrulamayı düşürür. Query builder `FROM [schema].[tablo]` üretir (schema de katı identifier + quoting). Testlerdeki `TEST_SCHEMA` yalnızca test parametresidir; üretim varsayılanı yoktur.
3. **Eski TASK-027.58 suite'i DEC-0015'e hizalandı** (silinmedi; 105'lik sözleşme + matris + gerçek bileşen testleri korundu, çelişkili beklentiler güncellendi): limit aşımları (satır, payload, kolon, tarih aralığı, **eşzamanlılık**) `DENIED` + `limitReason`; iptal `FAILED/CANCELLED` (Q-W520); **audit fail-closed** (audit yazılamazsa satırlar dönmez `AUDIT_FAILED`; ret sonucu maskelenmez); **sunucu üretimli correlation id** (istekte `correlationId` artık geçersiz alan → `INVALID_REQUEST`, ham istemci değeri audit'e girmez); audit girdisi `actionCode`, `customerRootTenantId`, `rowCount`, `columnCount`, `durationMs`, `limitReason` ile genişledi; gerçek `PlatformAuditService` testi `SCADA_QUERY_*`/`ScadaAnalysisQuery` ile yenilendi. `sourceKey` denetim alanı `catalogId` oldu; referans modelin **istek** alanı `sourceKey` test-only allowlist anahtarı olarak kaldı (üretim adapter'ı katalog UUID'si kullanır).
4. **Q-W520 kapanışı** append-only kaydedildi (`BOTC_MIGRATION_OPEN_QUESTIONS.md`).
5. **Testler/mutasyon:** `reporting` altında 416 test yeşil. Yeni mutasyonlar gerçekten uygulanıp yakalandı: katalog id biçim kontrolünün kaldırılması, geçersiz id'nin audit'e sızması, schema'sız preflight korumasının kaldırılması, `SCHEMA_UNDEFINED` erişim kontrolü, gözlenen schema kontrolü, SQL'de schema niteleyicisinin düşmesi, eşleyicide nil UUID, referans modelde limit=FAILED'e dönüş, audit fail-open'a dönüş, istemci correlation id'sine güven, eşzamanlılığın FAILED'e dönüşü. `check.sh --skip-docker` sonucu teslim raporunda.

**Yapılmayanlar (değişmedi):** gerçek SQL Server/preflight/smoke, sürücü bağımlılığı, PostgreSQL repository/migration (dahil `entityId` nullable), Docker, Q-W516/Q-W519 kararları. Git commit/push yok. Durum: **`review`** (AI1 `done` onayı bekleniyor).

## 2026-09-23 — R2 referansı
AI1 R1'de kalan tek blocker'ı (`entityId = null` ↔ `NOT NULL` kolon; geçici `''` kabul edilmedi) `backlog/TASK-027-64-R2-scada-audit-entityid-nullable.md` ile ele aldı: nullable şema + hazırlanmış (uygulanmamış) migration `0005`, eşleyicideki `''` kaldırıldı, rollback planı belgelendi. **Migration apply ve gerçek DB doğrulaması ayrı açık kullanıcı onayı bekler.** TASK-027.64 ve R1 `review`.

## 2026-09-23 — AI1 Onayı: `done`
AI1, R1 ve R2 ile birlikte TASK-027.64'ü onayladı (`review` → `done`). Açık: migration apply + gerçek DB doğrulaması (ayrı onay), web audit tipi (`entityId: string | null`), gerçek SQL Server smoke/preflight (ayrı onay), Q-W516/Q-W519. Git commit/push yapılmadı.
