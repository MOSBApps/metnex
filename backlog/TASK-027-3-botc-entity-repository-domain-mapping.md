---
id: TASK-027.3
title: BOTC entity repository domain mapping
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.3 (2026-09-17)

AI1 teslimi onayladı. BOTC'de ayrı repository katmanı bulunmadığı doğru biçimde
kanıtlandı; servis davranışları gerçek `DbContext` kullanan servis metotları
üzerinden eşlendi. Wave 1 (`platform`), Wave 4 adayı ve Wave 5 read-only adayı
ayrımları ile tenant, permission, audit ve güvenlik etkileri kaynaklarla uyumludur.
Wave 2/Wave 3 kapsam dışı korunmuştur. Q-E01–Q-E04 açık soruları ve
`./scripts/check.sh --skip-docker` PASS kanıtı kabul edilmiştir.

TASK-027.3 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

`../BOTC` kaynak kodu, TASK-027.1/TASK-027.2'nin ötesinde şu servis dosyaları tek tek okundu:
`AuthService`, `UserService`, `UserAuthorizationService`, `SessionService`, `QueryService`,
`DataSourceService`, `VardiyaService`, `ArsivVardiyaService` (tüm public metotlar). `TicketService`
ve `DofService` yalnızca Wave 1 kimlik tablolarına (`Users`/`UserPermissions`/`Permissions`)
olan çapraz-bağımlılıklarını tespit amacıyla tarandı — kendileri için mapping **üretilmedi**
(Wave 2/3 kapsam dışı). `BOT/DataSourceManagementWindow.xaml.cs` `VisibilitySettings`'in gerçek
kullanım yerini doğruladı. Metnex tarafında `apps/api/src/` gerçek dizin yapısı (`platform`,
`reporting`, `tenant-scope`, `audit`, `settings`) ve `permission-catalogue.ts`'deki gerçek
`MODULE:RESOURCE:ACTION` formatı, hedef domain ataması yapılırken **var olmayan bir modül icat
edilmeden** referans alındı.

### Kritik bulgu — BOTC'de repository katmanı yok

`BOT.Services` altında ayrı bir Repository sınıfı **yoktur** — tüm servisler `DbContext`'i
doğrudan constructor injection ile kullanır. Bu belgede "repository davranışı" servis metodu
düzeyinde belgelenmiştir, var olmayan bir repository katmanı varsayılmamıştır.

### Teslimat

`docs/migration/BOTC_ENTITY_DOMAIN_MAPPING.md` — entity/servis düzeyinde domain ataması:

- **Wave 1 (`platform` domain):** `User`/`Role`/`Permission`/`UserPermission` entity ataması +
  6 servis metodu davranış envanteri (`AuthService.LoginAsync`, `GetUserProfileAsync`,
  `SessionService`, `UserAuthorizationService.Can`/`IsAdmin`, `UserService` CRUD + permission
  atama metotları) + ID/FK/audit/tenant/veri sahipliği etkileri.
- **Wave 4 aday (yeni domain, henüz yok):** 5 lokasyon entity'si + `Arsiv*` karşılıkları,
  `VardiyaService`/`ArsivVardiyaService`'in 7 metodu davranış envanteri.
- **Wave 5 aday (`reporting` ile örtüşebilir, kesinleşmedi):** SCADA entity'leri,
  `DataSourceService`/`QueryService`'in 5 metodu (allowlist yerine `INFORMATION_SCHEMA` canlı
  kontrolü, SQL string interpolasyonu — mimari karar dokümanındaki bulgular servis-davranışı
  kanıtıyla yeniden doğrulandı).
- **Kapsam dışı referans tablosu:** Ticket/MaintenanceRecord/FaultRecord/DÖF — mapping
  üretilmedi, yalnızca Wave 1 verisine bağımlılıkları not edildi.
- **§5 — 10 maddelik "taşınmaz/karşılığı yok" davranış listesi:** repository pattern yokluğu,
  bellek-içi permission snapshot, düz-metin parola fallback, hardcoded `"Admin"` kısayolu,
  `ConfigProtector` sabit AES anahtarı, `INFORMATION_SCHEMA` canlı kontrolü, SQL injection riski,
  `VisibilitySettings` UI-toggle modeli, "UI kontrol eder" yetkilendirme varsayımı, çapraz-DB elle
  senkronizasyon.

### Yeni açık sorular (Q-E01–Q-E04, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S serisi **korunarak**
4 yeni soru eklendi:

- **Q-E01** — Bellek-içi permission snapshot modeli Metnex'e taşınacak mı? (PO onayı gerekli)
- **Q-E02** — Wave 2/3 servisleri Wave 1 kimliğine bağımlı; cutover'da nasıl korunacak? (PO onayı gerekli)
- **Q-E03** — Wave 4 için yeni domain modülü mü açılacak? (PO onayı gerekli)
- **Q-E04** — Wave 5 SCADA adapter hangi modüle yerleşecek? (PO onayı gerekli)

Özet tablosuna (Özet Tablo — Yeni Sorular) 4 yeni satır eklendi, mevcut satırlar değiştirilmedi.

### Kapsam kriterleri karşılama

- Her eşleme BOTC kaynak dosyasına referans veriyor (dosya adı + gerekirse satır aralığı).
- Her entity/servis yalnızca tek bir hedef domain veya açık "karar bekliyor" kategorisine alındı
  (§0 sınıflandırma ilkesi).
- Wave 1/4/5 ayrımı net (ayrı bölümler: §1/§2/§3).
- Wave 2/3 kapsam dışı korundu (§4, §7) — hiçbir mapping/implementation önerisi üretilmedi.
- Tenant/permission/audit/read-only etkileri her bölümün "ID/FK/Audit/Tenant/Veri Sahipliği
  Etkileri" alt bölümünde belgelendi.
- Belirsiz alanlar (modül yerleşimi, session modeli, cutover stratejisi) varsayım değil, açık
  soru (Q-E01–Q-E04) olarak yazıldı.
- SQL Server erişimi olmadığı her ilgili yerde belirtildi, canlı veri/şema iddiası üretilmedi.
- Gerçek secret/parola/connection string hiçbir teslim dokümanına yazılmadı.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmedi** — Wave 1 implementation task'ları
  (`TASK-027-11`–`TASK-027-19`) Q-M03/Q-M04/Q-A01/Q-A03 çözülmeden başlatılmamalı.
- Wave 4/Wave 5 modül yerleşimi Q-E03/Q-E04 çözülmeden implementation planlamasına alınamaz.
- Production kodu, PostgreSQL, Docker, Git history değişmedi. Git commit/push yapılmadı.

### Durum

`status: done` — AI1, entity/servis domain ataması ve Q-E01–Q-E04 açık sorularını inceleyip
onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı — TASK-027.3" bölümü).

# TASK-027.3: BOTC entity repository domain mapping

## Amaç

Entity/repository/service davranışlarını Metnex domain sahipleriyle eşleştir.

## Wave ve bağımlılık

TASK-027.2

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
