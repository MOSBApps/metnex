---
id: EPIC-005
title: Metnex Operasyon Merkezi, MOSEDAŞ Entegrasyonu, Laboratuvar ve İşletme
status: planned
srs_refs: [FEAT-023, FEAT-024, FEAT-025]
updated_at: 2026-09-22
---

# EPIC-005: Metnex Operasyon Merkezi, MOSEDAŞ Entegrasyonu, Laboratuvar ve İşletme

## Amaç

DEC-0014 ile kararlaştırılan ürün sınırını implementation'a dönüştürmek:
MOSEDAŞ'ın üretim planı/emir SoR'u olduğu, Metnex'in operasyon yürütme ve
gerçekleşme SoR'u olduğu sınırda güvenli entegrasyon, Vardiya Operasyon Merkezi,
Laboratuvar ve İşletme modüllerini geliştirmek.

## Kapsam

- MOSEDAŞ external-system B2B sözleşmesi ve allowlist.
- Tesis/makine referansları ve Metnex operasyonel kapasite snapshot'ları.
- Vardiya Operasyon Merkezi.
- Üretim emri kabul, yürütme, olay ve gerçekleşme geri bildirimi.
- Parametrik Laboratuvar modülü.
- Ayrı parametrik İşletme modülü.

## Kapsam dışı

- Wave 2 Bakım/Arıza.
- Wave 3 DÖF.
- BEAM/ERP ana veri sahipliğinin Metnex'e taşınması.
- MOSEDAŞ'ın pazar, fiyat, optimizasyon ve tedarikçi planlama fonksiyonları.
- Genel amaçlı BPMN/script/user-defined SQL/low-code platformu.

## Task planı

| Sıra | Task | Amaç | Durum |
|---:|---|---|---|
| 1 | TASK-029.01 | Domain, tenant, external-system ve reference sözleşmesi | planned |
| 2 | TASK-029.02 | MOSEDAŞ B2B güvenlik ve mesaj sözleşmesi | planned |
| 3 | TASK-029.03 | Kapasite, bakım/duruş etkisi ve snapshot modeli | planned |
| 4 | TASK-029.04 | Üretim emri lifecycle, versiyon ve idempotency | planned |
| 5 | TASK-029.05 | Vardiya Operasyon Merkezi API/domain | planned |
| 6 | TASK-029.06 | Vardiya Operasyon Merkezi ilk ekranları | planned |
| 7 | TASK-029.07 | Laboratuvar parametre ve analiz domain'i | planned |
| 8 | TASK-029.08 | Laboratuvar ilk ekran grubu | planned |
| 9 | TASK-029.09 | İşletme parametrik form domain'i | planned |
| 10 | TASK-029.10 | İşletme ilk ekran grubu | planned |
| 11 | TASK-029.11 | Entegrasyon olay/retry/DLQ ve acceptance | planned |
| 12 | TASK-029.12 | Epic güvenlik, tenant isolation ve uçtan uca kabul | planned |

## Başlatma kuralı

Task'lar `planned` durumundadır. SRS/Discovery güncellemesi ve ilgili task'ın
ön koşulları Product Owner/AI1 tarafından ayrıca gözden geçirilmeden AI2
implementation task'ı `ready` durumuna alınmayacaktır.

