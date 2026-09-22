---
id: TASK-027.37
title: Customer ROOT Provisioning UI
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te "Hourly analysis engine" Wave 5 placeholder'ıydı (`TASK-027-37-hourly-analysis-engine.md`). AI1 talimatıyla kapsam **Customer ROOT Provisioning UI** olarak yeniden tanımlandı; saatlik analiz motoru **yapılmadı**. Talimattaki teslim dosya adı (`…customer-root-provisioning-ui.md`) mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI2 Teslim Raporu (2026-09-21)

### Backend sözleşmesi (koddan okundu, alan uydurulmadı)
`POST /api/v1/platform/saas/customers/provision`, `PLATFORM:CUSTOMER:PROVISION`, HTTP 201. DTO (`ProvisionCustomerDto`): `companyName`, `companySlug?`, `packageId`, `adminEmail`, `adminDisplayName`, `adminPassword`, `notes?`. Yanıt: `{ customerRootTenant{id,name,slug,type}, tenantAdmin{id,email,displayName}, subscription{…, resourcePackage} }`. Paketler: `GET /api/v1/platform/saas/packages` (`PLATFORM:PACKAGE:VIEW`).
**Bulgu:** DTO düz TypeScript `interface`; **ValidationPipe yok** ve `hashPassword` parola politikası uygulamıyor → backend bugün gerçek bir alan/parola doğrulaması yapmıyor (yalnızca paket/e-posta/slug varlık kontrolleri). Frontend doğrulamaları bu yüzden tek koruma katmanı; **parola politikası kararı gerekli (Q-DP19)**. Frontend'in 12 karakter minimum + tekrar alanı geçici, PO onaylı olmayan bir varsayımdır.
**Bulgu:** Başarılı yanıt schema/registry durumu alanı içermez; API yalnızca `ensureSchemaProvisioned` başarılıysa 201 döner. UI "Veri Alanı Durumu: Hazır"ı bu çıkarımla gösterir (ayrı bir durum alanı uydurulmadı).

### Uygulama
- `apps/web/src/lib/customer-provision.ts` (yeni, saf mantık): form doğrulama (ad, slug biçimi, aktif paket listede mi, yönetici adı, e-posta, parola ≥12 + eşleşme), `buildProvisionPayload` (yalnızca DTO alanları; `type`/yetenek/parola-tekrarı yok; boş slug/notes gönderilmez, slug **üretilmez**), `describeProvisionError`, `summarizeProvisionResult` (beyaz liste; parola/hash yanıtta olsa bile düşer), `runProvision` (çift submit koruması, başarıda formu tamamen boşaltır, başarıda ve "yarım kalmış olabilir" hatalarında listeyi yeniler).
- `apps/web/src/components/customer-provision-modal.tsx` (yeni): "Müşteri Provision Et" modalı; paketler tenants sayfasının zaten yüklediği aktif paket listesinden gelir (hardcoded paket/slug yok); `type="password"` + `autoComplete="new-password"`; submit sırasında düğme kilitli; başarısızlıkta girdiler korunur; başarıda müşteri/tenant türü/yönetici/paket-abonelik/veri alanı durumu gösterilir, parola gösterilmez ve state sıfırlanır; diyalog kapanınca form (parola dahil) temizlenir; formda Q-DP17 uyarısı kalıcı görünür.
- `tenants/page.tsx`: header'a "Müşteri Provision Et" (birincil) düğmesi, "Yeni Alt Tenant" ikincil; modal `onProvisioned={loadTenants}` ile listeyi yeniler. Alt tenant formu, liste/filtre/sıralama/detay akışları değişmedi. Alt tenant formundaki yönlendirme notu artık düğmeyi adıyla anıyor.

