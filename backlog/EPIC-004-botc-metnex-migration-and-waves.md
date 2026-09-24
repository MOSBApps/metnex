---
id: EPIC-004
title: BOTC → Metnex Migration ve Wave Uygulamaları
status: active
srs_refs: [FEAT-008]
updated_at: 2026-09-17
---

# EPIC-004: BOTC → Metnex Migration ve Wave Uygulamaları

## Amaç

BOTC kaynak uygulamasındaki onaylı modülleri Metnex stack’i üzerinde tenant,
permission, PostgreSQL ve SQL Server read-only mimarisiyle yeniden modellemek.

## Aktif kapsam

- Wave 0: Mimari, güvenlik ve migration hazırlığı
- Wave 1: Kimlik ve kullanıcı migration’ı
- Wave 4: Vardiya ve arşiv
- Wave 5: Reporting / SCADA / DMS

## Kapsam dışı

- Wave 2: Bakım/Arıza
- Wave 3: DÖF

Wave 2 ve Wave 3 ancak ayrı Discovery/SRS ve açık Product Owner onayıyla
yeniden değerlendirilebilir. Yalnızca ready task başlatılır.

## Governance

Her tamamlanan task backlog, METNEX_STATE.md ve append-only PROGRESS_LOG.md ile
kapatılır. SCADA/DMS kaynakları read-only, migration’lar idempotent ve
backup/rollback kanıtlı olmalıdır.

## 2026-09-22 — Task ID normalizasyonu

MFA enforcement `TASK-027.48` olarak korunmuştur. Tenant-role delegation artık
`TASK-027.54`; Wave 5 grafik/export zinciri `TASK-027.55`–`TASK-027.60` aralığındadır.
Eski duplicate backlog dosyaları kaldırılmış, tarihsel ODC kayıtları append-only
kuralı nedeniyle değiştirilmemiştir.
