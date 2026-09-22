---
id: EPIC-002
title: Demo Operations & Reporting Foundation
status: done
srs_refs: [FEAT-006, FEAT-007, FR-010, FR-011, FR-012, FR-013]
updated_at: 2026-09-16
---

# EPIC-002: Demo Operations & Reporting Foundation

## Kapsam
- ~~Demo Operasyonları Modülü (`apps/api/src/demo-operations`)~~ — **kaldırıldı** (TASK-022.3, `docs/decisions/DEC-0012-demo-operations-removal.md`)
- ~~Örnek Tanım ve İşlem CRUD Yüzeyleri~~ — **kaldırıldı** (TASK-022.3)
- Raporlama Temeli (`apps/api/src/reporting`) — korunuyor; Jasper render adapter (TASK-022.1) ve dataset provider soyutlaması (TASK-022.2) genel/module-bağımsız hale getirildi, demo'ya özel provider kaldırıldı (TASK-022.3)
- HTML Canlı Önizleme, PDF ve XLSX Dışa Aktarma — korunuyor; artık artifact-driven ve demo'dan bağımsız
- Jasper Renderer Servisi (`services/jasper-renderer`) — TASK-022.5 ile eklendi: bağımsız Maven/Spring Boot 3 (Java 21) servisi, gerçek JasperReports ile PDF/XLSX üretiyor, `./dev.sh` ve deployment stack'lerine (dev-stack/test/swarm) internal-network-only olarak wire edildi

> Bu epic'in orijinal teslimi Demo Operations'ı içeriyordu; TASK-022.1 → TASK-022.5 zinciri
> raporlama altyapısını demo'dan ayrıştırıp demo modülünü kaldırdı ve gerçek bir Jasper renderer
> servisi inşa etti. Detay:
> `backlog/TASK-022-1-jasper-render-service.md`, `backlog/TASK-022-2-reporting-dataset-provider-abstraction.md`,
> `docs/decisions/DEC-0012-demo-operations-removal.md`,
> `backlog/TASK-022-4-jasper-render-service-deployment-contract.md` (status: review),
> `backlog/TASK-022-5-jasper-renderer-service.md`, `docs/decisions/DEC-0013-jasper-renderer-service.md`.
