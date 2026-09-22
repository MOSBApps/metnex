---
id: TASK-027.27
title: Data-Plane Karar Kapıları ve Registry Hardening Karar Paketi
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Vardiya arşiv read API" placeholder'ıydı. AI1'in talimatıyla kapsam **data-plane karar kapıları
> ve registry hardening karar paketi** olarak yeniden tanımlandı; arşiv read API bu task'ta **yapılmadı**. Orijinal placeholder en altta tarihi kayıt olarak korunmuştur.
> Talimat dosya adı `TASK-027-27-data-plane-decision-gates.md` idi; aynı ID için ikinci dosya açılmadı, mevcut dosya güncellendi.

## AI2 Teslim Raporu (2026-09-21)

**Sonuç: karar paketi + remediation planı; hiçbir kod/altyapı/schema/DB değişikliği yok; ARCHIVED/FAILED davranışı kodda değiştirilmedi.**

Teslimatlar: `docs/migration/METNEX_DATA_PLANE_DECISION_GATE_CLOSURE_PACKAGE.md` (12 kapı için matris + AI2 önerisi + risk + geri dönüş + dosya listesi + **boş "AI1/PO KARARI" formu §14**),
`docs/migration/METNEX_DATA_PLANE_REGISTRY_HARDENING_PLAN.md` (R1–R10, her biri: kök neden, güvenlik etkisi, veri kaybı riski, düzeltme, test senaryosu, sonraki task, rollback),
`BOTC_MIGRATION_OPEN_QUESTIONS.md` (append-only), `docs/domain/DB_META.md` (yalnızca referans notu). DEC-0010/0011 **değiştirilmedi** (amendment yalnızca taslak, §8.3).

**Yeni bulgular:**
- **N1:** DEC-0010 ∧ DEC-0011 Q-V11'i büyük ölçüde zaten yazılı kılıyor (iş tabloları customer-root schema'sında, runtime `pgSchema`, `search_path` yasak); A seçeneği yazılı kararlara aykırı — açık olan uygulama zamanlaması/Phase kapsamı.
- **D9 / Q-DP08:** `pipeline.yml` `node apps/api/dist/migrate.js` çağırıyor; `src`'de kaynak, `dist`'te dosya yok, `Dockerfile` üretmiyor (`[DOĞRULANAMADI]`, pipeline çalıştırılmadı) → Q-DP02'nin "pipeline adımı" seçeneği bugün dayanaksız.
- **N3/D7 genişlemesi:** sabit varsayılan bağlantı bilgisi `drizzle.config.ts` ve `scripts/check-db.js`'de (değer kopyalanmadı).
- **D10:** `PROVISIONING`'de takılma. **DEC çelişkileri:** Phase 5-9 vs 5-7, fan-out Phase 5 vs 7, Prisma/iki-ORM ve RLS gerekçesi eski, `demo.ts` referansı eski, Phase 7-9 belgesiz.

**AI2 önerileri (karar AI1/PO'da):** Q-V11 C · Q-DP01 ayrı sürüm geçidi (`resolve()` sözleşmesi korunur) · Q-DP02 ayrı migration job + pipeline ince adım + manuel onay, startup yok, runner yetkisi `isSystemAdmin`/PLATFORM_ROOT değil ·
Q-DP03 explicit reactivation · Q-DP04 platform operasyonu, önce manuel CLI · Q-DP05 H1 + DB hijyeni · Q-DP06 Phase 5-9 tablosu + DEC amendment taslağı · Q-DP07 production'da fallback reddi ·
Q-V20 salt-okuma preflight + BLOCKED · Q-V21 `public` mapping tablosu · Q-V25 `externalKey`→`tenantId` onaylı mapping · Q-ID01 düzleme göre ayrım. Tüm sayısal parametreler ve retention süreleri **"PO kararı gerekli"** bırakıldı.

**Kapatılan sorular: yok.** Açık (AI1/PO kararı bekliyor): Q-V11, Q-V20, Q-V21, Q-V25, Q-ID01, Q-DP01–Q-DP07, yeni Q-DP08.
**Yapılmayanlar:** `pgSchema()`/dinamik schema, runner, migration, schema, seed, tenant/registry kaydı, DB role/RLS, gerçek PostgreSQL/SQL Server bağlantısı, `apps/` değişikliği, arşiv read API, Wave 2/3, Docker, git commit/push.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (36 suite / 333 test; yalnızca dokümantasyon değişti).

### Durum
`status: done` — karar kapıları ve registry hardening paketi AI1 tarafından onaylanmıştır.
Uygulama kararları ayrıca AI1/PO onayına bağlıdır.

## AI1 Onay — 2026-09-21

TASK-027.27 teslimatı yeniden tanımlanan data-plane karar kapıları ve registry hardening
paketi kapsamına uygun bulunarak onaylandı ve `done` olarak kapatıldı. Q-V11'in DEC-0010/
DEC-0011 ile ilişkisi, kaynaksız `dist/migrate.js` pipeline çağrısı (D9/Q-DP08),
PROVISIONING'de takılma (D10), sabit bağlantı fallback'leri ve DEC faz çelişkileri doğru
biçimde kaydedildi. Registry hardening R1–R10 planı kabul edildi.

Hiçbir karar kapısı kapanmış sayılmamıştır: Q-V11, Q-V20, Q-V21, Q-V25, Q-ID01,
Q-DP01–Q-DP08 açık kalmıştır. `pgSchema()`, runner, schema, migration, seed, tenant/
registry kaydı, DB role/RLS, API ve archive read API oluşturulmamıştır. ARCHIVED/FAILED
mevcut davranışı değiştirilmemiştir.

---

# TASK-027.27: Vardiya arşiv read API

## Amaç

Arşiv için tenant/permission kontrollü API oluştur.

## Wave ve bağımlılık

TASK-027.26

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
