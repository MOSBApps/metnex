---
id: TASK-027.70
title: Governed Virtual Columns
status: done
srs_refs: [FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, TBD-W5-001, TBD-W5-002, TBD-W5-003, TBD-W5-004, AC-010, AC-011, AC-012]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.70: Governed Virtual Columns

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.70

## Başlık

Governed Virtual Columns

## Durum

planned

## Amaç

Kullanıcı tanımlı sanal kolonları **yönetişimli** biçimde (sahiplik, kaynak/tablo bağlamı, formül doğrulama, bağımlılık çözümleme, sonuç sınırları) modellemek, saklamak ve hesaplamak.

## Ön koşullar

- TASK-027.69 `done`.
- **Kapanan karar kapıları:** Q-W504, Q-W505 (bkz. “Bağlayıcı karar kapanışları”).
- **Kalan (ready olmadan önce):** Q-W519 (değişiklik audit action/entity adları; formül **metninin** audit’e yazılıp yazılmayacağı), izinli operatör/fonksiyon **listesi ve sayısal limitler** (task başında AI1 onayı; sayı uydurulmaz), PRIVATE sanal kolon CRUD yetkisinin teyidi (öneri: kaydın sahibi + `REPORT:ARTIFACT:VIEW`; yeni izin yok).

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W504 C:** kontrollü, allowlist tabanlı, **versiyonlu formül dili**; serbest JavaScript/SQL/`DataTable.Compute` yok; yalnızca izinli operatör/fonksiyon/katalog kolonu; kayıt öncesi sözdizimi doğrulama; sıfıra bölme/null/NaN/∞/taşma/derinlik limitleri; **hatalı sonuç sessizce 0 yapılmaz**; formüller versiyonlanır ve audit edilir.
- **Q-W505 B:** metadata **control-plane**’de; `tenantId` + `ownerUserId`; versiyonlama/audit/rollback; data-plane’e yeni payload tablosu yok.
- **Q-E04:** `apps/api/src/reporting/scada/virtual-columns/`.

## Kapsam

- Domain modeli: tanım (`ownerUserId`, `tenantId`, `sourceKey`, ad, ifade AST’si, değişkenler↔kolon eşlemesi), sürüm, oluşturma/güncelleme zamanı. **Windows kullanıcı adı sahiplik anahtarı değildir**.
- Formül **allowlist tabanlı, versiyonlu formül dili** ile ayrıştırılır ve **kayıt öncesi** doğrulanır (Q-W504 C): izinli operatör/fonksiyon/katalog kolonu; `DataTable.Compute`/SQL/JS **yok**; değişken yerleştirme string `Replace` ile değil AST ile.
- Bağımlılık çözümleme: sanal → sanal bağımlılık (FR-036), **döngü ve derinlik koruması**, deterministik topolojik sıra (BOTC: en çok 10 tekrar döngüsü).
- Hesaplama hataları (sıfıra bölme, null, NaN, ∞, taşma, derinlik/uzunluk aşımı) **sessizce 0 yapılmaz**: değer yok + kalite/hata durumu döner. BOTC’nin negatif/NaN/`>50000` → 0 ve `IIF(x<0,0,x)` sarmalı **taşınmaz**. Limit değerleri ve izinli sözlük task içinde AI1 onayıyla (sayı uydurulmaz).
- Saklama **control-plane** (Q-W505 B): `tenantId` + `ownerUserId` kapsamlı, sürümlü (formül sürümleri immutable, aktif sürüm), silme = pasifleştirme/geri alınabilir; yalnızca sahibi kendi kayıtlarını görür (paylaşım bu task’ta yok).

## Kapsam dışı

- UI (TASK-027.73), preset (027.71), ekip/tenant ortak sanal kolonları (TBD-W5-006 onayı olmadan).
- Kaynak veritabanında sanal kolon/view oluşturma (salt-okunur).
- Formül dili genişletmeleri (yeni fonksiyonlar) — karar gerekir.

## Bağımlılıklar

TASK-027.69. Sonraki: TASK-027.71.

