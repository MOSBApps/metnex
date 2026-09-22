---
id: TASK-027.12-R1
title: Wave 1 identity karar kapilarinin kapatilmasi
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-17
---

## AI2 Teslim Raporu (2026-09-17)

### Amaç

TASK-027.12 (User Migration Mapping Implementation) öncesindeki 6 karar kapısını (Q-P01, Q-M03,
Q-M04, Q-M06, Q-A03, Q-PW01) kapatmak ve onaylı kararları ilgili migration dokümanlarına işlemek.
**Implementation yapılmamıştır** — bu task yalnızca karar kapanışını kayıt altına alır.

### Yapılan işlemler

`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye append-only bir "Karar Kapanışları — Wave 1
Identity (TASK-027.12-R1)" bölümü eklendi — her 6 kapı için karar/gerekçe/etkilenen implementation
task'ları/kalan riskler/rollback ihtiyacı kaydedildi. Sorunun orijinal metni **değiştirilmedi**.

Kararlar aşağıdaki dokümanlara işlendi (kanıt tabloları/karşılaştırmalar **kanıt kaydı olarak
korundu**, yalnızca sonuç/karar işaretlendi):

- `docs/migration/BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §2 (Q-P01: Seçenek A —
  `tenantRoles`), §4 (Q-M04: Seçenek B — ortak rol şablonu).
- `docs/migration/BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2.2 (Q-A03/Q-PW01: `PasswordHash`
  taşınmaz, zorunlu sıfırlama), §2.4 (Q-M06: `Sirket` tenant kaynağı olarak kapandı), §3
  (Q-P01/Q-M03: `tenantRoles` + kesin permission taslağı), §4 (Q-M04: ortak şablon), §6 (Q-M06:
  ayrı onaylı mapping tablosu, bilinen tenant'lar MOSB/MOSEDAŞ/MOSBİO).
- `docs/migration/BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §4 (Strateji 1 seçildi,
  Strateji 3 reddedildi), §6 (Q-A03/Q-PW01 kapandı — zorunlu sıfırlama + admin-driven kanal).
- `docs/migration/METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md` §2 (hedef tablo
  eşlemeleri sabitlendi), §4.1 (`targetEntityType` artık çözülebilir), §9 (Q-M06 kapandı, bilinen
  tenant'lar + `tenantMembershipStatus`), §10 (`passwordStrategy = RESET_REQUIRED` seçildi), §12
  (Role modeli/UserPermission dönüşümü kapandı).
- `backlog/TASK-027-12-user-migration-mapping-implementation.md`'ye bu kapanışı belirten bir
  bölüm eklendi (blocker raporu korunarak).

### Kesinlikle yapılmayanlar (görev talimatına uygun)

User migration implementation, PostgreSQL schema/migration/seed değişikliği, Drizzle migration
üretimi, SQL Server bağlantısı, gerçek kullanıcı verisi okuma/kopyalama, gerçek parola/hash/salt/
token/secret yazma, `authSessions` kaydı oluşturma, Wave 2/Wave 3 çalışması, git commit/push —
**hiçbiri yapılmadı**.

### Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (yalnızca dokümantasyon
değişikliği, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yok).

### Kalan riskler / sonraki bağımlılık

- Q-P02 (`VisibilitySettings`) ve Q-ID01 (staging tablosu şema/retention) bu R1'in kapsamında
  **değildir**, hâlâ açıktır.
- Q-T01/Q-SC01'in lokasyon-özel kısımları (`KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL`'ın hangi
  tenant'a ait olduğu) Q-M06'nın genel mekanizma kararıyla **tam kapanmamıştır** — bu belirsiz
  lokasyonlara bağlı kullanıcılar `tenantMembershipStatus = UNRESOLVED` durumunda kalabilir.
- TASK-027.12'nin implementation'ı, AI1'in bu R1'i ayrıca onaylamasından sonra başlatılabilir.
- Gerçek secret/parola/hash/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

### Durum

`status: done` — AI1/Product Owner incelemesiyle 6 karar kapısı ve bunların migration dokümanlarına
işlenmesi onaylandı. Q-P02, Q-ID01 ve lokasyon-özel Q-T01/Q-SC01 kayıtları kapsam dışı açıklar olarak
korundu. TASK-027.12 implementation aşamasına geçebilir; canlı apply ve gerçek veri erişimi ayrıca
onay gerektirir.

## AI1 Onayı (2026-09-17)

R1 teslimi onaylandı. Kararların append-only açık soru kaydına ve ilgili migration dokümanlarına
işlendiği, kanıt tablolarının korunduğu ve hiçbir implementation/şema/migration/seed/SQL Server
bağlantısı yapılmadığı doğrulandı. `./scripts/check.sh --skip-docker` PASS kabul edildi.
