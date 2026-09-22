---
id: TASK-027.2
title: BOTC kaynak database schema envanteri
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.2-R1 (2026-09-17)

AI1, R1 düzeltmesini onayladı. İlk teslimdeki `BotDbContext 9 tablo` ve
`4 DbContext toplam 22 tablo` özetleri kaldırıldı. §1.1'deki dört ayrık kategori
ve 31 adet `DbContext × tablo` eşleşmesi, detay envanteriyle tutarlı bulundu.

31 değerinin distinct fiziksel tablo sayısı olmadığı ve SCADA tekrarlarının
Q-S04 çözülmeden tekilleştirilemeyeceği doğru biçimde belgelenmiştir. TASK-027.2
ve TASK-027.2-R1 `done` olarak kapatıldı; Wave 2/Wave 3 kapsam dışı ve production
kod/veritabanı/Docker/Git değişikliksiz korunmuştur.

## AI2 Teslim Raporu (2026-09-17)

> **TASK-027.2-R1 düzeltmesi (2026-09-17):** AI1, ilk teslimde "BotDbContext 9 tablo" ve "4
> DbContext toplam 22 tablo" iddialarının, envanter dokümanının kendi alt bölümleriyle (2.1–2.9)
> tutarsız olduğunu tespit etti. Aşağıdaki "Kapsam kriterleri karşılama" bölümü, düzeltilmiş ve
> `docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md` §1.1'deki resmi sayım tablosuyla **birebir
> aynı rakamlarla** güncellenmiştir. Yöntem: her tablo, 4 ayrık kategoriden tam olarak birine
> atanmıştır (Güncel DbSet + Migration'da da var / Migration-only / Kodda olup migration'da
> olmayan (SCADA hariç) / SCADA). Detaylı gerekçe ve metodoloji için §1.1'e bakınız.

### Kaynak inceleme yöntemi

`../BOTC` kaynak kodu, TASK-027.1'in ötesinde **ek olarak** şu dosyalar da doğrudan okundu:
- `BOT.Data/Migrations/{20251020143559_InitialCreate,20251022_AddTickets,20251024083250_AddExtraNoteAudit,20251024085243_Sync_ExtraNoteAudit}.cs`
  — gerçek `CreateTable`/`AlterColumn`/`CreateIndex`/`AddForeignKey`/`DropTable` çağrıları.
- `BOT.Data/Migrations/BotDbContextModelSnapshot.cs` — EF'in son bilinen migrasyonlanmış model
  durumu.
- Bu migration kanıtları, güncel `BotDbContext.cs`'nin `OnModelCreating` yapılandırmasıyla
  **satır satır karşılaştırıldı**.

### Kritik bulgu — migration geçmişi ile güncel kod arasında kanıtlanmış sapma

Karşılaştırma sonucu **iki somut, koddan kanıtlanmış tutarsızlık** tespit edildi (varsayım
değil):

1. `Roles`/`Role` tablo adı ve `RoleId` FK delete-behavior'ı migration geçmişi (`Role`,
   `Cascade`) ile güncel kod (`Roles`, `Restrict`) arasında **doğrudan çelişiyor**.
2. `Permissions`, `UserPermissions`, `VisibilitySettings`, tüm SCADA endeks tabloları ve
   `MaintenanceRecords` hiçbir migration'da `CreateTable` edilmemiş; `MaintenanceRecords`
   üstelik `AddExtraNoteAudit` migration'ında **açıkça `DropTable` ile silinmiş** ama güncel kod
   hâlâ bu tabloya tam bir `DbSet`/`OnModelCreating` yapılandırmasıyla map ediyor.

Bu iki bulgu, Discovery'nin R-012 ve Q-007 bulgularıyla aynı yönde ve onları **güçlendiriyor**
— BOTC'nin migration disiplini `BOT_APP` içinde bile tutarsız. Dört yeni açık soru bu bulgulara
bağlı olarak üretildi (Q-S01–Q-S04).

### Teslimat

`docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md` — 4 `DbContext`'in tamamı, tablo/kolon/PK/FK/
nullable/index/ilişki detayıyla envanterlendi. Her bilgi `[KOD]` veya `[MIGRATION]` etiketiyle
kaynağına bağlandı; canlı SQL Server'da doğrulanamayan her nokta `[DOĞRULANAMADI]` olarak
işaretlendi. `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye 4 yeni soru (Q-S01–Q-S04)
eklendi (append, mevcut Q-M/Q-A serisi ve özet tablo korunarak).

### Kapsam kriterleri karşılama

- **4/4 DbContext envanterlendi**, tablo sayımı 4 ayrık kategoriye bölünerek doğrulandı
  (`docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md` §1.1):

  | DbContext | Güncel DbSet + Migration'da da var | Migration-only | Kodda olup migration'da olmayan (SCADA hariç) | SCADA | Toplam |
  |---|---|---|---|---|---|
  | `BotDbContext` | 3 | 2 | 4 | 5 | **14** |
  | `DofDbContext` | 0 | 0 | 3 | 4 | **7** |
  | `VardiyaDbContext` | 0 | 0 | 5 | 0 | **5** |
  | `ArsivVardiyaDbContext` | 0 | 0 | 5 | 0 | **5** |
  | **Toplam (DbContext-tablo eşleşmesi)** | **3** | **2** | **17** | **9** | **31** |

  "31" rakamı context'ler arası olası fiziksel tablo tekrarlarını (SCADA entity'leri hem
  `BotDbContext` hem `DofDbContext`'te ayrı `DbSet` olarak tanımlı, aynı fiziksel tabloya mı
  eşlendiği doğrulanamıyor — Q-S04) **tekilleştirmez**; bu nedenle "distinct fiziksel tablo"
  iddiası üretilmemiştir. İlk teslimdeki "9 tablo" (BotDbContext) ve "22 tablo" (toplam)
  rakamları, bu yeniden sayımla **doğrulanamamış ve hatalı bulunmuştur** — düzeltilmiştir.
- **27 domain entity dosyası** ve ilişkili `DbSet`'ler tek tek listelendi (TASK-027.1'de dosya
  adları listelenmişti, bu task'ta her birinin alan/PK/FK/nullable detayı çıkarıldı).
- **`DynamicDataSources` kaynakları ayrı listelendi** (§3) — 7 anahtar adı, hangi SCADA DB'ye
  karşılık geldiği "varsayım" olarak işaretlenip Q-S03'e bağlandı.
- **SCADA/DMS kaynakları database/schema/table seviyesinde sınıflandırıldı** (§7).
- **Vardiya ve arşiv kaynakları ayrı sınıflandırıldı** (§5, §6).
- **Wave 2/Wave 3 yalnızca kapsam dışı envanter olarak kaydedildi** (§8) — hiçbir migration
  mapping'i veya implementation önerisi üretilmedi.
- **SQL Server erişimi olmadığı her ilgili yerde açıkça belirtildi**, gerçek satır sayısı veya
  canlı şema iddiası hiçbir yerde üretilmedi.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

**R1 doğrulama (2026-09-17):** `./scripts/check.sh --skip-docker` yeniden çalıştırıldı →
**PASS** (yalnızca dokümantasyon düzeltmesi, kod/production/PostgreSQL/Docker/Git değişikliği
yok).

### Kalan riskler / sonraki bağımlılık

- Bu task, TASK-027.1 gibi **hiçbir implementation kararı kesinleştirmedi**.
- Yeni tespit edilen 4 soru (Q-S01–Q-S04) teknik doğrulama gerektiriyor (çoğu PO onayı
  gerektirmiyor ama Wave 1/Wave 5 implementation task'larını bloke ediyor) — canlı SQL Server
  erişimi sağlanmadan çözülemezler.
- Gerçek secret/parola/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu ve database değişmedi. Git commit/push yapılmadı.

### Durum

`status: done` — AI1, TASK-027.2-R1 sayım/tutarlılık düzeltmesini inceleyip onayladı (2026-09-17,
bkz. dosya başındaki "AI1 Onayı — TASK-027.2-R1" bölümü). Envanter, sayım metodolojisi ve açık
sorular (Q-S01–Q-S04) nihai kabul edildi.

# TASK-027.2: BOTC kaynak database schema envanteri

## Amaç

Kaynak database, schema, tablo, kolon, ilişki ve hacim envanterini çıkar.

## Wave ve bağımlılık

TASK-027.1

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
