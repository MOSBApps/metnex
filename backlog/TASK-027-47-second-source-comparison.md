---
id: TASK-027.47
title: Eş Sistem Yöneticisi Yönetimi, Credential Rotation ve Break-Glass
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-22
---

## Başlık/kapsam notu

TASK-027.47 ID'si AI1 tarafından "Eş Sistem Yöneticisi Yönetimi, Credential
Rotation ve Break-Glass" görevine yeniden atanmıştır (TASK-027.46 onay mesajı,
2026-09-22). Bu dosya bu kimlikteki mevcut placeholder dosya olduğu için
yeniden kullanılmıştır; "Second source comparison" başlıklı orijinal
placeholder içerik aşağıda `---` altında korunmuştur ve ayrı bir görev olarak
işlenmemiştir.

**R1 referansı:** AI1, bu tesliminin ilk halini `done` onaylamadı — teslim
`review` durumunda kaldı ve dört kapanış engeli (break-glass rate-limit,
gerçek ortam doğrulaması, peer demotion operasyonel açığı, self-servis
session/audit kanıtı) `TASK-027.47-R1`'e taşındı. Bkz.
`backlog/TASK-027-47-R1-break-glass-security-hardening.md`. **AI1,
TASK-027.47-R1'i `done` onayladıktan sonra (2026-09-22) bu ana görevi de
birlikte `done` kapattı** — aşağıya bakınız.

## AI1 Onayı (2026-09-22)

AI1, TASK-027.47-R1'in dört kapanış engelini gidermesini onayladı (kalıcı
PostgreSQL rate-limit, token hash ledger'ı/tek kullanımlık claim, gerçek
izole PostgreSQL smoke testinde 15/15 başarı, self-servis parola
değişimi/session iptali kanıtı, peer demotion operasyonel prosedürü;
gerçek production DB/HTTP/secret kullanılmaması ve break-glass'ın
Nest/HTTP'ye bağlanmaması doğrulandı) ve bu ana TASK-027.47'yi R1 ile
birlikte `done` kapattı. Sıradaki görev: TASK-027.48 (MFA enforcement).

## AI2 Teslim Raporu — TASK-027.47

### Amaç ve model kararı

