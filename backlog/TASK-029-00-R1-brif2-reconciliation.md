---
id: TASK-029.00-R1
title: METNEX AI1 Discovery Reconciliation ve Etki Değerlendirmesi
status: review
parent_epic: EPIC-005
related: [TASK-029.00, DEC-0014, DEC-0015]
updated_at: 2026-09-25
---

# TASK-029.00-R1: METNEX AI1 Discovery Reconciliation ve Etki Değerlendirmesi

## Durum
review (AI1/PO incelemesi ve karar masası bekleniyor). Denetim/keşif görevi: production kodu, API/UI, migration, şema, DB/Docker, credential, yeni tenant/rol/permission, canonical Discovery/SRS/domain/DB/karar/EPIC-005 değişikliği ve git commit/push **yoktur**.

## Teslim
`docs/discovery/METNEX_AI1_DISCOVERY_BRIF2_EVALUATION.md` — bölümler A (yönetici özeti) · B (kaynak/repo kanıt tabloları; BRIF2 hükümleri ve repo içi tutarsızlıklar) · C (kapsam/etki matrisi) · D (çelişkiler C-01…C-09) · E (14 domain nesnesi) · F (entegrasyon sınırları) · G (güvenlik/SDLC riskleri) · H (belge değişikliği planı) · I (faz önerisi) · J (22 kararlık karar masası) · K (BRIF2 sınıflandırma özeti). Etiketler: [ESKİ KARAR] / [YENİ İŞ BİLGİSİ] / [AI2 ÖNERİSİ]; statüler CONFIRMED · CONFLICT · TBD · EXTERNAL_VALIDATION_REQUIRED · PROPOSED_ONLY · OUT_OF_SCOPE.

## Öne çıkan bulgular
- **Critical C-01:** "üretim emri" iki anlamlı — MOSEDAŞ enerji emri (DEC-0014 SoR: MOSEDAŞ) ↔ Kırım Tesisi iç emri (BRIF2 §6.1: reçeteyi hazırlayan açar). DEC-0014 supersede edilmeden kapsam açıklaması gerekir.
- **High:** laboratuvar yaşam döngüsü (onay/kilit/revizyon ↔ kısmi/append/esas sonuç), kantar/Netsis sahipliği, **kodda hâlâ MOSEDAŞ'ı tenant sayan kimlik migration slug kümesi** (`apps/api/src/migration/botc-identity/tenant-mapping.ts:8`), ortak lab ekibi ↔ tenant izolasyonu.
- Repo'da lab/kantar/yığın/paçal/emir/vardiya-operasyon/external-system için **uygulanmış kod yoktur**; Vardiya task'ları (027.21–.30, `done`) karar/blocker paketleridir.
- Wave 5 etkilenmez; kömür sayaç kaynağı (operatör mi SCADA mı) TBD.

## Doğrulama
Yalnız belge değişti; `git status` ile kod dosyası değişmediği doğrulandı; mevcut testler koşuldu (sonuç METNEX_STATE/PROGRESS_LOG'da).
