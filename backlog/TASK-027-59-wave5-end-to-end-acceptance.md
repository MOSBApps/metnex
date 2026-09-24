---
id: TASK-027.59
title: Wave 5 Uçtan Uca Kabul (E2E / Security / Performance)
status: planned
srs_refs: [FEAT-008, FEAT-009, FEAT-010, FEAT-011, FEAT-012, FEAT-013, FEAT-014, FEAT-015, FEAT-016, FEAT-017, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.59: Wave 5 Uçtan Uca Kabul (E2E / Security / Performance)

> **Not:** bu dosya orijinal `TASK-027.59` yer tutucusunun aynı ID/kapsamla, zorunlu şablona göre genişletilmiş halidir; içerik kaybı yoktur (orijinal kabul kriterleri aşağıdaki “Kabul kriterleri” içinde korunmuştur).
>
> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.59

## Başlık

Wave 5 Uçtan Uca Kabul (E2E / Security / Performance)

## Durum

planned

## Amaç

Root/child tenant, kaynak seçimi, saatlik/günlük analiz, çoklu seri, karşılaştırma, sanal kolon, preset ve tüm export akışlarının **iş seviyesi kabulünü** yapmak; güvenlik ve performans sözleşmelerini uçtan uca doğrulamak. Bu dosya, orijinal TASK-027.59 yer tutucusunun **aynı ID ve kapsamla genişletilmiş** halidir.

## Ön koşullar

- TASK-027.63–TASK-027.74 `done`.
- **Kapanan karar kapıları:** Q-W514 ve DEC-0015’teki tüm kararlar.
- **Kalan:** Q-W516–Q-W522’nin ilgili task’larda kapanmış olması; test/anonim veri setinin onayı; gerçek servis çalıştırma için açık kullanıcı onayı.

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W514 B:** kabul **kontrollü, izole, sentetik verili test ortamında** (test SQL Server/eşdeğeri, PostgreSQL, Jasper, browser birlikte); production verisi/secret yok; Docker/gerçek servis çalıştırma ayrıca açık kullanıcı onayına bağlı; **production kabulü kapsam dışı**.
- Kabul, DEC-0015 kararlarının tamamını (Q-W501… Q-M05, audit sözleşmesi, fail-closed davranışlar) uçtan uca doğrular.

## Kapsam

- **Seviye A — sınır-mock’lu uçtan uca paket (gerçek SQL Server olmadan):** API→servis→mock adapter zinciri, web→API kabul senaryoları, TASK-027.58 sözleşme suite’inin gerçek adapter’a karşı tam koşusu, tüm mutasyon setinin yeniden koşusu.
- **Seviye B — kontrollü izole test ortamı (Q-W514 B):** test SQL Server/eşdeğer kaynak, PostgreSQL, çalışan Jasper renderer ve browser **birlikte**; yalnızca **sentetik** veri, production verisi/secret yok; herhangi bir servisin/Docker’ın çalıştırılması **ayrıca açık kullanıcı onayı** ister. **Production kabulü bu task’ın kapsamı değildir.**
- Senaryo seti: MİP root ve alt tenant’lar (DEC-0014 tenant modeli), yetkili/yetkisiz kaynak, en az iki sayısal kolon, saatlik ve günlük, dönem/kaynak karşılaştırma, sanal kolon, preset, CSV/PNG/PDF/XLSX, boş/hata/timeout/iptal durumları, idempotency (tekrarlanan istek).
- Güvenlik negatif matrisi: enjeksiyon, tenant/header manipülasyonu, `Sirket` alanı, MOSEDAŞ tenant üretilmediği, export izin bağımsızlığı, impersonation, yazma girişimlerinin reddi, secret/SQL/host sızıntısı taraması, audit bütünlüğü (başarı/ret/hata).
- Performans ölçümü: tanımlı senaryolarda süre, satır/payload, eşzamanlı istek; **eşik PO’dan gelmeden pass/fail verilmez**, yalnızca ölçüm raporlanır.
- İş seviyesi DoD ile teknik kalite kapılarının birlikte PASS olması; SCADA/DMS kaynaklarında yazma oluşmadığının kanıtı (salt-okunur credential + kod yolu + test).

## Kapsam dışı

- Yeni özellik/refactor; Wave 2 ve Wave 3; Vardiya.
- Production ortamı, production verisi, gerçek secret.
- Docker build/run (mevcut çalışan servisler dışında) ve kullanıcının dev sunucusunu yönetme.

## Bağımlılıklar

TASK-027.63–TASK-027.74. Bu Wave 5 zincirinin son halkasıdır.

Zincir: `TASK-027.74` → **TASK-027.59** → `— (Wave 5 kapanışı; sonraki wave AI1/PO kararı)`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/**/*.spec.ts, apps/web/src/**/*.spec.ts(x) (kabul senaryosu testleri; **yalnızca test**)
- docs/runbooks/* (kabul kanıtı/işletme notları), docs/opendevcon/* (durum)
- backlog/TASK-027-59-wave5-end-to-end-acceptance.md (kabul raporu)

## API/UI/veri sözleşmesi

- **API/UI:** yeni sözleşme yok; yalnızca doğrulama. Kabul raporu: senaryo → beklenen → gerçek → kanıt tablosu.
- Performans raporu: ölçüm tablosu (eşiksiz) ve PO’ya karar girdisi.

## Tenant ve permission kuralları

- Root, child ve kapsam dışı tenant senaryoları; tenant değişiminde durum sızıntısı yok; header tek başına yetki vermez.
- Yetki matrisi: VIEW var/export yok; export var/VIEW yok; ikinci kaynak yetkisiz; MFA/impersonation kuralları.

## Audit ve güvenlik kuralları

- Her senaryo sınıfı için audit satırı doğrulanır (izinli alanlar); satır/SQL/secret/host sızıntısı taraması.
- Audit kesintisi altında sonuçların değişmediği senaryosu.

## Test senaryoları

1. AC-004…AC-024 her biri için en az bir kabul senaryosu (izlenebilirlik tablosu: AC → senaryo → kanıt).
2. Boş sonuç, tek nokta, çok uzun aralık (limit reddi), timeout, iptal, sürücü hatası, kısmi kaynak hatası (ikinci kaynak düşerse davranış), tekrarlanan istek.
3. Güvenlik negatif matrisi (yukarıdaki kapsam) ve statik taramalar (secret, INFORMATION_SCHEMA, ham SQL, MOSEDAŞ/Sirket).
4. Seviye B varsa: gerçek Jasper çıktısı bayt doğrulaması, tarayıcıda görsel doğrulama, salt-okunur credential ile yazma girişiminin **veritabanı düzeyinde** reddi.
5. Regresyon: mevcut generic reporting ekranı ve export’ları bozulmadı (TASK-027.54–.57 testleri).

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Önceki tüm task’ların mutasyon setleri (027.58’in 24’ü + her task’ın kendi seti) yeniden koşulur; hiçbiri sessizce geçmemelidir.
2. Uçtan uca düzeyde: scope kontrolü, allowlist, read-only guard, export izni, tenant izolasyonu bozulunca kabul senaryolarının kırıldığı gösterilir.

## Kabul kriterleri

- Grafik analiz akışı uçtan uca çalışır; tenant, permission, audit, hata, boş durum ve idempotency doğrulanır.
- CSV/PNG/PDF/XLSX çıktıları doğrulanır; SCADA/DMS kaynaklarında write işlemi oluşmaz.
- Teknik kalite kapıları ve iş seviyesi DoD birlikte PASS olur; kapsam dışı kalanlar (yapılamayan seviye B doğrulamaları) açıkça raporlanır.
- Performans ölçümleri raporlanır; eşik kararı PO’dadır.

## Rollback yaklaşımı

Bu task yalnızca test/dokümandır; geri alma gerekmez. Kabul başarısızsa ilgili task’lar `review`’a geri döner; Wave 5 “kapandı” ilan edilmez.

## Sonraki task

— (Wave 5 kapanışı; sonraki wave AI1/PO kararı)

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Seviye A: **hayır** (sınır-mock’lu). Seviye B: **evet** — kontrollü, izole, sentetik verili test ortamı (test SQL Server/eşdeğeri, PostgreSQL, Jasper, browser); **yalnızca açık kullanıcı onayıyla** servis/Docker çalıştırılır; production verisi/secret yok; production kabulü kapsam dışı.

## AI1/PO kararı gerektiren açık sorular

- Kabul veri seti (sentetik) kaynağı ve onayı
- Gerçek servis/Docker çalıştırma için açık kullanıcı onayı (kabul anında)

## BOTC referansı

- **Referans davranış:** Tüm `HourlyConsumptionWindow` yetenekleri için BOTC ↔ Metnex davranış karşılaştırma tablosu (TASK-027.62).
- **Taşıma sınırı:** Taşınmayanların (WPF, yerel JSON, raw SQL, şema keşfi, `DataTable.Compute`, sabit sayılı sezgiler) gerekçeli listesi kabul raporuna eklenir.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Teslim notu
Bu planlama taslağı, `ready` spec'e göre `backlog/TASK-027-59-wave5-reporting-e2e-acceptance.md` ile teslim edilmiştir (`review`). Bu dosyanın durumu ve içeriği değiştirilmedi.
