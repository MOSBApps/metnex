---
id: TASK-023.1
title: BOTC kaynak şema envanteri ve PostgreSQL migration mapping
status: ready
srs_refs: [FEAT-008, FR-014]
parent_epic: EPIC-002
updated_at: 2026-09-17
---

# TASK-023.1: BOTC Kaynak Şema Envanteri ve PostgreSQL Migration Mapping

## Amaç

`../BOTC` uygulamasının SQL Server üzerindeki `BOT_APP` ve seçilmiş operasyon
veritabanlarını, METNEX PostgreSQL hedef modeli için kanıtlanabilir bir kaynak
envanteri ve mapping dokümanına dönüştürmek.

Bu task analiz ve tasarım task'ıdır. Production kodu, migration SQL'i ve canlı
veritabanı verisi üzerinde değişiklik yapılmayacaktır.

## Kapsam

- BOTC `DISCOVERY.md`, entity/repository/DbContext/config dosyaları ve mevcut
  SQL sorgularını incelemek.
- `BOT_APP` içindeki kullanıcı, rol/permission, tenant/işletme ilişkisi ve
  seçilmiş operasyon tablolarını tablo/kolon/ilişki düzeyinde envanterlemek.
- Vardiya/arşiv, SCADA/DMS analiz, saatlik tüketim ve işletme raporu adaylarını
  ayrı ayrı değerlendirmek.
- Her kaynak tablo/alan için PostgreSQL hedefi, dönüşüm kuralı, kapsamı ve
  migration önceliğini belirtmek.
- MİP root tenant agregasyonu ile MOSB, MOSEDAŞ ve MOSBİO tenant scope
  kurallarını mapping üzerinde açıkça göstermek.
- SCADA/DMS kaynaklarının PostgreSQL'e taşınmayacağını; SQL Server read-only
  adapter üzerinden okunacağını ve yazma işlemi yapılamayacağını belgelemek.
- Bakım/Arıza (Wave 2) ve DÖF (Wave 3) tablolarını kapsam dışı olarak işaretlemek.
- Hassas alanları (parola/hash, secret, bağlantı bilgisi) veri taşıma kapsamına
  almamak veya güvenli reset/yeniden üretim kuralı tanımlamak.

## Kapsam dışı

- NestJS, Next.js, Drizzle veya Jasper production implementasyonu.
- SQL Server üzerinde INSERT/UPDATE/DELETE.
- SCADA/DMS kaynaklarına yazma yeteneği.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF migration'ı.
- Gerçek kullanıcı parolalarının veya secret değerlerinin rapora yazılması.

## Beklenen teslimatlar

1. `docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md`
   - kaynak database/table/entity envanteri;
   - kolon tipleri, nullable/PK/FK, indeks ve yaklaşık veri hacmi (biliniyorsa);
   - kaynak kodu ve/veya sorgu referansı.
2. `docs/migration/BOTC_TO_METNEX_MAPPING.md`
   - kaynak → hedef tablo/alan/service eşlemesi;
   - dönüşüm, default, deduplication ve idempotency kuralları;
   - tenant, root aggregate ve permission kapsamı;
   - taşınacak / adapter ile okunacak / kapsam dışı kararları.
3. `docs/migration/BOTC_MIGRATION_GAPS.md`
   - çözülemeyen alanlar ve varsayımlar;
   - cevaplanması gereken sorular;
   - migration öncesi gerekli read-only erişim ve doğrulama kanıtları.
4. Gerekliyse Discovery’de yalnızca kanıtlanmış bulgular için düzeltme önerisi.

## Kabul kriterleri

| Kriter | Kanıt |
|---|---|
| `BOT_APP` ve ilgili kaynak DB’ler tablo/entity düzeyinde listelenmiş | Envanter dokümanı + kaynak referansları |
| Her migration adayı için hedef sahiplik ve karar verilmiş | Mapping tablosu |
| MİP root aggregate ve child tenant scope ayrımı tanımlı | Scope/mapping bölümü + örnekler |
| SCADA/DMS read-only adapter sınırı açık | Mapping ve gap dokümanı |
| Wave 2 ve Wave 3 kapsam dışı işaretli | Her iki dokümanda açık kayıt |
| Secret/parola taşıma riski ele alınmış | Güvenli veri taşıma bölümü |
| Bilinmeyenler varsayım olarak gizlenmemiş | Gaps dokümanı |
| Kod/veritabanı değişikliği yapılmamış | `git status` ve teslim özeti |

## Kalite kapısı

- `./scripts/check.sh --skip-docker` çalıştırılabilir; kod değişikliği olmadığı
  için sonuç raporlanır, Docker kapısı kullanıcı kararıyla atlanır.
- Dokümanlarda gerçek secret, parola, connection string veya kişisel veri yer
  almayacaktır.
- `docs/opendevcon/PROGRESS_LOG.md` append-only güncellenecek ve
  `METNEX_STATE.md` task durumunu yansıtacaktır.

## AI2 talimatı

Önce kaynak kod ve dokümanlardan kanıt topla. SQL Server’a erişim yoksa bunu
blokaj gibi gizleme; eksik bilgiyi `BOTC_MIGRATION_GAPS.md` içinde açıkça belirt
ve örnek/varsayımsal şema üretme. Bu task tamamlanmadan migration implementasyon
task’ı başlatılmayacaktır.
