---
id: TASK-027.4
title: MIP tenant isletme lokasyon mapping
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI1 Onayı — TASK-027.4 (2026-09-17)

AI1 teslimi onayladı. `Sirket` alanının serbest metin olduğu ve erişim/yetki
kararlarında kullanılmadığı kanıtlandı; tenant eşleme kaynağı olarak kabul edilmedi.
MİP `ROOT` / işletme `STANDARD` hiyerarşisi mevcut `tenant-scope` ve
`tenant_closure` mekanizmasıyla doğru eşlendi. `MOSBİO` ve `MOSB ENERJİ` doğrudan
işletme tenant adayı, diğer lokasyonlar karar bekleyen tenant-içi scope/tesis
adayları olarak bırakıldı. Q-T01 append-only korundu; Wave 2/Wave 3 kapsam dışıdır.

TASK-027.4 `done` olarak kapatıldı.

## AI2 Teslim Raporu (2026-09-17)

### Kaynak inceleme yöntemi

**BOTC tarafı:** `Sirket` alanının kullanıldığı tüm dosyalar (`grep -rn "\.Sirket\b" ../BOTC
--include=*.cs`) taranıp her kullanım yeri (entity tanımı, servis parametresi, admin `TextBox`)
doğrulandı; ayrı bir arama ile herhangi bir sorgu/yetkilendirme filtresinde `Sirket`
kullanılmadığı teyit edildi. `VardiyaService.cs`/`ArsivVardiyaService.cs`'nin 5 sabit lokasyon
string'i (`MOSBİO`, `MOSB ENERJİ`, `KÖMÜR KAZANI`, `MOSBİO KIRIM DEPO`, `SANTRAL`) ve
`docs/requirements/DISCOVERY.md` §21.1'deki "Bilinen üretim kaynakları" tablosu çapraz okundu.

**Metnex tarafı:** `apps/api/src/tenant-scope/{tenant-scope.service.ts,tenant-closure.service.ts,
customer-schema-registry.service.ts}` ve `apps/api/src/db/schema/{platform.ts,enums.ts}` **gerçek
kod/şema** olarak okundu — `TenantType` enum'u (`PLATFORM_ROOT`/`ROOT`/`STANDARD`), `tenants`
tablosunun `parentId`/`customerRootId`/`canEnterData`/`canAggregateChildren` kolonları, sınırsız
derinlik destekleyen `tenant_closure` kapanış tablosu ve `TenantScopeService.resolve()`'un
`canAggregateChildren` mantığı doğrudan koddan doğrulandı — **hiçbir mekanizma varsayılmadı**.

### Kritik bulgular

1. **`Sirket` alanı hiçbir sorgu/yetkilendirme kararında kullanılmıyor** — yalnızca admin formunda
   serbest metin (`TextBox`) olarak toplanıp saklanıyor, `nullable`, önceden tanımlı liste/FK yok.
   Bu nedenle Wave 1 migration'ında **tek başına güvenilir bir tenant eşleme kaynağı olarak
   kullanılamaz** (Q-M06 ile aynı belirsizlik, kaynak kod kanıtıyla doğrulandı).
