---
id: TASK-029.00-R2
title: BRIF2 Kararlarının Discovery, SRS ve EPIC-005'e İşlenmesi
status: review
parent_epic: EPIC-005
related: [TASK-029.00, TASK-029.00-R1, DEC-0014, DEC-0015, DEC-0016, DEC-0017]
updated_at: 2026-09-28
---

# TASK-029.00-R2: BRIF2 Kararlarının Discovery, SRS ve EPIC-005'e İşlenmesi

## Durum
review (AI1/PO incelemesi bekleniyor). Karar kaydı ve dokümantasyon uyarlama görevi: production kodu, migration/DB/UI, yeni tenant/rol/permission ve git commit/push **yoktur**. TASK-029.01 veya sonraki implementation task'ları bu görevde `ready` yapılmamıştır.

## Teslim
- **Yeni karar kaydı:** `docs/decisions/DEC-0017-operations-laboratory-and-kirim-decisions.md` — D-01–D-22 karar masasının kapanışı (D-05, D-11, D-12-formül, D-13, D-18, D-20 bilinçli olarak açık bırakıldı; "Açık statüler" tablosu).
- **Discovery addendum:** `docs/requirements/DISCOVERY.md` — §21.1 ve §22/§22.3.1'e supersede/addendum notları; yeni **§27 "DEC-0017 Addendum"** (13 alt bölüm, D-01…D-22'nin tamamını kapsar). Eski metin silinmedi.
- **SRS etki listesi:** `docs/requirements/SRS.md` — MOD-007 (FR-067–071) ve MOD-009 (FEAT-019–021, FR-082–090, TBD-OPS-005/006/007) üzerine DEC-0017 notları; yeni **§9.2 "DEC-0017 Etki Listesi"** (FEAT-026–029 taslakları, BR-020/021, IR-005 taslakları — henüz onaylı acceptance criterion değil, madde numaraları AI1 onayında kesinleşecek).
- **EPIC-005 güncellemesi:** `backlog/EPIC-005-…md` — Amaç/Kapsam/Kapsam dışı genişletildi; 12 task'ın her birine [DEC-0017] notu; yeni "Yeni blocker'lar" tablosu.
- **TASK-029.00 güncellemesi:** `backlog/TASK-029-00-operations-laboratory-task-plan.md` — bağımlılık sırası notu (Kırım emri B2B'ye bağımlı değil) ve 12 task kapsamının her birine [DEC-0017] genişletme notu.
- **BOTC_MIGRATION_OPEN_QUESTIONS.md** append-only kayıt (çapraz referans: Q-024, Q-023, Q-T01/Q-V01, yeni MOSB tenant-dili uyum ihtiyacı).
- `METNEX_STATE.md`, `PROGRESS_LOG.md` güncellendi.

## Kapsam dışı / yapılmadı
Kod, migration, şema, yeni tenant/rol/permission oluşturulmadı. D-05 (Netsis), D-11 (kepçe cihazı), D-12 (kalori formülü doğrulaması), D-13 (kalite limitleri), D-18 (nihai paçal miktarı), D-20 (rapor kolonları/Jasper şablonu) **kapatılmadı** — bilinçli olarak açık bırakıldı. TASK-029.01 bu görevde `ready` yapılmadı; Product Owner'ın ayrıca `ready` vermesi gerekir.

## Doğrulama
Yalnız belge değişti (kod dosyası yok); mevcut testler koşuldu, sonuç aşağıda raporlanır.
