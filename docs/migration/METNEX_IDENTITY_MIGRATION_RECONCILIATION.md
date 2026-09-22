# Metnex Identity Migration — Execution Reconciliation

> **Durum: Implementation + kullanım dokümantasyonu.**
> Kaynak görev: `backlog/TASK-027-19-...md` (id: `TASK-027.19`, EPIC-004, Wave 0/1, bağımlılık:
> TASK-027.10, TASK-027.12, TASK-027.15/R1, TASK-027.16, TASK-027.17, TASK-027.18). Bu belge,
> `docs/migration/METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md`'nin §1'deki
> "Verification"/"Reconciliation" aşamalarını (6-7) identity için somutlaştıran
> `apps/api/src/migration/botc-identity/reconciliation.ts` modülünü belgeler. **Reconciliation
> yalnızca dry-run çıktıları ve in-memory state üzerinden çalışır** — gerçek PostgreSQL apply,
> fiziksel staging tablosu veya SQL Server bağlantısı hiçbir zaman oluşturulmaz.

**Tarih:** 2026-09-18
**Hazırlayan:** AI2 (Engineering Executor)

---

## 1. Neden Reconciliation Gerekli

İki migration çalıştırması (örn. bir hafta arayla alınmış iki dry-run) arasında neyin değiştiğini
bilmek — yeni kullanıcılar, güncellenenler, tenant durumu değişenler, kaybolan admin-atamaları —
uygulama öncesi bir insan onayı (approval gate, dry-run standardının §1 aşama-4'ü) için kritiktir.
Bu modül bu karşılaştırmayı **güvenli ve deterministik** şekilde yapar.

---

## 2. API

```ts
function reconcileMigrationRuns(before: unknown, after: unknown, params?: { now?: () => Date }): ReconciliationReport

function buildReconciliationSnapshot(params: {
  migrationRunId: string
  stagingStore: InMemoryStagingStore
  targetState: SimulatedTargetState
  issues: readonly MigrationIssue[]
  roleTemplateCount: number
  permissionMappedCount: number
  permissionUnmappedCount: number
}): ReconciliationInputSnapshot
```

`reconcileMigrationRuns` `unknown` kabul eder ve **hiçbir zaman throw etmez** — geçersiz bir girdi
`INVALID_INPUT` statüsüyle döner (kabul kriteri: "geçersiz veya uyumsuz rapor formatı →
`INVALID_INPUT`").

---

## 3. CLI

```sh
cd apps/api && pnpm build
node dist/migration/botc-identity/cli/reconcile-cli-entry.js \
  --before src/migration/botc-identity/cli/fixtures/sample-dry-run-input.json \
  --after  src/migration/botc-identity/cli/fixtures/sample-dry-run-input.json \
  --output /tmp/reconciliation-report.json
```

`--before`/`--after`, TASK-027.18'in `DryRunCliInput` fixture formatını kullanır (`source`,
`approvedTenantAssignmentTable`, opsiyonel `adminAssignedPasswordLegacyIds`/
`simulateFailureLegacyIds`). Bu CLI'da da **`--apply` yoktur** — iki fixture da yalnızca in-memory
olarak çalıştırılır, hiçbir dosya/DB'ye kalıcı state yazılmaz (yalnızca `--output` ile açıkça
istenen rapor dosyası hariç).

**Gerçekten derlenip çalıştırıldı** (varsayım değil): kendine karşı karşılaştırma, conflict
fixture'ına karşı karşılaştırma, argümansız çağrı — üçü de bu ortamda fiilen doğrulandı.

---

## 4. Çıktı Sözleşmesi ve Status Matrisi

Bkz. `backlog/TASK-027-19-...md` teslim raporu — burada tekrar üretilmez.

---

## 5. Test Fixture Senaryoları (görev kapsam madde 10)

`reconciliation.spec.ts`'teki 16 test, aşağıdaki 11 senaryonun **tamamını** kapsar: birebir aynı
rapor (`MATCHED`), yeni kullanıcı (`added`), güncellenen kullanıcı (`changed` + checksum diff),
silinmiş/eksik kaynak kaydı (`removed`), permission değişikliği (`permissionUnmappedDiff`), tenant
`ASSIGNED`→`UNRESOLVED`, `UNRESOLVED`→`ASSIGNED`, tenant conflict (`BLOCKED`, sıfır per-user diff),
`ADMIN_ASSIGNED` kaybı (`passwordStrategyDiffs[].adminAssignedLost`), fatal validation (`BLOCKED`),
session/token alanı içeren geçersiz rapor (`BLOCKED`, sentetik issue, değer sızıntısı yok).

---

## 6. Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → sonuç raporun sonunda
  belirtilmiştir.
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda belirtilmiştir.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

## 7. Kalan Riskler / Sonraki Bağımlılık

- Q-ID01 çözülmeden reconciliation, gerçek bir kalıcı staging tablosuyla değil yalnızca iki
  bağımsız, function-local dry-run çalıştırmasıyla çalışabilir.
- Q-T01, Q-S03, Q-P02 hâlâ açık/kapsam dışı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

---

## 8. TASK-027.20 Doğrulama Notu (2026-09-18)

Reconciliation güvenlik davranışı (fatal/conflict sonrası per-user diff üretilmemesi, `UNRESOLVED`
asla `MATCHED` görünmemesi, session/credential alanlarında `BLOCKED`) TASK-027.20'nin konsolide
güvenlik paketinde (`security-tenant-isolation.spec.ts` §8) regresyon testi olarak yeniden
doğrulandı — bu dosyanın kendi mantığı **değiştirilmedi**. Tam matris:
`docs/migration/METNEX_IDENTITY_SECURITY_TEST_MATRIX.md`.
