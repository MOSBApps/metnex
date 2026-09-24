---
id: TASK-027.73-R4
title: Development CSV Fixture Tenant Scope Bridge
status: done
parent_epic: EPIC-004
related: [TASK-027.73-R3, TASK-027.72-R1, TASK-027.73-R1]
updated_at: 2026-09-24
---

# TASK-027.73-R4: Development CSV Fixture Tenant Scope Bridge

## Durum
done (AI1 onayı, 2026-09-24)

## Sorun
`TenantScopeService.resolve()` customer root için ACTIVE schema registry arıyor; yerel geliştirme veritabanında yok ⇒ `SCADA_SCOPE_DENIED` ("Erişim yok"), fixture ekranı bloklanıyor.

## Teslim edilen
- **`api/dev-fixture-scope-resolver.ts`** (`DevFixtureScopeResolver`, `isDevFixtureScopeBridgeEnabled`): yalnız `tenants` tablosunu **okur** (2 `select`: tenant + customer root); insert/update/delete/execute/DDL/registry/closure/membership yok (kaynak taraması testle sabit). Kurallar: bilinmeyen tenant, ACTIVE olmayan tenant, `PLATFORM_ROOT`, `customerRootId` yok, customer root yok / pasif / `PLATFORM_ROOT` ⇒ reddedilir. Scope = **yalnız tenant'ın kendisi** (`dataScopeTenantIds:[tenantId]`; `canAggregateChildren` kayıttan okunur ama child eklenmez — onaylı aggregate kuralı yok; closure sorgusu yok; başka root'a erişim yok). `schemaName` = `'@dev-scope-bridge'` (fiziksel schema gibi görünmeyen iç işaret; response'a çıkmaz, SQL/search_path üretmez) + `devScopeBridge: true`.
- **Etkinlik kapısı (dört koşul):** `NODE_ENV=development` **ve** `REPORTING_DEV_FIXTURES=true` **ve** `REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=true` (tam olarak `true`) **ve** geçerli IANA `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE`. Aksi halde `SCADA_DEV_SCOPE_RESOLVER` tokenı **kayıtlı değildir** ve SCADA API servisi scope'u `TenantScopeService`'ten alır.
- **Composition (`scada-api.providers.ts`):** yalnız SCADA API servisi bridge'i (etkinse) `scopes` olarak alır; `TenantScopeService` genel provider'ı, `TenantScopeModule` ve diğer modüllerin scope davranışı **değişmedi** (`reporting.module.ts` bridge'e hiç değinmez). Registry yokken bridge kapalı ⇒ fail-closed `SCADA_SCOPE_DENIED` (testle kilitli).
- **Guard zinciri aynen:** JWT → MFA → tenant header → membership → `REPORT:ARTIFACT:VIEW`; bridge bunlardan **sonra**, serviste çalışır; tenant id yalnız guard'lı `X-Tenant-Id` başlığından gelir (gövdedeki `tenantId/customerRootTenantId/isSystemAdmin/dataScopeTenantIds` `SCADA_REQUEST_UNKNOWN_FIELD` ile reddedilir, scope çözümlemesi hiç başlamaz). Fixture kaynakları caller tenant'a eşli kalır; yeni mapping üretilmez.
- **`dev.sh` / `scripts/dev-fixture-env.sh`:** üçüncü değişken `REPORTING_DEV_FIXTURE_SCOPE_BRIDGE` (öncelik: export > mevcut `.env` > varsayılan `true`; `false` korunur; güvensiz değer reddedilir); başlangıç mesajı `Development CSV fixture scope bridge: enabled|disabled` (tenant listesi/DB/schema/CSV/credential yazdırılmaz). Production/Docker'a eklenmez.
- Runbook §9.2, `.env.example`. **Web:** kod değişmedi (bridge açıkken keşif başarılı, "Erişim yok" görünmez; kapalıyken mevcut güvenli hata durumları).

## Testler
`dev-fixture-scope-bridge.spec.ts` (33): 11 kapı koşulu (production, test, flag'ler, "TRUE", dilim yok/geçersiz/ofset) ⇒ kayıtsız; kapı açıkken servis scope kaynağı; STANDARD/ROOT scope, 8 ret durumu, boş id, başka tenant'a genişlememe; yalnız-okuma (yazma yok, kaynak taraması); registry yokken bridge kapalı `SCOPE_DENIED` / açık katalog+query+compare gerçek fixture CSV'ye ulaşır, yazma yok, response'ta `schemaName`/DB/SQL/yol yok; preset ucu güvenli; gövde tenant/root yükseltmesi; başka root kaynakları listelenmez; guard zinciri ve modül dokunulmazlığı. Ek: `dev-fixture-environment.spec.ts` (29) üçüncü değişkeni kapsar; `scada-manifest-semantics.spec.ts` gerçek CSV'yi bridge scope'uyla sunar (snapshot yoksa atlanır); web: keşif başarılıyken "Erişim yok" yok. Toplam: api 3138/3138 (106 suite), web 293/293.

## Mutasyon kontrolleri (uygulandı, geri alındı, `cmp` ile doğrulandı — hepsi testleri kırdı)
Production'da bridge (6) · bridge flag kontrolünü kaldırma (4) · dilim kontrolünü kaldırma (3) · pasif tenant kabulü (2) · PLATFORM_ROOT kabulü (1) · customer root kontrolünü kaldırma (3) · normal production scope'unu gevşetme (7; ilk denemede derleme hatalıydı ⇒ geçersiz sayıldı, tür-güvenli yeniden yapıldı) · registry tablosuna yazma (8) · schema DDL (5) · permission (2) / MFA (2) / membership (2) guard bypass · gövde tenant id'sini scope yapma (1) · başka root kaynaklarını listeleme (2) · bridge kapalıyken dev scope (1).

## Doğrulama
`pnpm --filter api exec tsc --noEmit` ve `--filter web` temiz; api `jest src` 106 suite / 3138 test; web `vitest run` 25 dosya / 293 test; eslint hata yok; `./scripts/check.sh --skip-docker` yeşil; `bash -n dev.sh` geçerli. Docker, SQL Server/PostgreSQL, migration, production verisi kullanılmadı; git commit/push yok.
**Manuel `pnpm dev`/tarayıcı doğrulaması yapılamadı** (Docker gerekir; çalışan sunuculara ve mevcut `apps/api/.env`'e dokunulmadı). Adımlar: `./dev.sh` yeniden çalıştırın **veya** `.env`'e `REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=true` (+ R3'ün iki değişkeni) ekleyin, API'yi yeniden başlatın; Raporlar → SCADA Saatlik/Günlük Analiz → kaynak → doğrulanmış seri → aralık → Analiz Çalıştır. Kullanıcının **membership + `REPORT:ARTIFACT:VIEW`** yetkisi hâlâ gereklidir (bridge bunları atlamaz).

## Açık nokta
Bkz. Q-W540 (open-questions).

## AI1 Onayı ve Q-W540 Kararı (2026-09-24)
`done`. Q-W540: local kullanıcı **otomatik oluşturulmayacak**; membership, MFA ve `REPORT:ARTIFACT:VIEW` mevcut yerel bootstrap/tenant yönetimi üzerinden sağlanır; scope bridge bu kontrolleri bypass etmez; kullanıcıda üyelik/permission yoksa "Erişim yok" beklenen davranıştır.
