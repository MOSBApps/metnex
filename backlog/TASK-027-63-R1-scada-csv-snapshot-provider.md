---
id: TASK-027.63-R1
title: SCADA CSV Snapshot Development Provider
status: done
srs_refs: [FR-014, FR-015, FR-018, SEC-DATA-002, AC-004]
parent_epic: EPIC-004
related: [TASK-027.63, TASK-027.64, TASK-027.58]
updated_at: 2026-09-23
---

# TASK-027.63-R1: SCADA CSV Snapshot Development Provider

## Durum

done

## Amaç

`veriler/raw/` klasörüne bırakılan 4 gerçek CSV snapshot dosyasını (`endeksler.csv`, `gt_endeksler.csv`, `komur_endeksler.csv`, `sg_endeksler.csv`) yalnızca `NODE_ENV=development` ve `REPORTING_DEV_FIXTURES=true` ortamlarında okuyarak Metnex zaman serisi analiz sözleşmesine bağlayan fail-closed fixture provider'ını sunmak.

## Kapsam ve Yapılan Değişiklikler

1. **Manifest Sözleşmesi (`veriler/manifest/scada-fixtures.manifest.json`):**
   - 4 CSV snapshot dosyasının (endeksler: 7.727 satır/33 kolon, gt: 6.383/24, komur: 6.384/15, sg: 6.383/19) SHA-256 doğrulama hash'leri, `idColumn`, `dateColumn`, `timeColumn`, `timezone: "UNVERIFIED"`, `developmentOnly: true` manifest ile kayıt altına alındı.
2. **Development-only Provider (`apps/api/src/reporting/scada/fixture/scada-csv-fixture.provider.ts`):**
   - Yalnızca `NODE_ENV=development` & `REPORTING_DEV_FIXTURES=true` koşullarında çalışır.
   - Production bundle ve varsayılan Nest DI container'ında devreye girmez (DEC-0012).
   - SQL Server, PostgreSQL veya ORM bağımlılığı barındırmaz.
   - MOSEDAS tenant olarak kabul edilmez.
3. **Fail-Closed CSV Parser (`apps/api/src/reporting/scada/fixture/scada-csv-parser.ts`):**
   - Semicolon `;` ve UTF-8 okuması.
   - Path traversal engelleme.
   - Tarih/saat normalization (ISO 8601 UTC).
   - Eksik veri için Q-W509 kuralı (sessizce 0 yapılmaz, `dataQuality: 'MISSING'`).
   - Ham CSV satırları hiçbir log ortamına yazdırılmaz.
4. **Test Kapsamı (`apps/api/src/reporting/scada/fixture/scada-csv-fixture.provider.spec.ts`):**
   - 20 maddelik bağımsız unit ve statik test senaryosu %100 başarıyla doğrulandı.
5. **Dokümantasyon & Git Güvenliği:**
   - `.gitignore` içerisine `veriler/raw/` ve `veriler/normalized/` eklendi.
   - `veriler/README.md` oluşturuldu.

## Kabul Kriterleri & Kalite Kapısı

- 20 unit ve statik güvenlik testi başarıyla geçti (`pnpm --filter api test apps/api/src/reporting/scada/fixture/scada-csv-fixture.provider.spec.ts`).
- `./scripts/check.sh --skip-docker` PASS.
- Git commit/push yapılmadı.

## 2026-09-23 — Tüketici referansı (TASK-027.65)
`ScadaAnalysisQueryService` test sözleşmesinde bu development provider'ı (`veriler/raw/endeksler.csv`) salt-okuma tüketir (`scada-analysis-query.csv-fixture.spec.ts`); dosyalar değiştirilmez, `veriler/raw/` yoksa test atlanır. Manifestteki `timezone: UNVERIFIED` nedeniyle testte saat dilimi bir **test parametresidir**.
