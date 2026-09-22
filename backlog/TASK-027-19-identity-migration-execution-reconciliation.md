---
id: TASK-027.19
title: Identity Migration Execution Reconciliation
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

> **Başlık/kapsam notu (2026-09-18):** Bu dosya, EPIC-004'ün ilk toplu backlog üretiminde
> `TASK-027.19 — Identity migration execution reconciliation` ("Migration'ı **çalıştır** ve
> sonuçları reconcile et", status: `planned`) olarak oluşturulmuştu ve hiç başlatılmamıştı. AI1,
> aynı `TASK-027.19` kimliğini, "çalıştır" ibaresinin **gerçek bir apply çağrıştırabileceği**
> orijinal metinden daha dar/açık bir kapsamla yeniden görevlendirdi: reconciliation **yalnızca
> dry-run çıktıları ve in-memory state üzerinden** çalışır — gerçek PostgreSQL apply, fiziksel
> staging tablosu veya SQL Server bağlantısı **kesinlikle oluşturulmaz**. Orijinal kapsam hiç
> uygulanmadığı için çakışma/veri kaybı riski yoktur.

## AI2 Teslim Raporu — Identity Migration Execution Reconciliation (2026-09-18)

### Amaç

TASK-027.12–027.18 ile oluşturulan identity migration, validation ve dry-run çıktılarının
reconciliation sürecini **yalnızca dry-run çıktıları ve in-memory state üzerinden** hazırlamak.

### Teslimat

| Dosya | Sorumluluk |
|---|---|
| `apps/api/src/migration/botc-identity/reconciliation.ts` (yeni) | Saf çekirdek: `reconcileMigrationRuns(before, after)` + `buildReconciliationSnapshot(...)` yardımcı fonksiyonu |
| `reconciliation.spec.ts` (16 test) | Görev kapsam madde 10'daki 11 senaryonun tamamı + determinism + credential-leak testleri |
| `cli/reconcile-cli-entry.ts` (yeni) | Gerçek çalıştırılabilir giriş noktası — `--before`/`--after` fixture'larını karşılaştırır; `dry-run-cli.ts`/`dry-run-cli-entry.ts` (TASK-027.18) **hiç değiştirilmedi** |
| `cli/reconcile-cli-entry.spec.ts` (8 test) | |

`apps/api/package.json`'a `migrate:identity:reconcile` script'i eklendi.
`docs/migration/METNEX_IDENTITY_MIGRATION_RECONCILIATION.md` (yeni) — tam kullanım/sözleşme
dokümanı. `migration-run.service.ts`, `role-template.service.ts`, `permission-mapping.ts`,
`tenant-mapping.ts`, `password-boundary.ts`, `session-boundary.ts`, `dry-run-cli.ts`,
`dry-run-cli-entry.ts` — **hiçbiri değiştirilmedi**.

### Çıktı Sözleşmesi (`ReconciliationReport`)

```ts
interface ReconciliationReport {
  migrationRunId: string; comparedRunId: string; generatedAt: string
  sourceChecksumDiffs: {...}[]
  added: {...}[]; removed: {...}[]; changed: {...}[]; unchanged: {...}[]; unresolved: {...}[]
  conflicts: MigrationIssue[]
  passwordStrategyDiffs: { sourceLegacyId, before, after, adminAssignedLost }[]
  roleTemplateCountDiff: number; permissionMappedDiff: number; permissionUnmappedDiff: number
  blockingIssues: MigrationIssue[]; warnings: MigrationIssue[]
  reconciliationStatus: 'MATCHED' | 'CHANGED' | 'BLOCKED' | 'UNRESOLVED' | 'INVALID_INPUT'
}
```

### Status Matrisi

| Girdi durumu | `reconciliationStatus` |
|---|---|
| Yapısal olarak geçersiz/uyumsuz snapshot | `INVALID_INPUT` |
| Session/token/cookie/credential-benzeri alan bulundu | `BLOCKED` (kendi sentetik `FATAL_RECONCILIATION_CREDENTIAL_OR_SESSION_FIELD` issue'suyla) |
| Herhangi bir `FATAL` issue (conflict dahil) | `BLOCKED` — **per-user diff hiç denenmez** (kapsam madde 6) |
| `UNRESOLVED` tenant kullanıcısı var | `UNRESOLVED` |
| Fark var ama fatal/unresolved yok | `CHANGED` |
| Fark yok | `MATCHED` |

Öncelik sırası: `INVALID_INPUT` > `BLOCKED` (session/credential) > `BLOCKED` (fatal) > `UNRESOLVED`
> `CHANGED` > `MATCHED`.

### Conflict / Unresolved Davranışı

Bir çakışma (`FATAL_CONFLICTING_TENANT_ASSIGNMENT`) varsa, reconciliation **hiçbir per-user
added/removed/changed hesaplamaya girişmez** — bunun nedeni: motor bloklandığında (staging boş)
"tüm kullanıcılar silindi" gibi yanıltıcı bir diff üretmemek. Bu, `reconciliation.spec.ts`'in
"scenario 8" testiyle doğrudan kanıtlanmıştır. Conflict kullanıcıları hiçbir zaman `MATCHED` veya
"ASSIGNED" görünmez.

### Password/Session Güvenlik Sınırları

- `RESET_REQUIRED` karşılaştırması: her iki snapshot'ta da her zaman var olması beklenir,
  eksikliği `passwordStrategyDiffs`'e otomatik yansır.
- `ADMIN_ASSIGNED` kaybı: `adminAssignedLost: true` ile açıkça işaretlenir (`scenario 9`).
- Gerçek parola/hash/salt/token **hiçbir zaman karşılaştırılmaz** — `PasswordStrategy` yalnızca
  `RESET_REQUIRED`/`ADMIN_ASSIGNED` etiketleridir, gerçek değer taşımaz.
- Session/token/cookie/JWT/email-verification alanı bulunursa reconciliation **`BLOCKED`** olur
  (`scanForCredentialFields`/`scanForSessionOrTokenFields`, TASK-027.16/027.17'den yeniden
  kullanıldı, tekrar üretilmedi) — gerçek değer hiçbir zaman rapora yazılmaz (`JSON.stringify`
  testiyle doğrulandı).

### Determinism Kanıtı

Girdi sırası sonucu değiştirmez (kayıtlar `sourceLegacyId`'ye göre sıralanır); aynı girdi aynı
sonucu üretir (`generatedAt` hariç). **Bulunan/düzeltilen bir tuzak:** iki bağımsız (paylaşılan
staging store'suz) dry-run'ın `targetId`'leri farklı `randomUUID()` değerleri taşır — bu,
TASK-027.18'de öğrenilen "iç UUID üretimi karşılaştırma sonucunu etkilememeli" dersinin burada da
uygulanmasını gerektirdi: `sameUserRecord()` artık `targetId`'yi **tam değer** değil yalnızca
**varlık/yokluk** olarak karşılaştırıyor.

### Gerçekten Derlenip Çalıştırıldı

`pnpm build` → `node dist/migration/botc-identity/cli/reconcile-cli-entry.js` — kendine karşı
karşılaştırma (`UNRESOLVED`, fixture'da kalıcı unresolved kullanıcı olduğu için beklenen), conflict
fixture'ına karşı karşılaştırma (`BLOCKED`, exit 1), argümansız çağrı (exit 2) — üçü de bu ortamda
fiilen doğrulandı.

### Kesinlikle yapılmayanlar (görev talimatına uygun)

Gerçek SQL Server bağlantısı, gerçek PostgreSQL bağlantısı/apply, fiziksel staging tablosu,
Drizzle migration/seed/schema değişikliği, Q-ID01 kararı, gerçek BOTC verisi, gerçek parola/hash/
salt/token/secret, `authSessions` yazma, self-servis email verification/reset, yeni permission/
tenant kodu üretme, Q-T01/Q-S03/Q-P02 kararı, Wave 2/Wave 3 kodu, Docker çalıştırma, git
commit/push — **hiçbiri yapılmadı**.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **201/201 test PASS** (20
  suite — önceki 177/177'den; TASK-027.12–18'in testlerinden hiçbiri bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

### Kalan riskler / sonraki bağımlılık

- Q-ID01, Q-T01, Q-S03, Q-P02 hâlâ açık/kapsam dışı; bu task hiçbirine dokunmadı.
- Reconciliation, gerçek kalıcı bir staging tablosu olmadan yalnızca iki **bağımsız, function-local**
  dry-run çalıştırmasını karşılaştırabilir — gerçek bir "önceki apply'ın kaydı" ile karşılaştırma
  Q-ID01 çözülmeden mümkün değildir.
- Production kodu yalnızca yeni dosyalardan oluşuyor; motorun/CLI'ın mevcut hiçbir dosyası
  değiştirilmedi.

### Durum (2026-09-18 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle identity migration execution reconciliation
teslimi onaylandı (bkz. aşağıdaki "AI1 Final Onayı" bölümü).

## AI1 Final Onayı (2026-09-18)

TASK-027.19 teslimi onaylandı ve `done` olarak kapatıldı. Reconciliation yalnızca dry-run
çıktıları/in-memory state üzerinden çalışıyor; bağımsız target UUID'leri yanlış değişiklik
üretmiyor. Fatal/conflict durumlarında per-user diff üretilmiyor ve credential/session
alanları `BLOCKED` sonucu veriyor.

Gerçek PostgreSQL/SQL Server bağlantısı, fiziksel staging veya apply yapılmadı.
`./scripts/check.sh --skip-docker` PASS ve 35 suite / 300 test kanıtı kabul edildi.

---

# TASK-027.19 (orijinal): Identity migration execution reconciliation

## Amaç

Migration’ı çalıştır ve sonuçları reconcile et.

## Wave ve bağımlılık

TASK-027.18

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
