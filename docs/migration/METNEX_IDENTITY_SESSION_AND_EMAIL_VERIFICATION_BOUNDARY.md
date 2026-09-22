# Metnex Identity Migration — Session and Email Verification Boundary

> **Durum: Implementation + entegrasyon sınırı dokümantasyonu.**
> Kaynak görev: `backlog/TASK-027-17-...md` (id: `TASK-027.17`, EPIC-004, Wave 0/1, bağımlılık:
> TASK-027.12, TASK-027.13, TASK-027.16 — hepsi done). Bu belge, BOTC identity migration akışının
> (`apps/api/src/migration/botc-identity/`) session/cookie/token/email-verification/self-servis
> parola akışlarına **yanlışlıkla bağımlı hale gelmesini** engelleyen sınırı belgeler ve test eder.
> Motorun mevcut işlevleri (user/role/permission/tenant mapping, password strategy, dry-run/apply)
> **değiştirilmemiştir** — bu belge yalnızca yeni bir sınır ekler, mevcut mantığı yeniden yazmaz.

**Tarih:** 2026-09-18
**Hazırlayan:** AI2 (Engineering Executor)

---

## 1. Neden Bu Sınır Gerekli

Migration motoru kullanıcı, rol, permission ve tenant üyeliği verisi üretir — ama bir kullanıcının
**gerçekten sisteme giriş yapabilmesi** ayrı bir kavramdır (gerçek bir `authSessions` satırı,
gerçek bir refresh token, gerçek bir login akışı gerektirir). Bu iki kavramın karışması,
migration'ın yanlışlıkla bir kullanıcıyı "oturum açmış" gibi davranan bir duruma **sızdırması**
riskini taşır. Bu belge, bu sızıntının **yapısal olarak imkânsız** olduğunu kanıtlar.

## 2. Yeni Eklenen Sınır Bileşeni

| Dosya | Sorumluluk |
|---|---|
| `session-boundary.ts` (yeni) | `scanForSessionOrTokenFields`/`assertNoSessionOrTokenFields` — herhangi bir nesnede (rapor, staging, audit metadata, simulated target state) `session`/`token`/`cookie`/`jwt`/`verificationCode`/`resetLink` desenine uyan bir alan adı arayan, salt-okunur, genel amaçlı bir tarayıcı. `password-boundary.ts`'in (TASK-027.16) credential tarayıcısıyla aynı desende, ayrı bir endişeyi (session/email, credential değil) kapsar. |
| `session-boundary.spec.ts` (yeni) | 8 test — tarayıcının kendisinin deterministik ve doğru çalıştığını doğrular |
| `session-email-governance.spec.ts` (yeni) | 11 test — `MigrationRunService`'i kara kutu olarak ele alan davranışsal + statik testler (bkz. §3) |

`migration-run.service.ts`, `role-template.service.ts`, `permission-mapping.ts`, `tenant-mapping.ts`,
`password-boundary.ts` — **hiçbiri bu task'ta değiştirilmedi** (kapsam madde 8).

## 3. Görev Kapsam Maddesi → Test Eşlemesi

