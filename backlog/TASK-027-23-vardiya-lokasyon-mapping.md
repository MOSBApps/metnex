---
id: TASK-027.23
title: Vardiya Lokasyon–Tenant Mapping ve Scope Karar Paketi
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-19
---

> **Başlık/kapsam notu:** Bu ID, orijinal 53-task batch'inden gelen "Vardiya lokasyon mapping"
> placeholder'ıydı. AI1'in 2026-09-19 talimatıyla kapsam **karar/mapping hazırlık paketi** olarak
> netleştirildi (tenant ataması, seed, schema, API yok). Talimat `backlog/TASK-027-23-vardiya-location-tenant-mapping.md`
> adını anmıştı; aynı ID'ye ait ikinci bir dosya oluşturmamak için mevcut dosya adı korundu. Orijinal
> placeholder içeriği en altta korunmuştur.

## AI2 Teslim Raporu (2026-09-19)

Ana teslimat: `docs/migration/BOTC_VARDIYA_LOCATION_TENANT_MAPPING_DECISION_PACKAGE.md` (yeni).

- **Lokasyon envanteri:** BOTC kodu yeniden doğrulandı; yalnızca 5 lokasyon (MOSBİO, MOSB ENERJİ,
  KÖMÜR KAZANI, MOSBİO KIRIM DEPO, SANTRAL). MOSEDAŞ, GT/SG, SCADA eklenmedi. `Sirket` Vardiya
  kodunda hiç yok, tenant kaynağı değil. Her lokasyon için tablo: entity/tablo, taslak `locationCode`,
  tenant adayı, kanıt seviyesi (E1–E4), kaynak, çelişki, erişim durumu, PO kararı gerekliliği.
- **Kanıt/durum:** MOSBİO ve MOSB ENERJİ E2 (güven yüksek, Discovery/D-005 tabanlı) ama onay kaydı
  olmadığından `PENDING_APPROVAL`; KÖMÜR KAZANI `PENDING_APPROVAL` (E2 zayıf, aday MOSB); MOSBİO KIRIM
  DEPO `PENDING_APPROVAL` (E3); SANTRAL `UNRESOLVED` (E4, sonradan eklenmiş, aday kanıtsız). Hiçbiri
  `RESOLVED` değil, hepsi erişime kapalı.
- **Tenant eşleme seçenekleri:** S1 doğrudan / S2 alt tenant / S3 `NULL` / S4 yalnızca veri alanı
  lokasyon bazında karşılaştırıldı; S4'ün tenant kararı olmadığı, S2'nin yeni tenant ve dolaylı root
  aggregation genişlemesi gerektirdiği belirtildi. Öneri: belirsizlerde S3 ile başla (en ucuz geri dönüş).
- **Mevcut mekanizma uyumu:** `TenantScopeService.resolve()`, `canAggregateChildren`, `tenant_closure`,
  `canEnterData`, `TenantMembershipGuard` kod satırlarıyla doğrulandı; yeni scope/root yetkisi/lokasyon
  permission'ı üretilmedi.
- **Fail-closed kuralları K1–K12:** `NULL`, `scopeStatus≠RESOLVED`, çakışma (hiçbir erişim, ilk/son
  kazanır yok), onaysız mapping, root/`PLATFORM_ROOT` unresolved'ı okuyamaz, yeniden çözümleme
  idempotent ve RESOLVED satır sessizce taşınmaz.
- **Kavramsal mapping sözleşmesi:** 10 alan zorunluluk/null tablosu, 5 `mappingStatus` durumu ve
  geçişleri; uygulanmadı.
- **Bulgular:** (1) MOSB/MOSBİO/MOSEDAŞ tenant kayıtları için `apps/` içinde seed bulunamadı (Q-V20);
  (2) `isSystemAdmin` iki guard'ı geçer ama `resolve()` `PLATFORM_ROOT` için 403 verir — TASK-027.30'da
  test edilmeli.
- **Açık sorular:** Q-T01, Q-V01, Q-S03, Q-V16, Q-V18 için kanıt/seçenek/AI2 önerisi sunuldu, **hiçbiri
  kapatılmadı**. Yeni: Q-V20 (tenant varlığı), Q-V21 (mapping saklama yeri), Q-V22 (effectiveFrom/reassignment).
- **Güncellenen dokümanlar:** karar paketi (yeni), `BOTC_MIGRATION_OPEN_QUESTIONS.md` (append-only),
  `BOTC_VARDIYA_METNEX_TARGET_MAPPING.md` §17. DISCOVERY/SRS değiştirilmedi.
- **Teyit:** tenant oluşturma/atama, seed, schema, migration, DB bağlantısı, gerçek veri, API/UI,
  permission catalogue, root aggregation, Wave 2/3, Docker, git commit/push yapılmadı; yeni tenant/slug/
  lokasyon/permission uydurulmadı.
- **Doğrulama:** `./scripts/check.sh --skip-docker` PASS (36 suite / 333 test; yalnızca dokümantasyon).

### Durum
`status: done` — AI1 teslimatı onaylamıştır.

## AI1 Onay — 2026-09-19

TASK-027.23 teslimatı kapsamına uygun bulunarak onaylandı ve `done` olarak kapatıldı.
Lokasyon envanteri BOTC koduyla sınırlandırılmış, hiçbir lokasyon `RESOLVED` yapılmamış,
`Sirket` tenant kaynağı olarak kullanılmamış ve unresolved/conflict kayıtlar fail-closed
olarak tanımlanmıştır. Mevcut tenant-scope mekanizmaları yeniden kullanılmış, yeni root
yetkisi veya lokasyon permission'ı üretilmemiştir.

Q-T01, Q-V01, Q-S03, Q-V16, Q-V18 ve yeni Q-V20–Q-V22 açık kalmıştır. `isSystemAdmin`
guard bypass'ı ile `TenantScopeService.resolve(PLATFORM_ROOT)` davranış farkı TASK-027.30
güvenlik test girdisi olarak korunmuştur. Tenant, seed, schema, migration, API, UI ve
production kodu değiştirilmemiştir.

---

# TASK-027.23: Vardiya lokasyon mapping

## Amaç

Vardiya lokasyonlarını Metnex lokasyonlarına eşleştir.

## Wave ve bağımlılık

TASK-027.21

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
