---
id: TASK-027.64-R2
title: SCADA Audit entityId Nullable Migration Boundary
status: done
srs_refs: [SEC-DATA-002, AC-004]
parent_epic: EPIC-004
related: [TASK-027.64, TASK-027.64-R1, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.64-R2: SCADA Audit `entityId` Nullable Migration Boundary

## Amaç
DEC-0015/AI1 kararı “geçersiz katalog ID → `entityId = null`” ile `platform_audit_logs.entityId NOT NULL` şemasını uyumlu hale getirmek. Boş string, nil UUID veya başka sentinel **kullanılmaz**.

## Teslim edilen
- **Şema:** `apps/api/src/db/schema/operations.ts` → `entityId` nullable.
- **Migration (hazırlandı, UYGULANMADI):** `apps/api/drizzle/migrations/0005_platform_audit_entity_id_nullable.sql` = tek ifade `ALTER TABLE "platform_audit_logs" ALTER COLUMN "entityId" DROP NOT NULL;` + `meta/_journal.json` girdisi + `meta/0005_snapshot.json` (`drizzle-kit generate`, gerçek DB bağlantısı olmadan; yer tutucu `DATABASE_URL` yalnızca komut ortamında). İkinci `generate` çalıştırması “No schema changes, nothing to migrate” verdi (şema ↔ snapshot tutarlı).
- **Kayıtlar korunur:** migration yalnızca kısıtı gevşetir; `UPDATE/DELETE/INSERT/backfill/DEFAULT` yok (statik testle sabit).
- **İdempotans:** PostgreSQL'de zaten nullable bir sütunda `DROP NOT NULL` hatasız no-op'tur; drizzle journal girdisi ayrıca tekrar uygulamayı engeller. (Gerçek DB'de doğrulanmadı — aşağıya bkz.)
- **Servis:** `PlatformAuditLogInput.entityId` ve `PlatformAuditListRow.entityId` → `string | null`. `PlatformScadaQueryAudit` `''` hack'ini kaldırdı: `null` → gerçek `NULL`.
- **Sözleşme tablosu (testlerle sabit):**

| Durum | entityId | reasonCode |
|---|---|---|
| Geçersiz UUID biçimi (ham girdi/nil UUID/boş string yazılmaz) | `null` | `INVALID_CATALOG_ID` (`SCADA_QUERY_DENIED`) |
| Geçerli biçimli ama bulunamayan UUID | verilen UUID | `SOURCE_NOT_FOUND` |
| Bilinen katalog kaydı | katalog UUID | ilgili sonuç kodu (`OK` dahil) |
| Nesne olmayan/saldırgan kontrollü istek (geçerli katalog id yok) | `null` | ilgili ret kodu (`INVALID_CATALOG_ID` / `INVALID_REQUEST`) |

## Nullable değişikliğinin mevcut audit sorgularına etkisi (rapor)
- `PlatformAuditService.log`: `entityId` parametre olarak bağlanır; `null` desteklenir. Mevcut çağıranlar hep string geçtiği için davranış değişmez.
- `PlatformAuditService.list`: `SELECT`'te `entityId` döner (artık `null` olabilir); filtreler `actorId/actionCode/entityType/createdAt` eşitlik/aralık; `q` araması `"entityId" ILIKE` içerir — `NULL ILIKE …` `NULL` (yani eşleşmez) döner, hata vermez; başka filtre `entityId`'ye dokunmaz (testle sabit: `IS NULL` koşulu eklenmedi, filtreler değişmedi).
- **İndeks** `(entityType, entityId)` btree'dir; NULL değerleri indeksler, eşitlik aramaları etkilenmez.
- **Web (`apps/web/.../system/audit/page.tsx`):** satır tipi hâlâ `entityId: string`; `null` React'te boş render edilir, çökmez, ancak tip yanlıştır ve `null` için “—” gibi bir gösterim yoktur. **Bu R2'de web'e dokunulmadı** (kapsam: API/şema); küçük bir web düzeltmesi ayrı iş olarak önerilir.
- Adapter hiçbir modüle kayıtlı değil; migration uygulanana kadar `null` yazımı DB'de `23502` ile reddedilir → adapter **fail-closed** (`AUDIT_FAILED`) davranır (testle sabit: audit yazma hatası başarıyı engeller, ret sonucunu maskelemez).

## Rollback planı (belgelendi, **uygulanmadı**)
`SET NOT NULL` geri dönüşü yalnızca hiç `NULL` satır yokken güvenlidir; audit kanıtı silinmez, uydurma değerle doldurulmaz.
1. Önkoşul: SCADA adapter'ın audit eşleyicisi devre dışı/kaydedilmemiş olmalı (bugün kayıtlı değil).
2. `SELECT count(*) FROM platform_audit_logs WHERE "entityId" IS NULL;`
3. Sonuç **0** ise: `ALTER TABLE "platform_audit_logs" ALTER COLUMN "entityId" SET NOT NULL;` + drizzle journal/snapshot'ın 0005 öncesine döndürülmesi (yeni bir “down” migration olarak, mevcut 0005 düzenlenmeden).
4. Sonuç **> 0** ise: **rollback yapılmaz**; satırlar silinmez, `''`/nil UUID/sentinel ile doldurulmaz. Önce AI1/PO kararı (ör. satırları ayrı bir arşiv tablosuna kopyalayıp sonra karar) gerekir. Bu durumda tavsiye: sütun nullable kalır (ileri düzeltme).
5. Her durumda önce yedek/`pg_dump` (yalnızca `platform_audit_logs`) ve kullanıcı onayı.

## Testler (mock/statik; gerçek DB yok)
- `apps/api/src/audit/platform-audit-entity-id.spec.ts`: şema nullable, diğer kolonlar/indeks aynı; migration tek ifade, satır değiştirmez, tekrar çalıştırılabilir yapıda; journal/snapshot zinciri ve 0004↔0005 dışında sürüklenme yok; `log` gerçek `null`/değişmemiş string yazar, yazma hatası fırlar (fail-closed dayanağı); `list` null entityId'li satırlarla çalışır; filtreler değişmemiş.
- `apps/api/src/reporting/scada/adapter/scada-audit-entity-id.spec.ts`: adapter → `PlatformScadaQueryAudit` → gerçek `PlatformAuditService` (mock DB): 8 geçersiz id örneği `null` + `INVALID_CATALOG_ID` + `SCADA_QUERY_DENIED`, ham girdi/nil UUID/boş string yok; geçerli bilinmeyen UUID korunur; başarı katalog UUID'sini taşır; üç durum tabloda ayırt edilir; audit hatası fail-closed.
- `platform-scada-query-audit.spec.ts` ve DEC-0015'e hizalı 027.58 testleri (`entityId` `null`) güncellendi; `''` bekleyen test kalmadı.
- **Mutasyonlar (uygulanıp yakalandı, geri alındı):** entityId tekrar NOT NULL (şema), eşleyicide `''`, eşleyicide nil UUID, adapter'da nil UUID, ham girdinin audit'e yazılması, geçerli bilinmeyen UUID'nin `null` yapılması, migration'ın satırları değiştirmesi (`UPDATE` eklendi), migration'ın `SET NOT NULL` olması.

## Yapılmayanlar / ayrı açık onay gerektirenler
Gerçek PostgreSQL'e bağlanma, **migration apply**, Docker/PostgreSQL smoke testi, mevcut audit verisine dokunma, canlı/dev DB — **hiçbiri yapılmadı**. Yeni action kodu, yeni permission, adapter'ın diğer davranışları, Q-W516/Q-W519, git commit/push yok.

## 2026-09-23 — AI1 Onayı: `done`
AI1 R2 teslimini onayladı (`review` → `done`). TASK-027.64-R2, TASK-027.64-R1 ve TASK-027.64 `done`. Açık kalanlar (ayrı işler): gerçek PostgreSQL migration apply (ayrı açık onay gerektiren operasyon task'ı), gerçek DB idempotency doğrulaması, mevcut `platform_audit_logs` verisinde nullable smoke testi, web audit sayfası tipinin `entityId: string | null` yapılması (küçük ayrı web task'ı). Git commit/push yapılmadı.
