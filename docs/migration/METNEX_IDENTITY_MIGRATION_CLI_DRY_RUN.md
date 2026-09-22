# Metnex Identity Migration — CLI Dry-Run

> **Durum: Implementation + kullanım dokümantasyonu.**
> Kaynak görev: `backlog/TASK-027-18-...md` (id: `TASK-027.18`, EPIC-004, Wave 0/1, bağımlılık:
> TASK-027.12–027.17, TASK-027.10). Bu belge, identity migration motorunu
> (`apps/api/src/migration/botc-identity/`) güvenli ve tekrarlanabilir bir dry-run CLI akışıyla
> çalıştırmayı sağlayan `apps/api/src/migration/botc-identity/cli/` modülünü belgeler. **Bu CLI'da
> `--apply` seçeneği yoktur** — yalnızca `DRY_RUN` modu çalıştırılabilir, gerçek bir PostgreSQL/SQL
> Server bağlantısı yapısal olarak imkânsızdır (kod yolu hiç yoktur).

**Tarih:** 2026-09-18
**Hazırlayan:** AI2 (Engineering Executor)

---

## 1. Komut ve Kullanım Örneği

```sh
cd apps/api
pnpm build
node dist/migration/botc-identity/cli/dry-run-cli-entry.js \
  --input src/migration/botc-identity/cli/fixtures/sample-dry-run-input.json \
  --run-id my-run-1 \
  --output /tmp/dry-run-report.json
```

veya paket script'i ile:

```sh
pnpm --filter api migrate:identity:dry-run -- --input <fixture.json> [--run-id <id>] [--output <rapor.json>]
```

`--output` verilmezse rapor stdout'a JSON olarak yazılır. `--run-id` verilmezse `crypto.randomUUID()`
ile otomatik üretilir.

**Bu ortamda gerçekten çalıştırılıp doğrulandı** (varsayım değil): `pnpm build` ile derlendi,
`node dist/...` ile gerçek bir process olarak çalıştırıldı — hem başarılı/karma fixture (exit 0)
hem çakışma fixture'ı (exit 1) hem de argümansız kullanım (exit 2) gerçekten test edildi.

---

## 2. Giriş/Çıkış Sözleşmesi

### 2.1 Girdi (`--input` dosyası, JSON)

```ts
interface DryRunCliInput {
  source: BotcIdentitySourceSnapshot            // { users, roles, permissions, userPermissions }
  approvedTenantAssignmentTable: ApprovedTenantAssignmentEntry[] // { userLegacyId, tenantSlug }
  adminAssignedPasswordLegacyIds?: string[]      // opsiyonel
  simulateFailureLegacyIds?: string[]            // opsiyonel, yalnızca test/demo amaçlı
}
```

Girdi dosyası, yüklenir yüklenmez (motor hiç çağrılmadan) `scanForCredentialFields`/
`scanForSessionOrTokenFields` ile taranır — girdinin kendisi bile yanlışlıkla bir
`passwordHash`/`authSessions` benzeri alan taşıyorsa CLI **anında reddeder** (exit 1), motoru hiç
çalıştırmaz.

### 2.2 Çıktı (`DryRunCliReport`, JSON)

```ts
interface DryRunCliReport {
  migrationRunId: string
  generatedAt: string
  sourceRecordCounts: { users, roles, permissions, userPermissions, total }
  userResults: { toCreate, toUpdate, toSkip }
  roleTemplateResults: { toCreate }
  permissionResults: { mapped, unmapped }
  tenantResults: { assigned, unresolved, conflicts, orphanMappingRecords }
  passwordStrategySummary: { RESET_REQUIRED, ADMIN_ASSIGNED }
  credentialSessionBoundary: { violations, passed }
  issues: { fatal: MigrationIssue[], recoverable: MigrationIssue[], warning: MigrationIssue[] }
  pendingLocationCategories: string[]  // Q-T01/Q-S03 — statik referans, karar değil
  applyPerformed: false
  applyNote: string  // her zaman "dry-run modundadır, gerçek apply yapılmadı" açıklaması
}
```

---

## 3. Çalışma Sırası (8 Aşama, görev talimatına birebir uygun)

| # | Aşama | Fonksiyon |
|---|---|---|
| 1 | Input yükleme | `dry-run-cli-entry.ts` — dosya okuma + JSON parse + temel şekil kontrolü |
| 2 | Source snapshot validation | `validateSourceSnapshot()` (TASK-027.13) |
| 3 | Tenant mapping validation | Aynı çağrının tenant-özel kuralları (TASK-027.15) — boş/geçersiz slug, orphan mapping, çakışma |
| 4 | Permission coverage hesaplama | `computePermissionMappingCoverage()` (TASK-027.14) |
| 5 | Password/session boundary kontrolleri | `scanForCredentialFields`/`scanForSessionOrTokenFields` (TASK-027.16/027.17), girdinin kendisine uygulanır |
| 6 | Migration engine dry-run | `MigrationRunService.run({ mode: 'DRY_RUN' })` — **yalnızca** 2-5 aşamalarında **hiçbir FATAL yoksa** çalışır |
| 7 | Coverage ve dry-run raporu üretimi | `DryRunCliReport` birleştirmesi |
| 8 | Exit code belirleme | §4 |