| Kapsam maddesi | Test/kanıt |
|---|---|
| 1 — session/cookie/token üretimi yok | `session-email-governance.spec.ts` "scope item 1" — statik dosya taraması (yorum satırları hariç): `authSessions`, `refreshTokenHash`, `jwt`, `setCookie`, `issueSession`, `AuthService`, `JwtStrategy`, `EmailService`, `MailerService`, `SmsProvider` — hiçbiri yok. Ayrıca `apps/api/src/platform/{auth,jwt,mfa}*`'a hiçbir import yok. |
| 2 — 8 kavramın (authSessions/refresh token/access token/JWT/cookie/otomatik login/email verification token/reset link) bulunmadığı | Statik tarama (yukarıda) + davranışsal tarama (aşağıda, madde 3) |
| 3 — output/staging/audit/simulated target'ta session/credential alanı yok | `session-email-governance.spec.ts` "scope items 2, 3" — gerçek bir `APPLY` çalıştırmasının tüm çıktıları (`DryRunReport`, `stagingStore.all()`, `buildAuditMetadata(...)`, `targetState`'in tüm koleksiyonları) `scanForSessionOrTokenFields` ile taranır, **sıfır** ihlal bulunur. `SimulatedTargetState`'in kendi alan listesi de sabitlenip doğrulanır (`usersByLegacyId`/`tenantMembershipsByUserId`/`roleTemplatesById`/`roleAssignments` — başka hiçbir şey yok). |
| 4 — `RESET_REQUIRED` kullanıcılar: session yok, otomatik login yok, `UNRESOLVED` tenant erişime hazır değil, permission/tenant bypass yok | `session-email-governance.spec.ts` "scope item 4" — her migrate edilen kullanıcının satır şekli sabitlenip doğrulanır (yalnızca `id`/`sourceLegacyId`/`email`/`displayName`/`status`/`passwordStrategies`); `UNRESOLVED` kullanıcı için `tenantMembershipsByUserId`'e hiç yazılmadığı doğrulanır; `DRY_RUN`'ın hiçbir state üretmediği ayrıca doğrulanır. |
| 5 — `ADMIN_ASSIGNED` yalnızca iletişim/operasyon durumu | `session-email-governance.spec.ts` "scope item 5" — `RESET_REQUIRED` kaldırılmadığı, kullanıcı satır şeklinin admin-atanmış/atanmamış kullanıcılar arasında **birebir aynı** olduğu (yalnızca `passwordStrategies` içeriği farklı), `ADMIN_ASSIGNED`'ın tek başına tenant membership/erişim üretmediği doğrulanır. |
| 6 — self-servis akışların migration modülünden ayrıldığı | §4 (aşağıda) + `password-governance.spec.ts`'in "self-service flow scope exclusion" testi (TASK-027.16'dan, hâlâ geçerli/değişmedi) |
| 7 — entegrasyon sınırı dokümanı | Bu belge |
| 8 — motorun mevcut işlevleri değişmedi | `session-email-governance.spec.ts` "scope item 8" — user/role-template/permission/tenant mapping + password strategy + dry-run/apply simulation'ın tek bir uçtan-uca senaryoda birlikte çalıştığı ve idempotent tekrar çalıştırmanın korunduğu doğrulanır (regresyon/smoke testi) |

## 4. Self-Servis Akışların Ayrılığı (kapsam madde 6)

Aşağıdaki özellikler **bu migration modülünün bir parçası değildir ve olmayacaktır** — bu motor
yalnızca kullanıcı/rol/permission/tenant **verisini** taşır, bir kullanıcının bu veriyle nasıl
sisteme gireceğini (gerçek login akışı) **hiç ele almaz**:

| Özellik | Neden bu modülde değil |
|---|---|
| Self-servis e-posta parola sıfırlama | Q-PW01 kararı (TASK-027.12-R1): ilk aşamada admin-driven kanal kullanılacak; self-servis akış **ayrı bir implementation task'ıdır**, henüz numaralandırılmamıştır |
| Email verification (doğrulama e-postası/linki) | Metnex'in bugünkü kod tabanında bu akışın kendisi yok (TASK-027.8'de kod taramasıyla doğrulanmıştı); migration bunu icat etmez |
| `authSessions` migration'ı / session restore | Design doc'un (`METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md` §11) zaten belirttiği gibi, `authSessions`'a migration'ın **hiçbir aşamasında** dokunulmaz — oturumlar yalnızca gerçek login anında oluşur |
| Otomatik login / migration sonrası oturum açma | Migration bir veri dönüştürme işlemidir, bir kimlik doğrulama olayı değildir — kullanıcı migrate edildikten sonra normal login akışından (ki bu akışın kendisi de `RESET_REQUIRED` nedeniyle zorunlu sıfırlamaya yönlendirecektir) geçmelidir |
| SMS/e-posta/dış bildirim provider entegrasyonu | Geçici parolanın iletişimi admin-driven manuel kanaldan yapılır (Q-PW01); otomatik bir bildirim sistemi bu task'ın veya önceki hiçbir Wave 1 task'ının kapsamında değildir |

Gelecekte bu özelliklerden biri eklenmek istendiğinde, bu belge onun **entegrasyon noktasını**
gösterir: migration motoru yalnızca `passwordStrategy = RESET_REQUIRED`/`ADMIN_ASSIGNED` durum
etiketini üretir; gerçek bir self-servis/email akışı bu etiketi **okuyan ayrı bir servis**
olarak inşa edilmelidir, migration motorunun kendisine gömülmemelidir.

## 5. Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → sonuç raporun sonunda
  belirtilmiştir.
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda belirtilmiştir.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı.

## 6. Kalan Riskler / Sonraki Bağımlılık

- Self-servis e-posta reset, email verification, SMS/dış bildirim provider'ı bilerek eklenmedi —
  ayrı, gelecekteki implementation task'larıdır (bkz. §4).
- Gerçek login/oturum akışının migration çıktısını (`passwordStrategy`) nasıl tüketeceği hâlâ ayrı
  bir implementation kararı gerektirir.
- Q-PW01 değiştirilmedi; Q-ID01, Q-P02, Q-T01, Q-SC01 hâlâ açık/kapsam dışı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.