TASK-027.44–027.46 kararları doğrultusunda eş sistem yöneticisi yönetim
kuralı, sistem yöneticisi parola rotasyonu ve güvenli break-glass yolu birlikte
tasarlandı ve uygulandı. **Model B (Kısıtlı eş yönetim)** seçildi — bu, Q-DP24
kapanış kararı 2 ("Eş sistem yöneticileri parola/rol işlemlerinde birbirini
yönetemez; deactivation/containment serbest kalır") ile birebir örtüşür,
ayrıca AI1 onayınca zaten kabul edilmiş bir yorumdur. Model A/C tartışmaya
açılmadı.

### Değişen/yeni dosyalar

- `apps/api/src/platform/domain/privilege-ceiling.domain.ts` — yeni
  `PEER_SYSTEM_ADMIN_CREDENTIAL` statik ret kodu
  (`PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED`).
- `apps/api/src/platform/user.service.ts` — `assertTargetRules`'a
  `credentialClass` seçeneği eklendi; hedef sistem yöneticisiyse
  `setPassword`/`assignRole`/`revokeRole` HER actor için (bir başka sistem
  yöneticisi dahil) reddediliyor; `setPassword` başarı yolunda hedefin
  `authSessions` kayıtları da iptal ediliyor.
- `apps/api/src/platform/mfa.service.ts` — `adminResetMfa`'ya self-reddi
  (`SELF_CHANGE`) ve peer-reddi (`PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED`)
  eklendi.
- `apps/api/src/platform/auth.service.ts` — yeni `changeOwnPassword` metodu:
  canonical parola politikası doğrulaması, mevcut parola kontrolü, hash,
  `authSessions` iptali, başarı/hata audit'i.
- `apps/api/src/platform/auth.controller.ts` — yeni `POST
  /auth/change-password` (`JwtAuthGuard`, hedef alanı yok, yapısal olarak
  yalnızca kendi hesabı).
- `apps/api/src/platform/domain/platform-input.domain.ts` —
  `validateChangeOwnPassword` doğrulayıcısı.
- `apps/api/src/platform/break-glass/break-glass.contract.ts`,
  `break-glass-recovery.service.ts` (kasıtlı olarak `@Injectable()` değil ve
  `platform.module.ts`'ye kayıtlı değil — Nest DI/HTTP üzerinden erişilemez),
  `break-glass-recovery.entrypoint.ts` (`migrate.ts` deseniyle bağımsız CLI
  giriş noktası, env-only konfigürasyon, varsayılan kapalı).
- `apps/api/src/platform/system-admin-credential-rotation-and-break-glass.spec.ts`
  — 36 yeni test.
- Uyarlanan mevcut spec'ler: `platform-user-admin-privilege-boundary.spec.ts`,
  `privilege/privilege-report.spec.ts`,
  `endpoint-authorization-inventory.spec.ts` (yeni endpoint envanter kaydı).
- Dokümantasyon: `docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md`
  (§14.9, §14.10), `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`
  (append-only), `docs/opendevcon/METNEX_STATE.md`,
  `docs/opendevcon/PROGRESS_LOG.md` (append-only).

### Actor/target kararı (Model B)

- Eş sistem yöneticileri birbirinin parolasını, rolünü (SYSTEM_ADMIN
  verme/kaldırma) veya MFA ayarlarını değiştiremez.
- Deaktivasyon (containment) bu kısıttan etkilenmedi — mevcut son-yönetici
  koruması geçerliliğini korur.
- Self-servis rotasyon her ACTIVE kullanıcıya açık; endpoint'te hedef alanı
  yok, yapısal olarak yalnızca kendi hesabı.
- Break-glass yalnızca hiçbir ACTIVE sistem yöneticisi kalmadığında ve hedef
  zaten canonical `SYSTEM_ADMIN` rolüne sahipse çalışır (TASK-027.45'in
  read-only privilege report'u tek uygunluk kapısı olarak yeniden kullanıldı).
- Impersonation oturumları credential rotation veya privilege değişikliği
  yapamaz (TASK-027.46'dan miras alınan kural, bu task'ta bozulmadı).

**Bilinen/yeni ortaya çıkan sonuç:** Peer actor'lar artık bir sistem
yöneticisinin `SYSTEM_ADMIN` rolünü `revokeRole` ile geri alamıyor (hedef
tanım gereği zaten sistem yöneticisi). Resmi demotion artık yalnızca
break-glass veya ayrı bir gelecek görev ile mümkün. Bu, karar paketi §14.9'da
ve open-questions dokümanında açıkça işaretlendi, sessizce kural
daraltılmadı.

### Permission kodları

Yeni bir permission catalogue girdisi eklenmedi. Yalnızca mevcut privilege
ceiling ret kodu setine `PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED` eklendi.

### Audit davranışı

Başarı/ret/hata olayları audit'leniyor; metadata yalnızca actorUserId,
targetUserId, sonuç, statik neden kodu ve (break-glass için) `eventId`
içeriyor. Parola/hash/token/OTP/recovery code hiçbir zaman audit'e
yazılmıyor — bu, ayrı bir mutasyon kontrolüyle doğrulandı (aşağıda).

### Test sonuçları

- `pnpm --filter api exec tsc --noEmit` — temiz.
- `pnpm --filter api exec jest platform --runInBand` — 16 suite / 898 test,
  hepsi geçti.
- `./scripts/check.sh --skip-docker` — PASS (exit 0). API 53 suite / 1490
  test, web 8 dosya / 117 test. Q-ENV01 nedeniyle `NODE_PATH` +
  `TURBO_ENV_MODE=loose` workaround'u kullanıldı (bu task'la ilgisiz,
  önceden bilinen ortam kusuru).
- **4 zorunlu mutasyon kontrolü** manuel çalıştırıldı, sonrasında dosyalar
  geri yüklendi:
  1. Eş-yönetici kısıtı kaldırılınca → 4 test kırıldı.
  2. Break-glass actor/token kontrolü kaldırılınca → 7 test kırıldı.
  3. Audit'e credential sızdırılınca → 1 test kırıldı.
  4. Son-yönetici koruması kaldırılınca → 1 test kırıldı.

Gate ilk çalıştırmalarda bu ortamda bilinen exit-137/kaynak tükenmesi
kesintileri yaşadı (görevle ilgisiz). Gerçek scrypt hash'leme kullanan yeni
testler eşzamanlı yük altında Jest'in varsayılan 5s zaman aşımını aştığı için
yalnızca bu spec dosyasına `jest.setTimeout(20_000)` eklendi (kontrol
atlanmadı, gerçek hash doğrulaması korundu).

### Kalan açık riskler / doğrulanamayan gerçek ortam kontrolleri

- Break-glass hiçbir zaman gerçek bir DB/HTTP ortamına karşı çalıştırılmadı;
  yalnızca statik erişilemezlik kanıtları (kaynak-grep testleri) ve mock'lu
  senaryo testleriyle doğrulandı.
- Break-glass için hız sınırlama (rate-limit) altyapısı kurulmadı —
  süreçler-arası durum tutan bir mekanizma bu task kapsamında güvenli
  şekilde sağlanamadığı için implementasyon yerine operasyonel açık madde
  olarak bırakıldı (karar paketi §14.10'da listelendi).
- Gerçek üretim ortamında geçmiş audit kayıtları gözden geçirilmedi.
- MFA doğrulaması bu task'ta tam entegre edilmedi; entegrasyon noktası
  tanımlandı, tam uygulama TASK-027.48'e bırakıldı.
- Peer sistem yöneticisi demotion boşluğu (yukarıda belirtildi) — ayrı bir
  karar/görev gerektiriyor.

Gerçek secret/parola/connection string rapora veya repoya yazılmadı, gerçek
production'a bağlanılmadı, Git commit/push yapılmadı. Nihai `done` kararı
AI1'e bırakılmıştır; bir sonraki görev (TASK-027.48 vb.) AI1'in açık
talimatı olmadan başlatılmayacaktır.

---

# TASK-027.47: Second source comparison

## Amaç

İkinci kaynak ve zaman eşleştirmeyi uygula.

## Wave ve bağımlılık

TASK-027.34; TASK-027.46

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
