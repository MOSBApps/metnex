---
id: TASK-027.21
title: Vardiya SRS ve Migration Mapping
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

## AI2 Teslim Raporu — Vardiya SRS ve Migration Mapping (2026-09-18)

### Amaç

BOTC Vardiya ve Arşiv Vardiya modüllerinin Metnex Wave 4 kapsamına alınması için onaylı SRS,
domain mapping, tenant/location mapping ve migration kapsamını **kesinleştirmeden**, kanıta
dayalı olarak hazırlamak.

### BOTC Kaynak Dosyaları (doğrudan okundu)

`BOT.Domain/{VardiyaRaporuBase,ArsivVardiyaRaporuBase,VardiyaMuhendisiRapor,MosbEnerjiRapor,
MosbioRapor,KomurKazaniRapor,MosbioKirimDepoRapor}.cs` + 5 `Arsiv*` karşılığı,
`BOT.Data/{VardiyaDbContext,ArsivVardiyaDbContext}.cs`,
`BOT.Services/{VardiyaService,ArsivVardiyaService}.cs` + interface'leri,
`BOT/{VardiyaMenuWindow,VardiyaKayitWindow,VardiyaListWindow,VardiyaDetayWindow}.xaml.cs`
(yalnızca yetki/lifecycle kanıtı için).

### Kaynak Schema/Migration Bulguları

**Kritik bulgu:** Vardiya/Arşiv Vardiya için **hiçbir EF Core migration dosyası yok**
(`BOT.Data/Migrations/`'daki 4 dosya + snapshot yalnızca `BotDbContext`'e ait) — 5 fiziksel tablo
(`vardiyamuhendisi`/`mosbenerji`/`mosbio`/`komurkazani`/`mosbiokirimdepo`) migration sistemi
dışında oluşturulmuş olmalı, gerçek şema `[DOĞRULANAMADI]`. Diğer bulgular:
`docs/migration/BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md`.

### Metnex Hedef Mapping

`docs/migration/BOTC_VARDIYA_METNEX_TARGET_MAPPING.md` — hedef domain modülü önerisi, entity/tablo
mapping (tek tablo vs 5 tablo, karar verilmedi), kolon mapping, tenant ownership.

### Lifecycle Mapping

`DRAFT`(`IsCompleted=false`)/`COMPLETED`(`IsCompleted=true`) BOTC'den doğrudan; `LOCKED`/`FAILED`
kaynakta **yok**, yalnızca "hedef model önerisi" olarak ayrıca işaretlendi (uydurulmadı).
**Güvenlik bulgusu:** BOTC'de "tamamlanmış rapor kilidi" yalnızca UI'da (`VardiyaListWindow`)
uygulanıyor, `VardiyaService.SaveReportAsync` serviste hiçbir kilit kontrolü yapmıyor — Metnex
hedefi için sunucu-taraflı kilit **önerisi** (Q-V09), karar değil.

### Tenant/Location Kararları

5 lokasyondan yalnızca 2'si (`MOSBİO`→MOSBİO, `MOSB ENERJİ`→MOSB) yüksek kesinlikle eşleniyor;
`KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL` **PENDING_MAPPING/UNRESOLVED** olarak açık bırakıldı
(Q-V01, Q-T01'in somutlaşması). **`MOSEDAŞ` Vardiya modülünde hiç kod kanıtı yok** — kapsama
girmiyor. "GT/SG fiziksel kaynakları" Vardiya raporu değil, ayrı bir SCADA/Wave 5 kavramı.
Varsayımla hiçbir belirsizlik kapatılmadı.

### Archive Yaklaşımı

BOTC'de arşiv ayrı bir fiziksel veritabanı, kod tabanında **güncelleme/silme yolu hiç yok**
(append-only by construction). Metnex hedefinde tek tablo (`status=ARCHIVED`) veya ayrı tablo
seçenekleri sunuldu, karar TASK-027.26'ya bırakıldı (Q-V02 retention, Q-V06 duplicate stratejisi
açık).

### Permission/Audit Etkileri

`CanManageShifts`→`SHIFT:REPORT:UPDATE`, `CanViewShiftReports`→`SHIFT:REPORT:VIEW` (Q-M03'te
zaten onaylı taslak) — **gerçek `permission-catalogue.ts`'e henüz eklenmedi** (Q-V07, Wave 4
önkoşulu). `CanReceiveShiftReportEmail` hiç mapping önerisi almamıştı — eksik permission olarak
kaydedildi, yeni kod icat edilmedi. Audit: mevcut `platform-audit` sözleşmesinin yeniden
kullanılması önerildi (yeni mekanizma icat edilmedi). Tenant izolasyonu: mevcut
`tenantMemberships`/`PermissionGuard`/`TenantScopeService` mekanizması yeniden kullanılacak, yeni
bir aggregate yetkisi icat edilmedi.

