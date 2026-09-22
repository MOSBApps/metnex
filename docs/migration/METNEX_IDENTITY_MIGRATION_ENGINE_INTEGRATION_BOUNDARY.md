# Metnex Identity Migration Engine — Integration Boundary

> **Durum: Implementation + entegrasyon sözleşmesi dokümantasyonu.**
> Kaynak görev: `backlog/TASK-027-13-role-migration-implementation.md` (id: `TASK-027.13`, EPIC-004,
> Wave 0/1, bağımlılık: TASK-027.11, TASK-027.12, TASK-027.12-R1 — hepsi done). Bu task,
> TASK-027.12'de üretilen in-memory identity migration motorunu (`apps/api/src/migration/botc-identity/`)
> **yeniden yazmadan**, onun giriş/çıkış sözleşmesini sabitler, kaynak/tenant adapter sınırlarını
> netleştirir, source-snapshot preflight validation ekler ve bu sözleşmeyi entegrasyon testleriyle
> doğrular.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

---

## 1. Motorun Kendisi Değişmedi

`migration-run.service.ts`, `role-template.service.ts`, `permission-mapping.ts`, `tenant-mapping.ts`,
`duplicate-detection.ts`, `simulated-target.ts`, `staging-store.ts`, `audit-metadata.ts` —
TASK-027.12'de üretilen bu 9 dosyanın **hiçbiri bu task'ta değiştirilmedi** (diff yalnızca yeni
dosyalar ekliyor). Bu, kabul kriteri #1'in ("TASK-027.12 motoru yeniden yazılmadan entegrasyon
sınırı doğrulanmış olmalı") doğrudan karşılığıdır.

## 2. Yeni Eklenen Sınır Bileşenleri

