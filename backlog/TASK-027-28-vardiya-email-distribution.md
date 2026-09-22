---
id: TASK-027.28
title: Migration Entrypoint ve Pipeline Provenance Karar Paketi
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Vardiya email distribution" placeholder'ıydı. AI1'in talimatıyla kapsam **migration entrypoint ve pipeline provenance karar paketi**
> olarak yeniden tanımlandı; **email dağıtımı bu task'ta yapılmadı** (Q-V05/Q-V07 açık). Orijinal placeholder en altta tarihi kayıt olarak korunmuştur.
> Talimat dosya adı `TASK-027-28-migration-entrypoint-pipeline-provenance.md` idi; aynı ID için ikinci dosya açılmadı, mevcut dosya güncellendi.

## AI2 Teslim Raporu (2026-09-21)

**Sonuç: kanıt analizi + karar paketleri; pipeline, Dockerfile, production kodu, migration mekanizması, runbook, DEC değiştirilmedi; hiçbir migration çalıştırılmadı, gerçek DB'ye bağlanılmadı.**

Teslimatlar: `docs/migration/METNEX_MIGRATION_ENTRYPOINT_PROVENANCE.md` (10 mekanizmalık envanter + provenance analizi), `docs/migration/METNEX_PIPELINE_MIGRATION_TRIGGER_DECISION_PACKAGE.md`
(6 tetikleme seçeneği × 9 kriter, control/data-plane ayrımı, hedef akış değerlendirmesi), `docs/migration/METNEX_MIGRATION_CONNECTION_SECURITY_BOUNDARY.md` (bağlantı envanteri, S1–S6, P-1…P-10 politika taslağı),
`BOTC_MIGRATION_OPEN_QUESTIONS.md` (append-only). Karar formları boş.

**Provenance sonucu (kanıtlı):** `dist/migrate.js` — kaynak yok, `dist`'te yok, Dockerfile üretmiyor, image'da yok, çalıştırılamaz. **Prisma kalıntısı olduğuna dair kanıt yok:** runbook §7 onu `packages/db/migrations/*.sql` +
`platform._migration_log` kullanan özel bir SQL çalıştırıcı olarak anlatıyor; `packages/` dizini ve tablo mevcut değil, üç dosya (`extract-db-meta.sh`, `recreate-db-with-icu.sh`, `DB-METADATA-TEMPLATE.md`) aynı eski düzene atıf yapıyor.
Dönem `[DOĞRULANAMADI]` (depoda hiç commit yok). **Pipeline bugün:** `set -euo pipefail` altında migration satırı başarısız olup deploy'un **durması** beklenir; çalıştırma/run geçmişi `[DOĞRULANAMADI]`.
**TASK-027.27 R8 düzeltmesi:** pipeline yolunda sessiz şema gerilemesi oluşmaz (deploy durur); yalnızca pipeline dışı elle deploy'da geçerli.

**Diğer bulgular:** programatik Drizzle migrator zaten runtime dependency'de ve drizzle-kit ile **aynı** takip tablosunu (`drizzle.__drizzle_migrations`) kullanıyor; `pnpm`/`scripts/` image'da olmadığından `db:migrate` script'i image'da kullanılamaz;
`drizzle-kit` ikilisinin image'da olması `[DOĞRULANAMADI]`; **P6** pipeline `concurrency` `cancel-in-progress: true` (çalışan migration iptal edilebilir); CI'da migration artifact doğrulaması yok; `dev.sh` her çalıştırmada `db:generate`; runbook/`DB-METADATA-TEMPLATE.md` eski;
**S1–S6** sabit bağlantı dizesi iki dosyada, `db.service.ts`'te `DATABASE_URL` eksikse `pg` varsayılanlarına düşme ihtimali, pipeline'da geniş `source` + argv genişletmesi, `.dockerignore` yok, ortak DB kimliği.

**AI2 önerileri (karar AI1/PO'da):** startup migration yok; control-plane = ayrı pipeline migration işi + onay kapısı + programatik migrator giriş noktası (`src/migrate.ts` → `dist/migrate.js`, **oluşturulmadı**); data-plane = ayrı fan-out runner, elle/onaylı;
acil = manuel CLI; runner kimliği migration'a özel DB kimliği (`isSystemAdmin`/PLATFORM_ROOT değil); production fallback yasağı + fail-fast, geliştirmede loopback+non-production, kaynaktaki sabit dize kaldırılsın;
migration işi için `cancel-in-progress: false` env başına grup. Sayısal parametreler **PO kararı gerekli**.

**Kapatılan sorular: yok.** Açık: Q-DP02, Q-DP07, Q-DP08 (+ önceki tüm açık sorular).
**Yapılmayanlar:** migration çalıştırma, gerçek DB/SQL Server bağlantısı, `dist/migrate.js` oluşturma, pipeline/Dockerfile/kod/runbook değişikliği, yeni migration komutu, pgSchema/runner, tenant/schema/mapping/seed, email dağıtımı, Wave 2/3, git commit/push.
Gerçek connection string/secret hiçbir dosyaya yazılmadı.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (36 suite / 333 test; yalnızca dokümantasyon değişti).

### Durum
`status: done` — migration entrypoint/provenance ve bağlantı güvenliği karar paketleri
AI1 tarafından onaylanmıştır. Uygulama kararları ayrıca AI1/PO onayına bağlıdır.

## AI1 Onay — 2026-09-21

TASK-027.28 teslimatı yeniden tanımlanan migration entrypoint ve pipeline provenance
paketi kapsamına uygun bulunarak onaylandı ve `done` olarak kapatıldı. `dist/migrate.js`
provenance analizi, pipeline'daki kaynaksız çağrı, P6 `cancel-in-progress` riski,
CI artifact doğrulaması eksikliği, `.env`/argv secret yüzeyi, `.dockerignore` eksikliği
ve ortak DB kimliği riskleri kabul edildi.

Q-DP02, Q-DP07 ve Q-DP08 açık kalmıştır; öneriler uygulanmamıştır. Pipeline, Dockerfile,
production kodu, migration entrypoint'i, bağlantı politikası, DB, email dağıtımı ve
archive read API değiştirilmemiştir. Wave 2 ve Wave 3 kapsam dışıdır.

---

# TASK-027.28: Vardiya email distribution

## Amaç

Vardiya rapor dağıtımını notification adapter ile uygula.

## Wave ve bağımlılık

TASK-027.24

## Kapsam kuralları

- Discovery ve SRS tenant, permission ve Metnex kararlarına uy.
- Mevcut modül sınırlarını koru; yeni framework oluşturma.
- Tenant scope, audit, güvenlik ve idempotency etkilerini ele al.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.

## Kabul kriterleri

- Amaç ve bağımlılıklar kanıtla karşılanmış olmalı.
- Tenant/permission/security etkileri test veya dokümanla doğrulanmalı.
- Hata, empty state, audit ve tekrar çalıştırma davranışı tanımlı olmalı.
- İlgili domain/runbook/decision dokümanları güncellenmeli.
- ./scripts/check.sh --skip-docker sonucu raporlanmalı.
- Gerçek secret, parola veya connection string rapora yazılmamalı.
- Git commit/push yapılmamalı.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