**Kabul kriteri #4 doğrudan uygulanmıştır:** Aşama 2-3'te herhangi bir `FATAL` bulunursa, aşama 6
(motor) **hiç çağrılmaz** — rapor yalnızca statik coverage/validation verisinden üretilir, tüm
motor-bağımlı sayılar (`userResults`, `roleTemplateResults`, `tenantResults.assigned`) sıfır kalır.

---

## 4. Exit Code Matrisi

| Kod | Anlam | Örnek |
|---|---|---|
| `0` | Fatal hata yok, dry-run tamamlandı | `sample-dry-run-input.json` (yalnızca recoverable/warning sorunlar var) |
| `1` | Fatal validation **veya** güvenlik ihlali var | `sample-dry-run-input-conflict.json` (çakışan tenant mapping) — **veya** motor çıktısında beklenmedik bir credential/session alanı bulunursa (savunma amaçlı ikinci kontrol) |
| `2` | Geçersiz CLI/input kullanımı | `--input` eksik, dosya yok, geçersiz JSON, zorunlu alan eksik |

Bu üç kod da gerçek `node` process'i olarak çalıştırılıp doğrulandı (bkz. §1).

---

## 5. Sentetik Fixture'lar (görev kapsam madde 12)

| Dosya | Kapsadığı senaryolar |
|---|---|
| `cli/fixtures/sample-dry-run-input.json` | başarılı kullanıcı (`1`), unresolved tenant (`2`), unmapped permission (`4`), duplicate kullanıcı (`5`/`6`, aynı email), admin-assigned password (`7`), failed/retry (`8`, `simulateFailureLegacyIds` ile) — **hepsi tek bir dry-run raporunda birlikte** (exit 0, hiçbiri fatal değil) |
| `cli/fixtures/sample-dry-run-input-conflict.json` | conflict tenant mapping (`3`, iki farklı slug) + orphan mapping kaydı (`99`, kaynakta olmayan kullanıcı) — **fatal**, motor hiç çalışmaz (exit 1) |

İki fixture'ın ayrı tutulmasının nedeni: bir `FATAL` issue tüm dry-run'ı bloklar (kapsam madde 4),
bu yüzden "fatal + diğer 6 senaryo" tek bir fixture'da **birlikte motor çalıştırarak**
gösterilemez — bu yapısal bir kısıt, eksiklik değildir.

Gerçek BOTC kullanıcı/parola verisi hiçbir fixture'da yoktur — tüm değerler sentetiktir
(`success.user@example.com` gibi).

---

## 6. Determinism Kanıtı (görev kapsam madde 8)

- Aynı girdi + aynı `migrationRunId` + sabit `now()` → **birebir aynı** rapor (`dry-run-cli.spec.ts`,
  "determinism" grubu).
- Aynı girdi, **farklı** `migrationRunId`'lerle iki ayrı çalıştırma → `migrationRunId`/`generatedAt`
  hariç birebir aynı rapor içeriği — motorun her çalıştırmada ürettiği farklı iç `targetId`
  UUID'leri rapora hiç yansımaz (rapor yalnızca sayım/özet alanları taşır, ham UUID listesi değil).
- `DRY_RUN` modu, verilen `stagingStore`/`targetState`'e **hiçbir zaman** yazmaz — bu, CLI'ın her
  çalıştırmasının önceki bir çalıştırmadan etkilenmediğinin yapısal kanıtıdır.

---

## 7. Conflict / Unmapped Davranışı

- **Conflict:** `FATAL_CONFLICTING_TENANT_ASSIGNMENT` üretir, tüm dry-run'ı bloklar (motor
  çalışmaz), ilgili kullanıcı `UNRESOLVED` sayılır, **hiçbir membership/erişim üretilmez** —
  TASK-027.15-R1'in güvenlik düzeltmesi burada da geçerlidir (motor değiştirilmedi).
- **Unmapped permission:** `RECOVERABLE_UNMAPPED_PERMISSION` üretir (fatal değil, dry-run devam
  eder), **yeni bir kod icat edilmez**, ilgili `UserPermission` hiçbir role template'in
  `permissionCodes` listesine girmez.

---

## 8. Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → sonuç raporun sonunda
  belirtilmiştir.
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda belirtilmiştir.
- Gerçek build + gerçek `node` process çalıştırması (§1) — 3 exit code da fiilen doğrulandı.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

## 9. Kalan Riskler / Sonraki Bağımlılık

- Bu CLI hiçbir kalıcı state üretmez (her çalıştırma bağımsızdır) — gerçek bir "önceki çalıştırmayı
  hatırlayan" pipeline (staging tablosu tabanlı) için Q-ID01'in çözülmesi gerekir; bu task Q-ID01'i
  **kapatmadı**.
- Q-T01, Q-S03, Q-P02 hâlâ açık/kapsam dışı; `pendingLocationCategories` yalnızca statik bir
  referanstır, gerçek kullanıcı-lokasyon eşlemesi değildir.
- Gerçek SQL Server adapter'ı bağlanmadan bu CLI gerçek BOTC verisiyle çalıştırılamaz.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.