| Dosya | Sorumluluk |
|---|---|
| `source-validation.ts` | **Preflight** aşaması (dry-run standardının §1 aşama-1'i) — kaynak snapshot'ı ve onaylı tenant mapping tablosunu motoru **hiç çağırmadan** doğrular |
| `tenant-mapping-adapter.ts` | `ApprovedTenantMappingAdapter` port'u + in-memory implementasyonu — `BotcIdentitySourceAdapter` (TASK-027.12) ile aynı desende, onaylı tenant mapping tablosu için ayrı bir adapter sınırı |
| `source-validation.spec.ts` | Preflight validation'ın 8 kuralının (boş/duplicate legacy ID, orphan role/permission/user, geçersiz tenant slug, çakışan tenant mapping, eksik zorunlu alan) deterministik testleri |
| `integration-boundary.spec.ts` | Motoru kara kutu olarak ele alan entegrasyon testleri (bkz. §5) |

## 3. Giriş/Çıkış Sözleşmesi (sabitlendi)

### 3.1 Giriş — `MigrationRunInput` (değişmedi, TASK-027.12'den)

```ts
interface MigrationRunInput {
  source: BotcIdentitySourceSnapshot          // BotcIdentitySourceAdapter.readSnapshot()'tan gelir
  approvedTenantAssignmentTable: readonly ApprovedTenantAssignmentEntry[] // ApprovedTenantMappingAdapter.readMappingTable()'dan gelir
  adminAssignedPasswordLegacyIds?: ReadonlySet<string>
  simulateFailureLegacyIds?: ReadonlySet<string> // yalnızca test/operasyonel hook
  stagingStore: InMemoryStagingStore
  targetState: SimulatedTargetState
  mode: 'DRY_RUN' | 'APPLY'
  migrationRunId: string
  now?: () => Date
}
```

**Preflight sırası (bu task ile netleştirildi):**

1. `sourceAdapter.readSnapshot()` → `BotcIdentitySourceSnapshot`
2. `tenantAdapter.readMappingTable()` → `ApprovedTenantAssignmentEntry[]`
3. `validateSourceSnapshot(source, table)` → `{ issues, isFatal }`
4. **`isFatal === true` ise `MigrationRunService.run()` hiç çağrılmaz** — çağıran taraf (CLI/task
   runner, henüz üretilmedi) bu noktada durur ve `issues`'ı raporlar.
5. `isFatal === false` ise `MigrationRunService.run({ mode: 'DRY_RUN', ... })` çağrılabilir.
6. Yalnızca bir insan (AI1/Product Owner) dry-run raporunu onayladıktan **sonra**
   `MigrationRunService.run({ mode: 'APPLY', ... })` çağrılabilir (dry-run standardı §1 aşama-4,
   approval gate — bu task bu adımı otomatikleştirmez, yalnızca sınırı belgeler).

### 3.2 Çıkış — 9 Zorunlu Artefakt (görev talimatı kapsam madde 6)

`MigrationRunResult` yalnızca `{ report: DryRunReport }` döner (TASK-027.12'den değişmedi). Kalan
artefaktlar, `run()`'a **çağıranın kendisinin verdiği** `stagingStore`/`targetState` referansları
üzerinden okunur — bu **kasıtlı bir tasarımdır** (in-place mutation, TASK-027.12'nin "APPLY yalnızca
in-memory simulated target'a yazar" ilkesiyle tutarlı):

| # | Artefakt | Nereden okunur |
|---|---|---|
| 1 | `users` | `targetState.usersByLegacyId` |
| 2 | `tenant membership` | `targetState.tenantMembershipsByUserId` |
| 3 | `tenant role templates` | `targetState.roleTemplatesById` |
| 4 | `role assignments` | `targetState.roleAssignments` |
| 5 | `staging records` | `stagingStore.all()` |
| 6 | `unresolved records` | `report.unresolvedRecords` |
| 7 | `migration issues` | `report.errorsAndWarnings` |
| 8 | `audit metadata` | `buildAuditMetadata({ actorId, mode, startedAt, finishedAt, report })` (`audit-metadata.ts`, ayrı bir çağrı — `run()`'ın kendisi üretmez) |
| 9 | `password strategy summary` | `report.passwordStrategySummary` |

Bu 9 artefaktın tamamı `integration-boundary.spec.ts`'teki "the 9 required output artifacts" test
grubunda **açıkça** doğrulanmıştır.

## 4. Adapter Sınırları

### 4.1 `BotcIdentitySourceAdapter` (TASK-027.12'den, değişmedi)

```ts
interface BotcIdentitySourceAdapter {
  readSnapshot(): Promise<BotcIdentitySourceSnapshot>
}
```

Yalnızca `InMemoryBotcIdentitySourceAdapter` implementasyonu vardır. Gerçek bir SQL Server adapter'ı
(`METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md`'ye göre) **bu task'ta da üretilmedi** — canlı
SQL Server bağlantısı görev talimatında açıkça yasaktır.

### 4.2 `ApprovedTenantMappingAdapter` (bu task ile eklendi)

```ts
interface ApprovedTenantMappingAdapter {
  readMappingTable(): Promise<readonly ApprovedTenantAssignmentEntry[]>
}
```

Q-M06 kararının (`Sirket` tenant kaynağı olarak kullanılmaz, tenant ataması ayrı onaylı bir mapping
tablosundan gelir) **integration-boundary düzeyinde açık bir sınır** olarak ifade edilmesidir.
Yalnızca `InMemoryApprovedTenantMappingAdapter` implementasyonu vardır — gerçek onaylı tablonun nasıl
saklanacağı/güncelleneceği (bir admin ekranı mı, bir CSV mi) bu task'ın kapsamı dışındadır.

## 5. Entegrasyon Testleri — Kapsam Eşlemesi

`integration-boundary.spec.ts`, görev talimatının kapsam maddeleriyle şu şekilde eşleşir:

| Görev maddesi | Test grubu |
|---|---|
| 2 — adapter sınırları | `integration boundary — source/tenant adapter ports` |
| 4 — deterministik giriş/çıkış | `integration boundary — frozen input/output contract` |
| 5 — DRY_RUN/APPLY ayrımı | `integration boundary — DRY_RUN vs APPLY separation` |
| 6 — 9 çıktı | `integration boundary — the 9 required output artifacts` |
| 7 — idempotency/retry | `integration boundary — idempotency and retry (contract-level)` |
| 8 — permission mapping korunumu | `integration boundary — permission mapping is preserved` |
| 9 — tenant mapping korunumu | `integration boundary — tenant mapping is preserved` |
| 10 — parola davranışı korunumu | `integration boundary — password behavior is preserved` |
| (güvenlik sınırı teyidi) | `integration boundary — no real connections (explicit confirmation)` — dosya içeriği taranarak `pg`/`mssql`/`tedious`/gerçek `Db` client importu ve (yorum satırları hariç) `authSessions` referansı olmadığı **statik olarak** doğrulanır |

## 6. Preflight Validation — 8 Kural (görev talimatı kapsam madde 3)

`source-validation.ts`, `validateSourceSnapshot(source, approvedTenantAssignmentTable)` fonksiyonu:

| Kural | Kategori | Kod |
|---|---|---|
| Boş legacy ID | FATAL | `FATAL_EMPTY_LEGACY_ID` |
| Duplicate legacy ID (aynı entity tipi içinde) | FATAL | `FATAL_DUPLICATE_LEGACY_ID` |
| Orphan role referansı (`User.RoleId` bulunamıyor) | RECOVERABLE | `RECOVERABLE_ORPHAN_ROLE_REFERENCE` |
| Orphan permission referansı (`UserPermission.PermissionId` bulunamıyor) | RECOVERABLE | `RECOVERABLE_ORPHAN_PERMISSION_REFERENCE` |
| Orphan user referansı (`UserPermission.UserId` bulunamıyor) | RECOVERABLE | `RECOVERABLE_ORPHAN_USER_REFERENCE` |
| Geçersiz tenant slug (onaylı tabloda MOSB/MOSEDAS/MOSBIO dışı) | FATAL | `FATAL_INVALID_TENANT_SLUG` |
| Çakışan tenant mapping (aynı kullanıcı için birden fazla farklı slug) | FATAL | `FATAL_CONFLICTING_TENANT_ASSIGNMENT` (`duplicate-detection.ts`'teki mevcut fonksiyon **yeniden kullanıldı**, tekrar üretilmedi) |
| Eksik zorunlu alanlar (Username/Role.Name/PermissionName boş) | FATAL | `FATAL_MISSING_REQUIRED_FIELD` |

`isFatal = issues.some(i => i.category === 'FATAL')` — çağıran taraf bu bayrağa göre motoru
çağırıp çağırmayacağına karar verir (bkz. §3.1). Bu fonksiyon **salt-okunurdur**, hiçbir mutasyon
yapmaz, `MigrationRunService`'i hiç import etmez.

## 7. Test Fixture Gözden Geçirmesi (görev talimatı kapsam madde 11)

Bu task kapsamında `apps/api/src/migration/botc-identity/*.spec.ts` dosyalarının tamamı tekrar
gözden geçirildi: hiçbir test fixture'ı gerçek BOTC kullanıcı adı/e-posta/parola içermiyor — tüm
değerler sentetik (`op1@example.com`, `Operator One`, `unresolved@example.com` gibi), gerçek bir
kişi/kurumla eşleşmiyor. Değişiklik gerekmedi.

## 8. Gelecekteki Gerçek Adapter Bağlantısı İçin Not (kısa runbook, görev talimatı kapsam madde 12)

Bu motor, gerçek bir BOTC/SQL Server kaynağına şu şekilde bağlanacaktır (implementasyon **bu
task'ta üretilmemiştir**, yalnızca sınır belgelenmiştir):

1. `METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md`'ye uygun, read-only bir SQL Server client
   yazılır ve `BotcIdentitySourceAdapter.readSnapshot()`'ı implemente eder.
2. Onaylı tenant mapping tablosu gerçek bir kaynaktan (admin ekranı/CSV/vb.) okunacak şekilde
   `ApprovedTenantMappingAdapter.readMappingTable()`'ı implemente eden bir adapter yazılır.
3. `InMemoryStagingStore`'un yerini gerçek bir `migration_staging_identity` Drizzle tablosu
   alacaktır — **bu, Q-ID01'in (şema yerleşimi + retention) PO tarafından kapatılmasını
   gerektirir; bu task Q-ID01'i kapatmamıştır.**
4. `SimulatedTargetState`'in yerini gerçek Drizzle `db.insert(...)`/`db.transaction(...)`
   çağrıları alacaktır — bu, ayrı bir implementation task'ı ve AI1'in canlı PostgreSQL apply
   onayı gerektirir.
5. `audit-metadata.ts`'nin ürettiği şekil, gerçek `PlatformAuditService.record(...)`'a
   geçirilecektir.

Bu 5 adımın **hiçbiri bu task'ta uygulanmamıştır** — motorun kendi iç mantığı (`migration-run.service.ts`)
bu adapter'lardan tamamen bağımsız kalacak şekilde zaten tasarlanmıştı (TASK-027.12); bu task yalnızca
bunu port arayüzleriyle **açıkça belgeledi ve test etti**.

## 9. Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → sonuç raporun sonunda
  belirtilmiştir.
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda belirtilmiştir.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

## 10. Kalan Riskler / Sonraki Bağımlılık

- Q-ID01, Q-P02, Q-T01/Q-SC01'in lokasyon-özel kısımları **hâlâ açık** — bu task hiçbirini
  kapatmadı, yalnızca kapsam dışı olarak korudu.
- Gerçek SQL Server adapter'ı, gerçek tenant mapping adapter'ı ve gerçek PostgreSQL apply katmanı
  hâlâ üretilmedi — §8'deki 5 adım ayrı implementation task'ları + AI1 onayı gerektirir.
- Preflight validation (`validateSourceSnapshot`) şu an motor tarafından **otomatik çağrılmıyor** —
  motoru çağıran taraf (henüz üretilmemiş bir CLI/task runner) bu adımı kendi sorumluluğunda
  yürütmelidir; bu, kabul kriteri #1 gereği motorun kendisine bu çağrının **eklenmemesi**
  (yeniden yazma sayılmaması) kararının doğal sonucudur.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.