Zincir: `TASK-027.69` → **TASK-027.70** → `TASK-027.71`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/virtual-columns/* (yeni, **olası**: `formula-parser`, `dependency-resolver`, `service`)
- apps/api/src/db/schema/* (control-plane tabloları; `tenantId NOT NULL`, DEC-0009 kompozit FK) + idempotent Drizzle migration
- docs/domain/DOMAIN_MODEL.md, docs/domain/DB_META.md

## API/UI/veri sözleşmesi

- **Veri (öneri):** `VirtualColumnDefinition { id, ownerUserId, tenantId, sourceKey, name, expression(AST), bindings[{variable, column}], version }`. `DisplayName` biçimi (`(S) …` öneki) BOTC’den **kopyalanmaz**, UI kararıdır.
- **API:** TASK-027.72’de. **UI:** TASK-027.73’te.

## Tenant ve permission kuralları

- Her kayıt `tenantId` + `ownerUserId` taşır; tüm sorgular tenant predikatlıdır (DEC-0009); başka tenant/kullanıcı kaydı görünmez.
- Formülün başvurabileceği kolonlar katalog allowlist’iyle sınırlıdır; formül sahibin yetkisi dışındaki kaynak/kolona başvuramaz.
- Yeni permission uydurulmaz: oluşturma/güncelleme/silme için izin adı Q-M03/Q-W511 kararına bağlı (karar yok → yazma yüzeyi açılmaz).

## Audit ve güvenlik kuralları

- Oluşturma/yeni sürüm/silme audit’lenir (action/entity adı **Q-W519**); metadata yalnızca izinli alanlar. **Formül metni audit’e yazılıp yazılmayacağı Q-W519’da**; varsayılan: yalnızca kimlik/sürüm/özet (iş mantığı ve kolon adı sızıntısını önlemek için).
- Geçersiz formül denemeleri statik reason code’la kaydedilir.

## Test senaryoları

1. AC-010/011/012: iki gerçek kolona dayalı kayıt ve yeni oturumda yeniden kullanım; geçersiz formül asla çalıştırılmaz.
2. Ayrıştırıcı: beyaz liste dışı token, iç içe parantez, sıfıra bölme, çok uzun ifade, unicode/homoglif, enjeksiyon dizileri (noktalı virgül, çift tire, tek tırnak), `Compute`-stili ifadeler → ret.
3. Bağımlılık: döngü, derinlik aşımı, eksik bağımlılık, sıralama determinizmi.
4. Tenant/sahiplik izolasyonu: başka kullanıcı/tenant kaydı okunamaz/silinemez; sızıntı yok.
5. Hata sonuçları (sıfıra bölme, null, NaN, ∞, taşma, derinlik): **sessiz 0 yok**; hata/kalite durumu döner.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Beyaz liste doğrulaması kaldırılınca enjeksiyon testleri kırılır.
2. Döngü/derinlik koruması kaldırılınca ilgili testler kırılır.
3. Sahiplik/tenant filtresi kaldırılınca izolasyon testi kırılır.
4. Hata durumunun sessizce 0’a çevrilmesi (Q-W504 ihlali) testi kırar; serbest ifade motoru eklenirse statik test kırar.

## Kabul kriterleri

- Formül kayıt öncesi doğrulanır; serbest ifade motoru yoktur; kurallar DEC-0015 (Q-W504 C) ile belgelidir.
- Sanal kolonlar tenant+sahip bağlamında saklanır, yerel dosyaya bağlı değildir (FR-060 ruhu).
- Migration idempotent (varsa); DEC-0009/0011 standartlarına uyar.
- `check.sh --skip-docker` geçer; gerçek DB doğrulaması yapılmadıysa açıkça raporlanır.

## Rollback yaklaşımı

Migration varsa forward-only; geri alma yeni bir forward migration ile tabloyu boşaltıp devre dışı bırakır (tablo yalnızca bu modül tarafından okunur). Modül kaydı kaldırılınca sanal kolon kullanılamaz, analiz ham kolonlarla çalışır.

## Sonraki task

TASK-027.71

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Kod/test için **hayır** (mock DB). Saklama PostgreSQL’de olacaksa gerçek PostgreSQL migration doğrulaması **ayrı, açık onay** ister; Docker/SQL Server yok.

## AI1/PO kararı gerektiren açık sorular

- **Q-W519** — Katalog/sanal kolon/preset değişiklik audit action/entity adları; formül metninin audit’e yazılması
- İzinli operatör/fonksiyon listesi ve limitler (task başında AI1 onayı)
- PRIVATE CRUD yetkisi teyidi

## BOTC referansı

- **Referans davranış:** `VirtualColumnDefinition`, `VirtualColumnWindow` (A,B,C değişkenleri, IIF sarmalı, `Compute` testi), `InjectVirtualColumns` (10 tur, `> 50000`→0).
- **Taşıma sınırı:** Taşınmaz: `DataTable.Compute`, string `Replace` ile değişken yerleştirme, `%APPDATA%\BOT_APP\VirtualColumns.json`, `Environment.UserName` sahipliği, `(S)` ad öneki mantığı, sessiz 0’a çevirme.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Karşılaştırma bağımlılık notu (TASK-027.69)
Sanal kolon çıktısı 027.68'in `ScadaSeriesOutput` biçiminde (açık `seriesKey` + `sourceCatalogId`, kova sınıflaması VALID/MISSING/INVALID/INCOMPLETE) üretilirse 027.69 karşılaştırma motoru onu değişiklik olmadan karşılaştırır. Eksik/çözümsüz girdiden türeyen sanal değer 0'a dönüşmemeli (yanlış `COMPARABLE` üretir). Ayrıntı: `backlog/TASK-027-69-scada-period-source-comparison.md`.

## 2026-09-24 — Not
AI1, `ready` spesifikasyonunu verdi; teslim kaydı `backlog/TASK-027-70-scada-virtual-columns.md`'dedir. Durum `review`.
