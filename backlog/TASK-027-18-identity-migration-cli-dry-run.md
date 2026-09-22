---
id: TASK-027.18
title: Identity Migration CLI Dry-Run
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

> **Başlık/kapsam notu (2026-09-18):** Bu dosya, EPIC-004'ün ilk toplu backlog üretiminde
> `TASK-027.18 — Identity migration CLI dry run` (status: `planned`) olarak oluşturulmuştu ve hiç
> başlatılmamıştı. AI1, aynı `TASK-027.18` kimliğini yakın bir kapsamla, 13 somut kapsam maddesi
> (CLI 8-aşamalı çalışma sırası, exit code sözleşmesi, sentetik fixture senaryoları, determinism
> kanıtı) ile yeniden görevlendirdi. Orijinal kapsam hiç uygulanmadığı için çakışma/veri kaybı
> riski yoktur.

## AI2 Teslim Raporu — Identity Migration CLI Dry-Run (2026-09-18)

### Amaç

TASK-027.12–027.17 ile oluşturulan identity migration motorunu güvenli ve tekrarlanabilir bir
dry-run CLI akışıyla çalıştırmak — yalnızca sentetik/in-memory fixture, gerçek SQL Server/
PostgreSQL bağlantısı yapısal olarak imkânsız (kod yolunda `--apply` yok).

### Teslimat

`apps/api/src/migration/botc-identity/cli/` (yeni dizin):

| Dosya | Sorumluluk |
|---|---|
| `dry-run-cli.ts` | Saf, test edilebilir çekirdek: `runIdentityMigrationDryRun()` — 8 aşamalı akış (input hijyeni → source/tenant validation → permission/tenant coverage → motor dry-run → rapor → exit code) |
| `dry-run-cli-entry.ts` | Gerçek çalıştırılabilir giriş noktası — argv parse, dosya I/O, exit code; `nest build` ile derlenip `node dist/...` ile çalıştırılır (yeni bir build aracı/bağımlılık eklenmedi) |
| `dry-run-cli.spec.ts` (17 test), `dry-run-cli-entry.spec.ts` (8 test) | |
| `fixtures/sample-dry-run-input.json` | 6 senaryo birlikte (başarılı/unresolved-tenant/unmapped-permission/duplicate-user/admin-assigned/failed-retry) — exit 0 |
| `fixtures/sample-dry-run-input-conflict.json` | conflict-tenant + orphan-mapping — exit 1, motor hiç çalışmaz |

`apps/api/package.json`'a `migrate:identity:dry-run` script'i eklendi. `password-boundary.ts`'e
küçük bir allowlist girdisi eklendi (`adminAssignedPasswordLegacyIds` — CLI girdi hijyeni
taramasının kendi meşru alan adını yanlış pozitif olarak işaretlemesini önlemek için).
`docs/migration/METNEX_IDENTITY_MIGRATION_CLI_DRY_RUN.md` (yeni) — tam kullanım/sözleşme/exit-code
dokümanı.

`migration-run.service.ts`, `role-template.service.ts`, `permission-mapping.ts`,
`tenant-mapping.ts`, `session-boundary.ts` — **hiçbiri değiştirilmedi**.

### CLI Komutu ve Kullanım Örneği

```sh
cd apps/api && pnpm build
node dist/migration/botc-identity/cli/dry-run-cli-entry.js \
  --input src/migration/botc-identity/cli/fixtures/sample-dry-run-input.json \
  --run-id my-run-1 --output /tmp/report.json
```

**Gerçekten derlenip gerçek bir process olarak çalıştırıldı** (varsayım değil): başarılı/karma
fixture → exit 0; conflict fixture → exit 1; argümansız çağrı → exit 2. Üçü de bu ortamda fiilen
doğrulandı.

### Exit Code Matrisi

| Kod | Anlam |
|---|---|
| `0` | Fatal hata yok, dry-run tamamlandı |
| `1` | Fatal validation veya güvenlik ihlali var (conflict tenant mapping, veya beklenmedik credential/session alanı) |
| `2` | Geçersiz CLI/input kullanımı (eksik `--input`, dosya yok, geçersiz JSON, zorunlu alan eksik) |

