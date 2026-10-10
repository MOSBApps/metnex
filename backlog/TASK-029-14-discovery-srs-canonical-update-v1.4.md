---
id: TASK-029.14
title: Discovery ve SRS Canonical Güncelleme — v1.4
status: done
parent_epic: EPIC-005
related: [TASK-029.00-R2, TASK-029.01, TASK-029.02, DEC-0017]
updated_at: 2026-10-06
---

# TASK-029.14: Discovery ve SRS Canonical Güncelleme — v1.4

## AI1 Onayı (2026-10-06)
`done`. Kontroller doğrulandı: Discovery ve SRS sürümleri 1.4 yapılmış; eski içerikler
silinmemiş; DEC-0017 kararları ana bölümlere taşınmış ve §27/§9.2 referansları korunmuş;
FEAT-026–029 taslak olarak işaretlenmiş; açık sorular tekilleştirilmiş ve statülendirilmiş;
DOMAIN_MODEL.md yalnız doğrulanmış etkiyle güncellenmiş; EPIC-005 `active_epics` içine eklenmiş;
METNEX_STATE.md ve PROGRESS_LOG.md güncellenmiş; kod, API, UI, DB, migration, tenant, rol ve
permission değişmemiş.

## Durum
done (AI1 onayı, 2026-10-06). Dokümantasyon ve gereksinim normalizasyonu — kod değişmedi,
API/UI/migration/schema oluşturulmadı, yeni tenant/rol/permission eklenmedi, yeni iş gereksinimi
icat edilmedi.

## Amaç
DISCOVERY.md ve SRS.md'yi DEC-0017/BRIF2/tamamlanan EPIC-005 kararlarıyla (TASK-029.01/029.02
`done`) uyumlu hâle getirmek: mevcut kararları ana canonical bölümlere taşımak, eski hükümleri
supersede olarak işaretlemek, açık/TBD maddeleri tek biçimde görünür kılmak. Yeni iş kuralı icat
edilmedi.

## Teslim

### docs/requirements/DISCOVERY.md — v1.3 → v1.4
- Başlık tablosu: sürüm 1.4, DEC-0017 referansı.
- §21.1.1/§21.1.2: DEC-0017 D-01 (iki bounded context) ve D-09 (Kırım Tesisi operasyon merkezi)
  kısa özeti ana bölüme taşındı; tam ayrıntı §27'de **silinmeden** korundu, çapraz pointer notları
  eklendi (§27.1, §27.9).
- §22.6 (yeni): D-02 (lab karma yaşam döngüsü), D-03/D-03a (ortak lab çoklu tenant üyeliği), D-08
  (vardiya = boyut), D-14 (data-plane yerleşimi) ana bölüme taşındı; §27.2/§27.3/§27.10/§27.12'ye
  pointer notu eklendi.
- §13.2, §14, §16.2, §18: Wave 5 implementation'ıyla (DEC-0015, Q-W501–Q-W515) kapanmış eski
  TBD'lerin **tam altına** "Durum: RESOLVED" notu eklendi — eski TBD metni silinmedi, yalnız
  tamamlandı.
- Yeni **§28 "Açık Soru ve TBD Durum Sınıflandırması"**: Q-001–Q-024, TBD-W5-00x, OQ-W5-00x ve
  DEC-0017 açık statüleri (D-04, D-05 teknik, D-11, D-12 formül, D-13, D-18, D-20) tek bir durum
  sözlüğüyle (`RESOLVED`/`PARTIALLY_RESOLVED`/`TBD`/`EXTERNAL_VALIDATION_REQUIRED`/
  `OUT_OF_SCOPE`) sınıflandırıldı. Wave 2/3 ve diğer gelecek adayları (§11.3/§11.4/§21.2/§21.3/§23)
  tek satırda `OUT_OF_SCOPE` olarak işaretlendi.

### docs/requirements/SRS.md — v1.3 → v1.4
- Başlık tablosu: sürüm 1.4, tarih 2026-10-06, durum notu.
- §9.2: FEAT-026, FEAT-027, FEAT-028, FEAT-029 ve FEAT-024 genişlemesi her biri açıkça
  **`(Durum: TASLAK)`** olarak işaretlendi + bir üst not: hiçbiri PO tarafından onaylanmış kesin
  FR/BR değildir, implementation task'ı `ready` yapmaz. TASK-029.01/029.02'nin `done` olmasının bu
  taslak statüsünü değiştirmediği not edildi (bu iki task pure domain sözleşmesi teslim etti, iş
  kuralı/FR üretmedi).
