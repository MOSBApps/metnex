# Metnex Identity Migration — Security Test Matrix

> **Durum: Implementation + güvenlik test matrisi dokümantasyonu.**
> Kaynak görev: `backlog/TASK-027-20-...md` (id: `TASK-027.20`, EPIC-004, Wave 0/1, bağımlılık:
> TASK-027.12–027.19). Bu belge, `apps/api/src/migration/botc-identity/` altındaki identity
> migration motoru, dry-run CLI ve reconciliation akışının güvenlik/tenant-izolasyon/permission/
> credential sınırlarını doğrulayan **tüm** test dosyalarının konsolide envanteridir. Bu task
> **hiçbir production davranışını değiştirmedi** — yalnızca test ve dokümantasyon üretti.

**Tarih:** 2026-09-18
**Hazırlayan:** AI2 (Engineering Executor)

---

## 1. Yeni Bu Task'ta Eklenen

`apps/api/src/migration/botc-identity/security-tenant-isolation.spec.ts` (33 test, 9 kategori) —
tek bir dosyada konsolide edilmiş güvenlik regresyon paketi. Bu dosya mevcut testleri **tekrar
üretmez**; öncelik daha önce **hiçbir yerde test edilmemiş** özellikleri kapatmaktır:

- **Kritik bulgu:** `apps/api/src/migration/botc-identity/cli/` alt dizini, TASK-027.13/16/17'de
  yazılan hiçbir statik bağımlılık taramasında (`readdirSync` çağrıları özyinelemeli değildi)
  **hiç taranmamıştı** — `dry-run-cli.ts`, `dry-run-cli-entry.ts`, `reconcile-cli-entry.ts` gerçek
  SQL Server/PostgreSQL/session/email bağımlılığı içerip içermediği açısından **doğrulanmamıştı**.
  Bu task'ta özyinelemeli bir tarayıcı (`collectProductionSourceFiles()`) yazıldı ve `cli/`
  dizininin gerçekten tarandığı bir sanity-check testiyle kanıtlandı (§9.1). Sonuç: **temiz** —
  hiçbir ihlal bulunamadı, ama bu artık **varsayım değil, kanıttır**.
- Wave 2/Wave 3 permission'larının role template'e asla erişim kodu olarak girmediğinin doğrudan
  testi (önceden yalnızca genel "unmapped" testleri vardı, Wave 2/3'e özel isim testi yoktu).
- Üç ayrı onaylı tenant'ın (MOSB/MOSEDAŞ/MOSBİO) her birinin kendi kullanıcısına **yalnızca**
  kendi tenant'ını verdiğinin ve **hiçbir çapraz sızıntı olmadığının** açık testi.
- Bir kullanıcının permission grant'lerinin başka bir kullanıcının role template'ine asla
  karışmadığının (permission izolasyonu, kullanıcılar-arası) doğrudan testi.

---

## 2. Konsolide Güvenlik Test Matrisi

| # | Kategori | Kanonik test dosyası (`security-tenant-isolation.spec.ts` + kaynak) |
|---|---|---|
| 1 | Tenant isolation | §1 (bu dosya, yeni) + `tenant-governance.spec.ts`, `tenant-coverage.spec.ts` |
| 2 | Conflict security | §2 (bu dosya, yeni) + `tenant-governance.spec.ts` ("tenant conflict access gate"), `duplicate-detection.spec.ts`, `reconciliation.spec.ts` ("scenario 8") |
| 3 | Permission isolation | §3 (bu dosya, yeni — Wave 2/3 özel) + `permission-governance.spec.ts`, `permission-mapping.spec.ts`, `role-template.service.spec.ts` |
| 4 | Root tenant / aggregate | §4 (bu dosya) + `tenant-governance.spec.ts` ("root tenant / aggregate non-expansion"), `session-email-governance.spec.ts` |
| 5 | Password security | §5 (bu dosya) + `password-governance.spec.ts`, `password-boundary.spec.ts` |
| 6 | Session/email security | §6 (bu dosya) + `session-email-governance.spec.ts`, `session-boundary.spec.ts` |
| 7 | Dry-run security | §7 (bu dosya, `--apply` argv-parser testi yeni) + `cli/dry-run-cli.spec.ts`, `cli/dry-run-cli-entry.spec.ts` |
| 8 | Reconciliation security | §8 (bu dosya) + `reconciliation.spec.ts` |
| 9 | Statik dependency boundary | §9 (bu dosya, **özyinelemeli — `cli/` dahil, yeni**) + diğer dosyalardaki (özyinelemesiz) eşdeğerleri |

---

## 3. Tenant İzolasyonu Kanıtı

`security-tenant-isolation.spec.ts` §1: MOSB/MOSEDAŞ/MOSBİO kullanıcılarının her biri **yalnızca**
kendi tenant'ına ait tek bir membership satırı alır (`toEqual([{ userId, tenantSlug }])` ile tam
eşitlik, "en azından içeriyor" değil); mapping tablosunda olmayan kullanıcı `UNRESOLVED`; bir
kullanıcının çakışması başka bir kullanıcının zaten çözülmüş atamasını **etkilemez**
(`user1` conflict'e düşerken `user2`/`user3` değişmeden kalır) — bu, TASK-027.15-R1'in güvenlik
düzeltmesinin kullanıcı-bazlı izolasyonunu doğrudan kanıtlar.

## 4. Permission İzolasyonu Kanıtı

`security-tenant-isolation.spec.ts` §3: Wave 2 (`CanCreateTicket`) ve Wave 3 (`CanCreateDof`)
izinleri, `UserPermission` olarak verilse bile **hiçbir** role template'in `permissionCodes`
listesine girmez (boş dizi kalır, sistematik olarak); bir kullanıcının izinleri başka bir
kullanıcının template'ine karışmaz (`user1`→`SHIFT:REPORT:UPDATE`, `user2`→
`REPORT:HOURLY_CONSUMPTION:VIEW`, çapraz sızıntı yok); onaylı 5 kodun **tamamı** kullanılsa bile
üretilen her template'in permission kodu yalnızca bu 5 kodun bir alt kümesidir.