### Fatal/Conflict/Unmapped Davranışı

- Fatal preflight (örn. conflict tenant mapping) → **motor hiç çağrılmaz**, tüm motor-bağımlı
  sayılar sıfır kalır, ilgili kullanıcı `UNRESOLVED`, hiçbir membership/erişim üretilmez.
- Unmapped permission → `RECOVERABLE_UNMAPPED_PERMISSION`, fatal değil, dry-run devam eder, yeni
  kod icat edilmez, role template'e erişim kodu eklenmez.

### Determinism Kanıtı

Aynı girdi + aynı `migrationRunId` + sabit `now()` → birebir aynı rapor. Farklı `migrationRunId`
ile iki ayrı çalıştırma → `migrationRunId`/`generatedAt` hariç birebir aynı içerik (motorun iç
UUID üretimi rapora hiç yansımaz — rapor yalnızca sayım/özet taşır). `DRY_RUN`, verilen
`stagingStore`/`targetState`'e hiçbir zaman yazmaz.

### Sentetik Fixture Senaryoları (görev kapsam madde 12)

8 senaryonun tamamı (başarılı, unresolved-tenant, conflict-tenant, unmapped-permission,
orphan-mapping, duplicate-kullanıcı, admin-assigned, failed/retry) 2 fixture'a dağıtılarak
kapsandı — bir `FATAL` issue tüm dry-run'ı blokladığı için (kapsam madde 4), conflict/orphan
senaryosu **motor çalıştırmadan** göstermek üzere ayrı bir fixture'da tutuldu; bu yapısal bir
kısıttır, eksiklik değildir (detay: `METNEX_IDENTITY_MIGRATION_CLI_DRY_RUN.md` §5).

### Kesinlikle yapılmayanlar (görev talimatına uygun)

Gerçek SQL Server bağlantısı, gerçek BOTC verisi, gerçek PostgreSQL apply, `drizzle-kit`
migration, fiziksel `migration_staging_identity` tablosu, Q-ID01 kararı, gerçek parola/hash/salt/
token/secret, auth session/cookie üretimi, self-servis email verification/reset, yeni tenant/
permission kodu üretimi, Q-T01/Q-S03 kararı, Wave 2/Wave 3 kodu, Docker çalıştırma, git
commit/push — **hiçbiri yapılmadı**.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **177/177 test PASS** (18
  suite — önceki 155/155'ten; TASK-027.12–17'nin testlerinden hiçbiri bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### Kalan riskler / sonraki bağımlılık

- CLI hiçbir kalıcı state üretmez — her çalıştırma bağımsızdır; gerçek bir kalıcı pipeline için
  Q-ID01'in çözülmesi gerekir, bu task Q-ID01'i kapatmadı.
- Q-T01, Q-S03, Q-P02 hâlâ açık/kapsam dışı.
- Gerçek SQL Server adapter'ı bağlanmadan bu CLI gerçek BOTC verisiyle çalıştırılamaz.
- Production kodu yalnızca yeni dosyalardan oluşuyor, tek istisna `password-boundary.ts`'teki
  küçük allowlist eklemesi.

### Durum (2026-09-18 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle identity migration CLI dry-run teslimi onaylandı
(bkz. aşağıdaki "AI1 Final Onayı" bölümü).

## AI1 Final Onayı (2026-09-18)

TASK-027.18 teslimi onaylandı ve `done` olarak kapatıldı. Derlenmiş CLI process'iyle
exit code `0/1/2` doğrulandı; fatal preflight durumunda migration engine'in çağrılmadığı
ve CLI'da `--apply` yolu bulunmadığı teyit edildi. Dry-run raporu deterministik ve
kalıcı state üretmiyor.

Gerçek SQL Server/PostgreSQL bağlantısı, apply, secret/parola ve gerçek BOTC verisi
kullanılmamıştır. `./scripts/check.sh --skip-docker` PASS ve 33 suite / 276 test kanıtı
kabul edildi.

---

# TASK-027.18 (orijinal): Identity migration CLI dry run

## Amaç

Idempotent dry-run CLI ve hata raporunu oluştur.

## Wave ve bağımlılık

TASK-027.10; TASK-027.15

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
