---
id: TASK-029.00
title: EPIC-005 Task Planı ve Bağımlılık Sözleşmesi
status: planned
srs_refs: [FEAT-023, FEAT-024, FEAT-025]
parent_epic: EPIC-005
updated_at: 2026-09-22
---

# TASK-029.00: EPIC-005 Task Planı ve Bağımlılık Sözleşmesi

## Amaç

DEC-0014 kararlarını uygulanabilir task sırasına dönüştürmek. Bu dosya
implementation yapmaz; EPIC-005'in bağımlılık ve kabul sınırlarını tanımlar.

## Bağımlılık sırası

`029.01 → 029.02/029.03 → 029.04 → 029.05 → 029.06`

`029.01 → 029.07 → 029.08`

`029.01 → 029.09 → 029.10`

`029.02/029.04/029.05 → 029.11 → 029.12`

## Task kapsamları

1. **029.01 — Domain ve referans sözleşmesi:** MİP root, MOSB Enerji ve
   MOSBIO operasyon tenantları; MOSEDAŞ external system; BEAM/ERP external
   reference; tesis/makine referansı; Kömür Kazanı ilişkisi.
2. **029.02 — B2B güvenlik:** mTLS + OAuth2 client credentials, credential
   sahipliği, allowlist, revocation, audit ve payload redaction.
3. **029.03 — Kapasite:** Metnex-owned operational capacity model; BEAM/ERP
   referansları; bakım/duruş etkisi; dönem snapshot'ı.
4. **029.04 — Üretim emri:** Versiyon, kabul/ret, `PAUSED`/`EXECUTION_BLOCKED`,
   iptal/replan, idempotency ve çoklu vardiya ilişkisi.
5. **029.05 — Operasyon Merkezi API:** Vardiya, order görünümü, olay,
   gerçekleşme ve kapanış domain sınırları.
6. **029.06 — İlk ekran grubu:** Özet, vardiya listesi/detayı, order
   listesi/detayı ve olay akışı.
7. **029.07 — Laboratuvar domain:** Parametrik analiz tanımı, numune, sonuç,
   taslak/onay/kilit/revizyon, domain permission ve audit.
8. **029.08 — Laboratuvar UI:** Tanım/parametre, numune, sonuç, onay/kilit ve
   geçmiş ekranları.
9. **029.09 — İşletme domain:** Ayrı parametrik form/alan tanımı, taslak/onay/
   kilit/revizyon ve domain audit.
10. **029.10 — İşletme UI:** Form/alan tanımı, veri girişi, onay/kilit ve geçmiş.
11. **029.11 — Olay delivery:** Kalıcı outbox/event, `CRITICAL/HIGH/NORMAL`,
    retry, DLQ, teknik alındı/işleme sonucu ve idempotent delivery.
12. **029.12 — Kabul:** Tenant izolasyonu, external-system güvenliği, audit,
    retry, redaction, ekran/API acceptance ve kalite kapıları.

## Ortak kurallar

- Wave 2 ve Wave 3 kapsam dışıdır.
- BEAM/ERP ana verisi kopyalanmaz ve sahiplik Metnex'e taşınmaz.
- MOSEDAŞ Metnex tenantı değildir.
- Kullanıcı JWT'si veya platform admin rolü B2B kimliği değildir.
- Gerçek credential, üretim verisi ve bağlantı dizesi teslim raporlarına yazılmaz.
- Docker/DB işlemleri task talimatında ayrıca onaylanmadan çalıştırılmaz.
- Her implementation task'ı `review` teslimi, `check.sh --skip-docker`, test,
  audit/tenant etkisi ve kalan risk raporu ile kapanır.