2. **Metnex'in var olan `tenant-scope` mekanizması, Discovery D-006'nın ("permission +
   canAggregateChildren + data scope") birebir çalışan karşılığıdır** — yeni bir mekanizma
   gerekmiyor, `TenantScopeService.resolve()` zaten `canAggregateChildren=true` olan bir `ROOT`
   tenant için tüm torun tenant ID'lerini (`tenant_closure` üzerinden) döndürüyor.
3. **5 lokasyondan yalnızca 2'si (`MOSBİO`, `MOSB ENERJİ`) doğrudan işletme tenant'ının kendisine
   karşılık geldiği makul güvenle söylenebilir** (Discovery §21.1 ile örtüşüyor); `KÖMÜR KAZANI`
   muhtemelen MOSB Enerji'nin alt-varlığı; `MOSBİO KIRIM DEPO`/`SANTRAL` için ilişki kod/Discovery'de
   açıkça belirtilmemiş — yeni açık soru **Q-T01**.

### Teslimat

`docs/migration/BOTC_MIP_TENANT_LOCATION_MAPPING.md`:

- **§1** MİP root/işletme tenant ayrımının Metnex'in gerçek `TenantType` enum'una eşlemesi
  (`ROOT`/`STANDARD`/`PLATFORM_ROOT`, platform yönetimi kapsam dışı).
- **§2** `Sirket` alanı kaynak kod kanıtı ve güvenilirlik değerlendirmesi (yukarıdaki bulgu 1).
- **§3** 5 BOTC lokasyonu için işletme-tenant/tenant-içi-scope/ayrı-tesis seçenek tablosu,
  Discovery §21.1 üretim kaynakları kanıtıyla.
- **§4** SCADA/DMS kaynaklarının tenant görünürlük modeli hazırlığı — `TenantScopeService`'in
  gerçek `canAggregateChildren` mantığının D-006 ile örtüştüğü gösterildi, implementation
  üretilmedi.
- **§5** Tenant izolasyonu, root analiz yetkisi, işletme erişim sınırları — Discovery/SRS
  (FR-015, SEC-DATA-001/002, ROLE-001/002) ve gerçek `tenant-scope` koduyla çapraz kontrol.
- **§6** Wave 2/3 kapsam dışı teyidi.

### Yeni açık soru (Q-T01, append)

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye mevcut Q-M/Q-A/Q-S/Q-E serisi **korunarak**
1 yeni soru eklendi: **Q-T01** — `MOSBİO KIRIM DEPO`/`SANTRAL` ayrı tenant node'u mu, veri alanı mı
(PO onayı gerekli). Özet tablosuna 1 satır eklendi, mevcut satırlar değiştirilmedi. Q-M06 ve
Q-S03 içerikleri **değiştirilmedi**, yalnızca bu belgede somut lokasyon/SCADA-kaynak seçenekleriyle
ilişkilendirildi (kabul kriteri #6).

### Kapsam kriterleri karşılama

- MİP root, MOSB, MOSEDAŞ, MOSBİO ayrımı §1'de açıkça belgelendi.
- Her eşleme BOTC kaynak dosyasına veya Discovery/SRS referansına dayanıyor.
- Kesin olmayan tenant-lokasyon ilişkileri (`KÖMÜR KAZANI`, `MOSBİO KIRIM DEPO`, `SANTRAL`) "karar
  bekliyor" olarak işaretlendi, varsayım üretilmedi.
- Root tenant'ın işletme verilerini analiz etme yetkisi §4/§5'te ayrıca belgelendi.
- Tenant izolasyonu ve permission etkileri §5'te belgelendi.
- SCADA/DMS belirsizlikleri Q-S03 ve Q-M06 ile ilişkilendirildi (§4, §7).
- Wave 2/3 kapsam dışı korundu (§6).
- Gerçek secret/parola/connection string hiçbir teslim dokümanına yazılmadı.
- Yeni production kodu, migration veya seed yazılmadı.

### Doğrulama

`./scripts/check.sh --skip-docker` → **PASS** (kod değişikliği yok, regresyon riski yok).

### Kalan riskler / sonraki bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmedi** — lokasyon→tenant modeli (Q-M06, Q-T01)
  ve SCADA kaynak→tenant fiziksel eşlemesi (Q-S03) çözülmeden Wave 4/Wave 5 implementation
  planlaması yapılamaz.
- `Sirket` alanının Wave 1 migration'ında nasıl ele alınacağı PO kararı gerektirir.
- Production kodu, PostgreSQL, Docker, Git history değişmedi. Git commit/push yapılmadı.

### Durum

`status: done` — AI1, MİP tenant/işletme/lokasyon mapping ve Q-T01 açık sorusunu inceleyip
onayladı (2026-09-17, bkz. dosya başındaki "AI1 Onayı — TASK-027.4" bölümü).

# TASK-027.4: MIP tenant isletme lokasyon mapping

## Amaç

MİP root, işletme tenant ve lokasyon eşleşmelerini tanımla.

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