### Güncellenen SRS ve Discovery Bölümleri

- `docs/requirements/SRS.md` — yeni `MOD-007`/`FEAT-022` (FR-097–FR-106, BR-018–BR-021,
  AC-025–AC-027), §6.1 Wave tablosu güncellendi ("Aday wave" → "Discovery/SRS tamamlandı").
- `docs/requirements/DISCOVERY.md` §11.5 — TASK-027.21 doğrulama notu eklendi (mevcut metin
  değiştirilmedi, yalnızca not eklendi).

### Yeni Açık Sorular (append-only)

Q-V01–Q-V10, `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye append-only olarak işlendi (özet
tablo satırları dahil). Hiçbiri bu task'ta kapatılmadı; mevcut Q-T01/Q-S03/Q-ID01/Q-P02 de
kapatılmadı.

### Sonraki Wave 4 Task Sırası

TASK-027.22 (PostgreSQL domain model) → TASK-027.23 (lokasyon mapping) → TASK-027.24 (API/servis)
→ TASK-027.25 (workflow kilitleme) → TASK-027.26 (arşiv migration) → TASK-027.27 (arşiv read API)
→ TASK-027.28 (email distribution) → TASK-027.29 (UI ekranları). Detay/bağımlılık gerekçesi:
`docs/migration/BOTC_VARDIYA_METNEX_TARGET_MAPPING.md` §12.

### Kesinlikle yapılmayanlar (görev talimatına uygun)

Production kodu yazma, Drizzle schema/migration/seed, PostgreSQL/SQL Server bağlantısı, gerçek
BOTC verisi okuma/kopyalama, Vardiya API/UI oluşturma, email provider entegrasyonu, yeni tenant/
lokasyon kararı, Q-T01/Q-S03/Q-ID01/Q-P02 kapatma, Wave 2/Wave 3 kodu, Docker çalıştırma, git
commit/push — **hiçbiri yapılmadı**.

### Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (yalnızca dokümantasyon
değişikliği, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yok). Gerçek secret/
parola/connection string/kullanıcı verisi hiçbir teslim dokümanına yazılmadı.

### Kalan riskler / sonraki bağımlılık

- Q-V01–Q-V10 ve zaten açık olan Q-T01/Q-S03/Q-ID01/Q-P02 çözülmeden Wave 4 implementation
  (TASK-027.22+) başlatılamaz.
- `SHIFT:REPORT:UPDATE`/`SHIFT:REPORT:VIEW` gerçek permission catalogue'a henüz eklenmedi.
- `OperatorBotUserId` çözümlemesi Wave 1'in gerçek SQL Server adapter'ı + gerçek PostgreSQL apply
  aşaması tamamlanmadan mümkün değildir (henüz üretilmedi).
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

### Durum

Teslim anında `status: review` idi; kaynak envanteri, hedef mapping, SRS güncellemesi ve açık
sorular hazırlandı. AI1 aşağıdaki Final Onayı ile `done` olarak kapattı (güncel durum: `done`).

## AI1 Final Onayı (2026-09-18)

TASK-027.21 teslimi onaylandı ve `done` olarak kapatıldı. BOTC Vardiya/Arşiv Vardiya
kaynak envanteri, migration belirsizlikleri, tenant/location mapping, lifecycle,
archive ve permission/audit etkileri kanıta dayalı olarak belgelendi. SRS ve Discovery
Wave 4 kapsamıyla güncellendi; Q-V01–Q-V10 ve diğer açık sorular karar gibi kapatılmadı.

Gerçek schema/DB bağlantısı, production kodu, migration/seed ve UI oluşturulmadı.
`./scripts/check.sh --skip-docker` PASS kabul edildi. Sıradaki TASK-027.22 domain
model tasarım/karar görevidir; Wave 2/Wave 3 kapsam dışıdır.

---

# TASK-027.21 (orijinal): Vardiya SRS ve migration mapping

## Amaç

Vardiya/arşiv kapsamını ve kaynak-hedef mapping’i kesinleştir.

## Wave ve bağımlılık

TASK-027.1; TASK-027.2

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
