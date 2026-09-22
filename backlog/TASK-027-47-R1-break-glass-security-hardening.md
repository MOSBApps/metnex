---
id: TASK-027.47-R1
title: Break-Glass Güvenlik Sertleştirmesi ve Credential Rotation Review
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-22
---

# TASK-027.47-R1: Break-Glass Güvenlik Sertleştirmesi ve Credential Rotation Review

## İlişki

TASK-027.47'nin ("Eş Sistem Yöneticisi Yönetimi, Credential Rotation ve
Break-Glass", bkz. `backlog/TASK-027-47-second-source-comparison.md`) AI1
tarafından `review`'da tutulup `done` onaylanmamasının ardından açılan
sertleştirme/review görevi. TASK-027.47'nin dört kapanış engelini ele alır.

## Amaç

AI1'in TASK-027.47 tesliminde bildirdiği dört kapanış engelini gidermek:

1. Break-glass rate-limit altyapısı yok.
2. Break-glass gerçek DB/HTTP ortamında doğrulanmamış.
3. Peer demotion tamamen engelleniyor (Model B'nin bilinen sonucu).
4. Self-servis parola değişiminde session/audit davranışı ayrıca
   kanıtlanmalı.

## AI2 Teslim Raporu

### 1. Break-glass rate-limit (kod tarafında kapatıldı)

Yeni `break_glass_attempts` singleton tablosu (bkz.
`apps/api/src/db/schema/platform.ts`), `SELECT ... FOR UPDATE` içeren bir
transaction'la atomik artırılıyor
(`BreakGlassRecoveryService.claimRateLimitSlot`). Bu, sahte veya bellek-içi
bir çözüm **değildir** — uygulamanın zaten bağımlı olduğu gerçek Postgres
altyapısını kullanan kalıcı, süreçler-arası bir mekanizmadır. Varsayılan: 15
dakikalık pencerede en fazla 5 deneme
(`BREAK_GLASS_RATE_LIMIT_MAX_ATTEMPTS`/`BREAK_GLASS_RATE_LIMIT_WINDOW_MS`
ile yapılandırılabilir). Başarılı ve başarısız her deneme — yanlış token
denemeleri dahil — token karşılaştırılmadan ÖNCE sayılır. Rate-limit
kayıtları hiçbir credential içermez.

### 1b. Tek-kullanımlık / süre sınırlı recovery (kod tarafında kapatıldı)

Yeni `break_glass_recovery_events` tablosu, `tokenHash` (sha256, token'ın
kendisi değil) üzerinde **UNIQUE** kısıt taşır. Kurtarma, credential/oturum
yazma işlemiyle **aynı transaction** içinde
`INSERT ... ON CONFLICT DO NOTHING` ile "claim" edilir — bu, "paralel iki
çağrıdan yalnızca biri başarılı olur" garantisinin **tek kaynağıdır**:
Postgres çakışan insert'leri serileştirir, kaybeden çağrı sıfır satır görür
ve `TOKEN_ALREADY_USED` ile reddedilir, hiçbir credential'a dokunmaz. Token
artık **kalıcı olarak tek kullanımlıktır** — kurtarılan yönetici daha sonra
deaktive edilse bile aynı token bir daha kabul edilmez; operatör bir sonraki
olay için `BREAK_GLASS_RECOVERY_TOKEN`'ı döndürmelidir.

Ayrıca opsiyonel açık süre sınırı eklendi: `BREAK_GLASS_TOKEN_EXPIRES_AT`
(ISO-8601). Süresi geçmiş veya bozuk bir tarih her zaman reddedilir
(fail-closed).

Durum modeli (`BREAK_GLASS_STATUS`):
`AVAILABLE | USED | EXPIRED | RATE_LIMITED | INVALID | BLOCKED | FAILED`.

### 2. Kontrollü yerel DB smoke test — TAMAMLANDI (kullanıcı onayıyla)

Kullanıcı onayı sorulup alındıktan sonra çalıştırıldı. Adımlar
(`docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md`
§14.11'de tam kayıt):
1. `docker run --rm -e POSTGRES_PASSWORD=... -p 127.0.0.1::5432 postgres:16` ile izole, tek seferlik, kalıcı volume'suz bir container (rastgele yerel port).
2. `DATABASE_URL` yalnızca bu geçici container'a işaret edecek şekilde ayarlanıp derlenmiş `dist/migrate.js` (programatik Drizzle migrator) ile tüm migration'lar (0000–0003) uygulandı.
3. `BreakGlassRecoveryService` ve gerçek `PlatformAuditService` doğrudan, test placeholder token'larla (gerçek secret değil) örneklenip geçici bir scratch script'le 15 senaryo elle tetiklendi.
4. Test bitince container `docker stop` ile durduruldu (`--rm` ile otomatik silindi); kalıcı volume hiç oluşmadı, `down -v`/prune gerekmedi.

**Sonuç: 15/15 doğrulama geçti**, en önemlisi:
- **Gerçek paralel yarış:** aynı token ile eşzamanlı iki `recover()` çağrısı
  (`Promise.all`) — yalnızca biri başarılı oldu, kaybeden
  `TOKEN_ALREADY_USED` ile reddedildi. Bu, mock tabanlı testlerin
  ispatlayamadığı, yalnızca gerçek Postgres'in unique-constraint
  serileştirmesiyle kanıtlanabilecek tek senaryoydu.
- Rate-limit eşiği aşıldıktan sonra doğru token dahi reddedildi (global,
  kalıcı sayaç doğrulandı).
- Süresi geçmiş token hiçbir yazma yapmadan reddedildi.
- Audit satırlarında (`platform_audit_logs`) hiçbir credential yok.

Bu artık açık bir madde değildir.

Bu madde onay verilene kadar **açık bir operasyonel doğrulama borcu**
olarak kalır.

### 3. Peer demotion operasyonel açığı (kod dışı — doküman kararı)

Model B altında (Q-DP24 kapanış madde 2) ele geçirilmiş/kötüye kullanılan
bir sistem yöneticisi için mevcut yollar
(`METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.11'de tam metin):

1. **Deaktivasyon/containment (birincil, anında):** herhangi bir başka
   ACTIVE sistem yöneticisi hedefi hemen deaktive edebilir — Model B'de
   kısıtlanmadı. Global `SYSTEM_ADMIN` atamasını KALDIRMAZ, yalnızca erişimi
   durdurur.
2. **Audit/olay müdahalesi:** ilgili hesabın audit kayıtları incelenmeli.
3. **Formal rol geri alma — yalnızca break-glass ile:** hesabı gerçekten
   `SYSTEM_ADMIN` rolünden düşürmenin TEK yolu şu an break-glass'tır veya
   doğrudan veritabanı müdahalesidir (bu task'ın kapsamı dışı). **Resmi,
   uygulama-içi bir demotion endpoint'i bu task'ta eklenmedi** — bilinçli
   bir sınırdır, yeni bir bypass icat edilmedi.
4. **Rollback:** break-glass ile geri getirilen hesap ilk iş olarak kendi
   parolasını self-servis akışıyla değiştirmeli; olay kapatıldığında
   `BREAK_GLASS_RECOVERY_TOKEN` döndürülmelidir.

Resmi bir demotion permission/ikinci-onay akışı hâlâ ayrı bir görev
gerektiriyor (Q-DP24 karar 6/10 ile birlikte, PO kararı).

### 4. Self-servis parola değişimi — ek kanıtlar

Mevcut oturum iptali/audit davranışı TASK-027.47'de zaten test edilmişti.
Bu task'ta gözden kaçan tek gerçek yetki boşluğu kapatıldı: **impersonation
oturumu artık kendi parolasını dahi değiştiremiyor**
(`AuthService.changeOwnPassword` artık
`context.impersonation`/`impersonatorUserId` alır,
`PRIVILEGE_DENIAL.IMPERSONATION` ile reddeder; `AuthController` bunu
`@CurrentUser()`'dan — request body'den DEĞİL — iletir).

### Değişen/yeni dosyalar

- `apps/api/src/db/schema/platform.ts` — `breakGlassAttempts`,
  `breakGlassRecoveryEvents` tabloları.
- `apps/api/drizzle/migrations/0003_break_glass_hardening.sql` —
  drizzle-kit `generate` ile, **canlı DB'ye bağlanmadan**, yalnızca
  şema-snapshot diff'i üzerinden üretildi; hiç çalıştırılmadı.
- `apps/api/src/platform/break-glass/break-glass.contract.ts` — yeni
  env/reason/status alanları.
- `apps/api/src/platform/break-glass/break-glass-recovery.service.ts` —
  rate-limit claim + opsiyonel expiry + ledger claim, hepsi credential
  yazma işlemiyle aynı transaction'da.
- `apps/api/src/platform/auth.service.ts` / `auth.controller.ts` —
  impersonation reddi.
- `apps/api/src/db/test-helpers/drizzle-mock.ts` — `.for()` chain metodu.
- `apps/api/src/platform/system-admin-credential-rotation-and-break-glass.spec.ts`
  — 36 → 56 test.
- `docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.11.
- `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` (append-only).
- `docs/opendevcon/METNEX_STATE.md`, `docs/opendevcon/PROGRESS_LOG.md`
  (append-only).

### Doğrulama

**5 zorunlu mutasyon kontrolü**, hepsi manuel çalıştırıldı ve dosyalar geri
yüklendi:
1. Tek-kullanım kontrolü kaldırılınca → 2 test kırıldı.
2. Rate-limit kısa-devre edilince → 17 test kırıldı.
3. Audit'e yeni parola sızdırılınca → 1 test kırıldı.
4. Break-glass oturum iptali kaldırılınca → 1 test kırıldı.
5. (TASK-027.47'nin orijinal 4 kontrolü de bu teslimde tekrar doğrulandı,
   bkz. o task'ın raporu.)

`pnpm --filter api exec tsc --noEmit` temiz.
`pnpm --filter api exec jest platform --runInBand` — 16 suite / 909 test.
`pnpm --filter api exec jest src/db --runInBand` — 2 suite / 40 test.
`./scripts/check.sh --skip-docker` — PASS (exit 0), API 53 suite / 1501
test, web 8 dosya / 117 test (Q-ENV01 nedeniyle `NODE_PATH` +
`TURBO_ENV_MODE=loose` ile).

Ek olarak, kullanıcı onayıyla, break-glass izole/geçici bir yerel Postgres'e
karşı gerçekten çalıştırıldı (madde 2, yukarıya bakınız) — 15/15 senaryo
geçti, gerçek paralel yarış dahil. Gerçek production DB/HTTP/MFA
sağlayıcısı/production secret hiç kullanılmadı.

### Kalan açık maddeler

- Formal `SYSTEM_ADMIN` demotion yolu (kod değişikliği gerektirir, ayrı
  görev).
- `BREAK_GLASS_RECOVERY_TOKEN` üretimi/saklanması ve runbook onayı
  (operasyonel, Ops/AI1/PO kararı).
- TASK-027.48 (MFA enforcement), TASK-027.49 (tenant-rol delegasyonu).

Git commit/push yapılmadı.

## AI1 Onayı (2026-09-22)

AI1, bu teslimi `done` olarak onayladı: kalıcı PostgreSQL rate-limit
(atomik `SELECT ... FOR UPDATE`), token hash ledger'ı ve tek kullanımlık
claim, gerçek izole PostgreSQL smoke testinde 15/15 başarı, self-servis
parola değişimi/session iptali kanıtı ve peer demotion operasyonel
prosedürü kabul edildi; gerçek production DB/HTTP/secret kullanılmaması ve
break-glass'ın Nest/HTTP'ye bağlanmaması doğrulandı. Ana **TASK-027.47 de
bu R1 ile birlikte `done` kapandı** (bkz.
`backlog/TASK-027-47-second-source-comparison.md`). Sıradaki görev:
TASK-027.48 (MFA enforcement).