### Hata mesajları (hepsi statik/güvenli; şema adı, DB metni, parola, gövde gösterilmez)
`SCHEMA_PROVISIONING_FAILED`, 5xx ve ağ hatası → "müşteri kaydı oluşmuş olabilir, veri alanı hazırlığı tamamlanmamış olabilir; **aynı bilgilerle tekrar denemeyin** (e-posta/slug çakışması alırsınız), listeyi kontrol edin ve yöneticiye bildirin" (**Q-DP17 gizlenmedi**); `SCHEMA_ARCHIVED`, `REGISTRY_STATE_CONFLICT` → sabit dostu mesajlar; düz 409/400/404 → kısa backend mesajı (e-posta/slug kullanımda, paket yok); `ROOT_PROVISIONING_REQUIRED` → teknik olmayan mesaj; 401/403 → yetki mesajı (yetki kararı backend'de; frontend'e izin mantığı taşınmadı, mevcut 401 oturum davranışı `api.ts`'de korunur); bilinmeyen → genel mesaj.
Not: Q-DP17 nedeniyle kullanıcı, yarım kalan müşteri için bu UI'dan **düzeltme/retry yapamaz** (kapsam dışı; FAILED ROOT retry açık).

### Testler
`apps/web/src/lib/customer-provision.spec.ts` (yeni, **37 test**): zorunlu alanlar/format/parola/paket doğrulaması; DTO payload'ı ve endpoint; `type: ROOT`/yetenek alanı yok; çift submit (tek istek, ikinci `busy`, koruma serbest kalır); başarıda liste yenileme ve formun/parolanın temizlenmesi; başarısızlıkta girdiler korunur; hata sonrası liste yenileme yalnızca "yarım kalmış olabilir" durumlarında; yenileme hatası başarıyı bozmaz; localStorage/sessionStorage/console yazımı yok (çalışma zamanı casus testi + kaynakta `localStorage|sessionStorage|console.|location|URLSearchParams|analytics` yok); SCHEMA_PROVISIONING_FAILED/SCHEMA_ARCHIVED/409/5xx/ağ/401-403/fallback mesajları; sayfa entegrasyonu ve stil sözleşmesi.
**`pnpm --filter web exec vitest run`: 7 dosya / 100 test PASS** (önceki 6/63). Web `tsc --noEmit` temiz.
**`./scripts/check.sh --skip-docker`: PASS** (api 41 suite / 626 test; web 7 dosya / 100 test). İlk çalıştırma **gerçek bir lint hatası** verdi (benim eklediğim `"` karakterleri, `react/no-unescaped-entities`); düzeltildi ve yeniden çalıştırıldı.

### Q-ENV01 geçici workaround (açıkça)
Web lint bu kurulumda hâlâ `eslint-plugin-react-hooks` çözümleme sorunu nedeniyle doğrudan çalışmıyor. Gate **yalnızca bu çalıştırma için** `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker` ile koşturuldu; repo/env dosyası değişmedi, hiçbir kontrol atlanmadı. Kalıcı çözüm yapılmadı (kapsam dışı).

### Doğrulanamayanlar
- **Tarayıcıda/dev sunucusunda elle deneme yapılmadı** (tarayıcı aracı ve çalışan backend+DB yok); jsdom/testing-library yok → bileşen render testi yok. Modal davranışı saf mantık testleri + statik kaynak testleriyle kanıtlandı; "form çalışıyor" iddiası **çalışma zamanında doğrulanmamıştır**.
- Parola sızıntısı yüzeyleri (storage/URL/console/analytics) kaynak ve çalışma zamanı testleriyle denetlendi; tarayıcı eklentileri/DevTools ağ sekmesi gibi dış yüzeyler denetlenemez. Parola HTTPS üzerinden yalnızca istek gövdesinde gider.

### Açık (AI1/PO)
Q-DP18 bu UI ile **kod düzeyinde karşılandı (kapanış AI1'de)**; Q-ENV01, Q-DP17(a)(c), Q-DP04, dev ROOT backfill açık; **yeni Q-DP19:** backend'de provision DTO/parola politikası doğrulaması yok.

**Yapılmayanlar:** backend değişikliği, Q-DP17 atomiklik, FAILED ROOT retry, data-plane, Vardiya, SQL Server, Q-ENV01 kalıcı çözüm, Wave 2/3, Docker, git commit/push, gerçek DB/secret.
`status: done` — Customer ROOT Provisioning UI teslimi AI1 tarafından onaylandı.

## AI1 Onayı (2026-09-21)

TASK-027.37 kabul edildi ve `done` olarak kapatıldı. UI, gerçek provisioning
DTO'suna uygun alanları kullanıyor; paketleri mevcut API listesinden alıyor;
çift submit'i engelliyor; parolayı kalıcı depolama/log/URL'ye yazmıyor; başarı
ve hata akışlarında form/list davranışını güvenli yönetiyor.

Q-DP18 kod düzeyinde karşılandı. Q-DP19 (backend ProvisionCustomerDto ve parola
politikasının doğrulanmaması) ayrı backend güvenlik task'ına devredildi ve açık
kalır. Q-DP17, Q-DP04, Q-ENV01 ve dev ROOT backfill de açık durumdadır.
Tarayıcı/gerçek backend doğrulaması yapılmadığı için bu onay test tabanlı UI
teslim onayıdır.

---

# TASK-027.37: Hourly analysis engine

## Amaç

Saatlik normalize analiz dataset’i üret.

## Wave ve bağımlılık

TASK-027.35

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
