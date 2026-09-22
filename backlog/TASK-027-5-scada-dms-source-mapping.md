---
id: TASK-027.5
title: SCADA DMS source mapping
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.5 (2026-09-17)

AI1 teslimi onayladı. Yedi `DynamicDataSources` anahtarı eksiksiz listelendi;
`DynamicDataSources` akışı ile `IsletmeRaporlariWindow` içindeki çapraz-veritabanı
`FromSqlRaw` yolu doğru biçimde ayrıştırıldı. `MOSEDAS`, `MOSBIO_RAPORLAR` ve
`MOSBIO_TELEGRAM` bulguları kaynak kod kanıtı olarak, canlı şema iddiası olmadan
belgelendi. İş sahipliği/fiziksel DB çelişkisi Q-SC01'e taşındı; Q-SC02/Q-SC03
append-only korundu. Wave 2/Wave 3 kapsam dışı ve PostgreSQL migration kararı
kesinleştirilmemiştir.

TASK-027.5 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

Önceki task'ların ötesinde şu dosyalar bu task için yeniden/derinlemesine okundu:
`BOT.Domain/IsletmeModelleri.cs` (5 SCADA entity'sinin tam alan listesi),
`BOT.Data/{BotDbContext,DofDbContext}.cs` (SCADA `DbSet` tanımları),
`BOT/HourlyConsumptionWindow.xaml.cs` (`Saatlik_Ort_Veriler`/`MUSTERI_CEKIS_SAATLIK`/
`VardiyaPerformans` anahtarlarının genel akışı) ve **ilk kez taranan**
`BOT/IsletmeRaporlariWindow.xaml.cs` — bu dosyada kritik yeni kanıt bulundu (aşağıda). Metnex
tarafında `apps/api/src/tenant-scope/tenant-scope.service.ts` ve
`apps/api/src/reporting/dataset/report-dataset.contract.ts` **gerçek kod** olarak referans alındı.

### Kritik yeni bulgu — çapraz-veritabanı `FromSqlRaw` erişim yolu

`IsletmeRaporlariWindow.xaml.cs:369-373`, `BotDbContext`'in kendi SQL Server bağlantısı üzerinden
**üç parçalı veritabanı adıyla** (`DATABASE.dbo.table`) doğrudan çapraz-veritabanı sorgular
çalıştırıyor — `DynamicDataSources` mekanizmasından tamamen ayrı, ikinci bir erişim yolu:

- `GtEndeks`/`SgEndeks`/`KomurEndeks` → **`MOSEDAS.dbo.{gt_endeksler,sg_endeksler,komur_endeksler}`**
  (`BOTC_TO_METNEX_MAPPING.md`'nin önceki "MOSB ENERJİ DB (varsayım)" iddiasını [KOD] kanıtıyla
  düzeltir/güçlendirir).
- `MosbioEndeks` → `MOSBIO_RAPORLAR.dbo.endeksler` (önceki varsayım teyit edildi).
- `VardiyaPerformans` → **`MOSBIO_TELEGRAM.dbo.VardiyaPerformans`** (yeni — `MOSBIO_TELEGRAM`'ın
  gerçek bir SQL Server veritabanı olduğu ilk kez kod kanıtıyla doğrulandı, **Q-M01 kısmen
  çözüldü**).

Bu bulgu ayrıca, `BOT_APP` login'inin `MOSEDAS`/`MOSBIO_RAPORLAR`/`MOSBIO_TELEGRAM`'a geniş-yetkili
doğrudan erişimi olduğunu ima ediyor — Metnex'in "admin-küratörlü sabit allowlist" hedefiyle
çelişen bir model, mimari karar dokümanının §4/§6 bulgularını **güçlendiriyor**.

### Teslimat

`docs/migration/BOTC_SCADA_DMS_SOURCE_MAPPING.md`:

- **§1** 7 `DynamicDataSources` anahtarının eksiksiz listesi + kod kullanım yeri.
- **§2** Çapraz-veritabanı `FromSqlRaw` bulgusu ve sonuçları (yukarıda özetlendi).
- **§3** 5 SCADA entity'sinin Discovery §21.1 iş sınıflandırması ile fiziksel DB kanıtı arasındaki
  **gerilim** (GT/SG/Kömür Kazanı: iş sahipliği MOSB Enerji, fiziksel DB adı MOSEDAS).
- **§4** Tenant eşleme — kanıtlı (`MosbioEndeks`→MOSBİO, yüksek güven) vs. çelişkili kanıt
  (`GtEndeks`/`SgEndeks`/`KomurEndeks` — karar bekliyor, Q-SC01) vs. `[DOĞRULANAMADI]`
  (`VardiyaPerformans`, `Saatlik_Ort_Veriler`, `MUSTERI_CEKIS_SAATLIK`).
- **§5** Tenant içi scope/lokasyon ilişkisi (wide-tablo, ünite bazlı kolon deseni).
- **§6** Read-only/permission/audit/root-aggregation etkileri, `TenantScopeService`/
  `ReportDatasetProvider` gerçek koduyla çapraz kontrol.
- **§7** PostgreSQL migration kararı kesinleştirilmedi (Q-M05 korunuyor).
- **§8** Wave 2/3 kapsam dışı teyidi.

### Yeni açık sorular (Q-SC01–Q-SC03, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S/Q-E/Q-T serisi
**korunarak** 3 yeni soru eklendi:

- **Q-SC01** — GT/SG/Kömür endeksleri MOSEDAŞ mı MOSB tenant'ına mı ait? (PO onayı gerekli)
- **Q-SC02** — İki bağımsız SCADA erişim mekanizması var; Wave 5 hangisini temel alacak? (teknik)
- **Q-SC03** — SCADA için `ReportDatasetProvider` genişletilecek mi, ayrı sözleşme mi? (mimari, PO'ya raporlanır)

Özet tablosuna 3 yeni satır eklendi, mevcut satırlar değiştirilmedi. Q-S03/Q-M06/Q-T01 içerikleri
**değiştirilmedi**, yalnızca bu belgede somut kanıtlarla ilişkilendirildi (kabul kriteri #4).

### Kapsam kriterleri karşılama

- 7 `DynamicDataSources` anahtarının tamamı §1'de eksiksiz listelendi.
- Her kaynak BOTC kod dosyasıyla ilişkilendirildi (dosya adı + satır aralığı).
- Tenant eşlemeleri kanıtlı (`MosbioEndeks`) ve varsayımsal/çelişkili (`GtEndeks`/`SgEndeks`/
  `KomurEndeks`, `VardiyaPerformans`) olanlardan açıkça ayrıldı, hiçbiri varsayımla kesinleştirilmedi.
- Q-S03, Q-M06 ve Q-T01 ile ilişkiler §4/§9'da açıkça belirtildi.
- Read-only, permission, audit, root aggregation etkileri §6'da belgelendi.
- Gerçek secret/parola/connection string hiçbir teslim dokümanına yazılmadı — yalnızca
  `FromSqlRaw` string literal'leri (üç parçalı tablo adları, secret içermiyor) incelendi.
- Wave 2/3 kapsam dışı korundu (§8).
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değiştirilmedi.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmedi** — PostgreSQL migration/cache kararı
  (Q-M05), SCADA kaynak→tenant kesin eşlemesi (Q-S03, Q-SC01) ve erişim mekanizması netliği
  (Q-SC02) çözülmeden Wave 5 implementation planlaması yapılamaz.
- `IsletmeRaporlariWindow`'daki geniş-yetkili tek-login çapraz-DB erişim modeli Wave 5 güvenlik
  tasarımında ayrıca ele alınmalı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

### Durum

`status: done` — AI1, SCADA/DMS source mapping ve Q-SC01–Q-SC03 açık sorularını inceleyip
onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı — TASK-027.5" bölümü).

# TASK-027.5: SCADA DMS source mapping

## Amaç

SCADA/DMS kaynaklarını işletme scope’u ile eşleştir.

## Wave ve bağımlılık

TASK-027.4

## Kapsam kuralları

- Discovery ve SRS tenant, permission ve Metnex kararlarına uy.
- Mevcut modül sınırlarını koru; yeni framework oluşturma.
- Tenant scope, audit, güvenlik ve idempotency etkilerini ele al.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.

## Kabul kriterleri

- Amaç ve bağımlılıklar kanıtla karşılanmış olmalı.
- Tenant/permission/security etkileri test veya dokümanla doğrulanmalı.
- Hata, empty state, audit ve tekrar çalıştırma davranışı tanımlı olmalı.
- İlgili domain/runbook/decision dokümanları güncellenmeli.
- ./scripts/check.sh --skip-docker sonucu raporlanmalı.
- Gerçek secret, parola veya connection string rapora yazılmamalı.
- Git commit/push yapılmamalı.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
