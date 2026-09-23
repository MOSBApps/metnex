---
id: TASK-027.58
title: SCADA Güvenlik ve Performans Testleri
status: planned
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-22
---

# TASK-027.58: SCADA Güvenlik ve Performans Testleri

## Amaç

SQL injection, tenant isolation, timeout, row/payload limit, export ve grafik
performans sınırlarını test etmek.

## Bağımlılık

TASK-027.54–TASK-027.57

## Kabul kriterleri

- Kaynak/table/column manipülasyonu scope aşamaz.
- Read-only adapter write çalıştırmaz.
- Timeout, satır ve payload limitleri fail-closed çalışır.
- Kritik güvenlik senaryoları negatif/mutation testleriyle kanıtlanır.