## 5. Conflict Davranışı

Bkz. `security-tenant-isolation.spec.ts` §2 ve `docs/migration/METNEX_IDENTITY_MIGRATION_RECONCILIATION.md`.
Özet: FATAL raporlanır, membership asla yazılmaz, tekrar çalıştırma erişim üretmez, düzeltilmiş
mapping ile tek geçerli membership oluşur, üçüncü/fabrik bir tenant değeri asla üretilmez.

## 6. Password/Session Sınırları

Bkz. `security-tenant-isolation.spec.ts` §5-6. Özet: `RESET_REQUIRED` her zaman zorunlu taban;
`ADMIN_ASSIGNED` yalnızca ek bayrak, tekrar çalıştırmalarda kaybolmaz (TASK-027.16'da bulunup
düzeltilen davranış, burada regresyon testi olarak korunuyor); gerçek credential/session alanı
hiçbir çıktıda yok (programatik tarama, varsayım değil).

## 7. Statik Dependency Tarama Sonucu

`security-tenant-isolation.spec.ts` §9 — **özyinelemeli** tarama, `apps/api/src/migration/botc-identity/`
altındaki **tüm** `.ts` dosyalarını (`cli/` dahil, `fixtures/` JSON hariç) kapsar:

| Kontrol | Sonuç |
|---|---|
| Gerçek SQL Server client (`mssql`/`tedious`) | Temiz |
| Gerçek PostgreSQL/Drizzle writer (`db.module`/`db.service`/`pg`/`drizzle-orm`) | Temiz |
| `authSessions`/JWT/session/cookie üretimi | Temiz (yalnızca `password-boundary.ts`/`session-boundary.ts` kendi tarayıcı mantıklarında bu terimleri **isim olarak** anar, hariç tutuldu) |
| Email/SMS provider (`EmailService`/`MailerService`/`SmsProvider`) | Temiz |
| `Sirket` tenant mapping kaynağı olarak okunuyor mu | Temiz (yalnızca `types.ts`'in alan tanımında adı geçer) |
| Wave 2 (`MaintenanceRecord`/`FaultRecord`/`TicketService`) | Temiz |
| Wave 3 (`DofUser`/`DOF_APP`) | Temiz |
| `--apply` argv-parser tarafından tanınıyor mu | Hayır (her iki CLI giriş noktasında da böyle bir dal yok) |

---

## 8. Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → sonuç raporun sonunda
  belirtilmiştir.
- `./scripts/check.sh --skip-docker` → sonuç raporun sonunda belirtilmiştir.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı — tüm
  fixture'lar sentetiktir.

## 9. Kalan Riskler / Sonraki Bağımlılık

- Q-ID01, Q-T01, Q-S03, Q-P02 hâlâ açık/kapsam dışı; bu task hiçbirine dokunmadı.
- Bu test paketi motorun **mevcut** davranışını doğrular — gerçek bir SQL Server adapter'ı veya
  gerçek PostgreSQL apply katmanı yazıldığında, bu güvenlik testlerinin **o katmanlar için de**
  ayrıca genişletilmesi gerekecektir (bu task'ın kapsamında değildir).
- Production kodu yalnızca yeni test/dokümantasyon dosyalarından oluşuyor; motorun/CLI'ın/
  reconciliation'ın mevcut hiçbir dosyası değiştirilmedi.