- Yeni **§9.3 "Ana Ayrımlar — Görünürlük Listesi"**: 9 ayrımın hepsi tek tabloda — MOSEDAŞ enerji
  emri ↔ Kırım Tesisi iç üretim emri, vardiyanın zaman/sorumluluk boyutu, operasyon merkezi
  kapsamı, ortak laboratuvar çoklu tenant üyeliği, tenant data-plane yerleşimi, Netsis'in geçici
  kantar SoR'u, SCADA ana sayaç kaynağı + manuel istisna, ölçülen/tahmini/geçici miktar ayrımı, G6
  üst kalori girdisi → G7 alt kalori sonucu.
- Yeni **§9.4 "Açık Kalacak Maddeler"**: Netsis sözleşmesi, kepçe cihazı, kalori/kül formülü, kalite
  limitleri, nihai paçal ölçümü, rapor kolonları/Jasper, tarihsel migration kapsamı, gerçek SQL
  Server provider/preflight — sekizi de görünür, kanıt gelmeden kapatılmayacak.
- §12: `OQ-W5-001`–`OQ-W5-009` DEC-0015 ile `RESOLVED` notu; `OQ-W5-010` (modül adı) hâlâ `TBD`.

### docs/domain/DOMAIN_MODEL.md — yalnız doğrulanmış domain etkisi
- §9 Known Gaps'e `apps/api/src/operations/domain/` (TASK-029.01/029.02) için tek paragraf not
  eklendi: pure TypeScript, NestJS'e bağlı değil, tablo/migration yok, hangi entity/kural setinin
  mevcut olduğu özetlendi. Hiçbir spekülatif/doğrulanmamış domain etkisi eklenmedi.

### backlog/EPIC-005-…md, backlog/TASK-029-00-…md
- İncelendi; task planı, kapsam ve bağımlılıklar **zaten güncel** bulundu (TASK-029.01/029.02
  `done` olarak işaretli, 029.03+ bağımlılıkları doğru). Değişiklik yapılmadı, yalnız doğrulama
  notu eklendi.

### docs/opendevcon/METNEX_STATE.md
- `active_epics` listesine `EPIC-005` eklendi (eksikti).
- `updated_at` 2026-10-06'ya güncellendi.
- TASK-029.14 teslim özeti eklendi.

### docs/opendevcon/PROGRESS_LOG.md
- Append-only TASK-029.14 kaydı eklendi.

### docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md
- İncelendi; mevcut DEC-0017 çapraz referansı (2026-09-28 girdisi) hâlâ doğru ve güncel bulundu.
  **Değiştirilmedi** — "gerekirse" koşulu bu dosya için gerçekleşmedi.

## Kesin sınırlar (uygulandı)
Kod değiştirilmedi; API/UI/migration/schema oluşturulmadı; yeni tenant/rol/permission eklenmedi;
yeni iş gereksinimi icat edilmedi; açık kararlar kapatılmış gibi yazılmadı (hepsi `TBD`/
`EXTERNAL_VALIDATION_REQUIRED`/`OUT_OF_SCOPE` olarak kaldı); gerçek DB/SQL Server/Docker/production
credential kullanılmadı; git commit/push yapılmadı.

## Kabul kriterleri karşılama
- Discovery sürümü 1.4. ✓
- SRS sürümü 1.4. ✓
- DEC-0017 kararları ana bölümlerle tutarlı (§21.1, §22.6). ✓
- Eski kararlar silinmemiş, supersede/pointer izleri korunmuş (§27.1/.2/.3/.9/.10/.12'de "v1.4:
  ... taşındı" notları). ✓
- Açık TBD/harici doğrulama listesi tekilleştirilmiş (Discovery §28, SRS §9.4). ✓
- FEAT-026–029 statüsü açıkça `(Durum: TASLAK)` belirtilmiş. ✓
- EPIC-005 ve task bağımlılıkları güncel (incelendi, değişiklik gerekmedi). ✓
- METNEX_STATE.md ve PROGRESS_LOG.md güncel. ✓
- Teslim durumu `review`. ✓
