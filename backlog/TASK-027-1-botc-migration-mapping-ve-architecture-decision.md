---
id: TASK-027.1
title: BOTC migration mapping ve architecture decision
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

> AI1 final onayı: 2026-09-17. BOTC kaynak kod kanıtları, mapping, migration
> architecture decision ve açık sorular dokümanları doğrulandı. Implementation
> yapılmadı; Wave 2/3 kapsam dışı korundu.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

`../BOTC` kaynak kodu doğrudan okundu (varsayımsal entity/tablo üretilmedi):
- 4 `DbContext` sınıfının tamamı (`BotDbContext`, `DofDbContext`, `VardiyaDbContext`,
  `ArsivVardiyaDbContext`) — `DbSet`'ler ve `OnModelCreating` yapılandırmaları.
- `BOT.Domain` altındaki 27 dosyanın tamamı listelendi; kimlik/permission (`User`, `Role`,
  `Permission`, `UserPermission`), SCADA (`GtEndeks`, `SgEndeks`, `KomurEndeks`, `MosbioEndeks`,
  `VardiyaPerformans` — `IsletmeModelleri.cs`), Vardiya (`VardiyaRaporuBase` + 5 alt sınıf +
  5 arşiv karşılığı), DÖF (`DofKaydi`, `DofUser`, `DofNotification`) ve Ticket/Maintenance
  entity'leri satır satır okundu.
- `BOT.Services` içinde `AuthService`, `UserAuthorizationService`, `QueryService`,
  `DataSourceService` ve `Options/*.cs` (config şema sınıfları) okundu — auth akışı, dinamik
  sorgu/allowlist mekanizması ve config yapısı **koddan** doğrulandı.
- `BOT/appsettings.json`: yalnızca **anahtar adları** `grep -oE` ile listelendi (`ConnectionStrings`,
  `DynamicDataSources`, `Auth`, `Email`, `Telegram`, `Session`, `TableDateMappings` vb.) — hiçbir
  değer (secret/parola/connection string) görüntülenmedi veya kopyalanmadı.
- `../BOTC/DISCOVERY.md` (368 satır) baştan sona okundu.
- `docs/requirements/DISCOVERY.md` (806 satır, özellikle §1–§11 wave stratejisi) ve
  `docs/requirements/SRS.md` (MOD-004/MOD-005, FEAT-008–FEAT-016) okundu.

**SQL Server'a bu ortamdan erişim yoktur** — bu açıkça her üç teslim dokümanında da belirtildi;
gerçek satır sayıları, tablo içerikleri veya bazı veritabanlarının (`MOSEDAS`,
`MOSBIO_TELEGRAM`) kod tabanında doğrudan karşılığı bulunamadığı için bunlar **varsayım olarak
gizlenmedi, açık soru olarak yazıldı** (Q-M01, Q-M02).

### Teslimatlar

| Dosya | İçerik |
|---|---|
| `docs/migration/BOTC_TO_METNEX_MAPPING.md` | Database sınıflandırması (9 DB), entity/table mapping (kimlik/Wave1, SCADA/Wave5, Vardiya/Wave4 aday, DÖF+Ticket/kapsam dışı), permission eşleme önerisi, tenant/scope mapping, ID/FK mapping ilkeleri, migration önceliği |
| `docs/migration/BOTC_MIGRATION_ARCHITECTURE_DECISION.md` | Hedef mimari, taşınmayacak katmanlar, PostgreSQL/SQL Server sınırları, güvenlik modeli (BOTC'nin R-001–R-006 risklerinin hiçbirinin taşınmaması), idempotency/dry-run/rollback ilkeleri, password/secret migration kararı, Wave 1/4/5 ilişkisi, Wave 2/3 kapsam dışı teyidi |
| `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` | 9 yeni açık soru (Q-M01–Q-M06, Q-A01–Q-A03) + zaten açık olan 11 soruyla çapraz referans tablosu, her biri için kaynak/gerekçe/bloke ettiği task/PO onayı gerekliliği |

### Önemli teknik bulgular (koddan doğrudan doğrulandı)

- **SQL injection riski teyit edildi (Discovery R-006 ile birebir):** `QueryService.RunQueryAsync`,
  tablo/kolon adlarını `INFORMATION_SCHEMA` üzerinden **varlık kontrolünden** geçirip doğrudan
  string interpolasyonu ile SQL'e yerleştiriyor (`QUOTENAME` yok). Bu, Metnex'in hedeflediği
  **admin-küratörlü sabit allowlist** modelinden (SEC-DATA-002) temelde farklı ve daha zayıf —
  mimari karar dokümanı §4'te bu fark açıkça işlendi, birebir port **önerilmedi**.
- **Auth güvenlik açıkları teyit edildi:** `AuthService.LoginAsync`'in düz metin parola
  fallback'i + "fırsatçı" hash'leme davranışı, tek global salt kullanımı, `ConfigProtector`'ın
  kod içine gömülü sabit AES anahtarı — hepsi kod okunarak doğrulandı, mimari karar dokümanı
  §6'da "taşınmaz" olarak işaretlendi.
- **Çapraz-DB senkronizasyon deseni bulundu:** `AuthService`, parola yükseltirken `BOT_APP` ve
  `DOF_APP`'i **elle** (EF Core FK değil) `BotUserId` üzerinden senkronize ediyor — bu, ID/FK
  mapping ilkelerinde (mapping dokümanı §4) not edildi.
- **`MOSEDAS` ve `MOSBIO_TELEGRAM` için kod tabanında karşılık bulunamadı** — varsayım
  üretilmedi, açık soru olarak yazıldı (Q-M01, Q-M02).

### Kapsam dışı bırakılanların teyidi

Wave 2 (Bakım/Arıza: `Ticket`, `MaintenanceRecord`, `FaultRecord`) ve Wave 3 (DÖF: `DofKaydi`,
`DofUser`, `DofNotification`) için **hiçbir migration mapping'i, entity dönüşümü veya
implementation önerisi üretilmedi** — yalnızca database sınıflandırmasında "kapsam dışı" olarak
listelendi (D-007 kararına uygun).

### Doğrulama

- `pwd` → `/home/mrtznc/projects/metnex`, `realpath .` → aynı.
- `rg --files ../BOTC` → 4078 dosya (BOTC kaynak ağacı erişilebilir doğrulandı).
- `rg -n "DbContext|Entity|Repository|Permission|Can[A-Z]|SMTP|Telegram|SQL" ../BOTC` → 1783
  eşleşme (kaynak kodun gerçekten tarandığının kanıtı).
- `./scripts/check.sh --skip-docker` → **PASS** (audit, typecheck, lint, test, build — kod
  değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararını kesinleştirmedi** — 9 yeni açık soru (6'sı PO onayı
  gerektiriyor) çözülmeden Wave 1 implementation task'ları (`TASK-027-11` – `TASK-027-19`)
  başlatılmamalıdır.
- Gerçek secret/parola/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL migration'ı veya SQL Server üzerinde herhangi bir değişiklik
  yapılmadı.
- Git commit/push yapılmadı.

### Durum

`status: review` — teslimatlar tamamlandı, açık sorular belgelendi; nihai `done` kararı ve açık
soruların çözümü AI1/Product Owner'a bırakıldı.

# TASK-027.1: BOTC migration mapping ve architecture decision

## Amaç

BOTC kaynak davranışlarını Metnex mimarisiyle eşleştiren mapping ve karar belgelerini oluştur.

## Wave ve bağımlılık

none

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
