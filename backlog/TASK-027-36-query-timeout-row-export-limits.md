---
id: TASK-027.36
title: Platform Tenant UI ROOT Provisioning Boundary
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Hourly analysis" benzeri Wave 5 placeholder'ıydı (dosya adı: `TASK-027-36-*`). AI1'in talimatıyla kapsam **platform tenant UI ROOT provisioning sınırı** olarak yeniden tanımlandı; **Vardiya ekranları ve Wave 5 analiz işleri yapılmadı**.
> Orijinal placeholder en altta tarihi kayıt olarak korunmuştur. Talimattaki teslim dosyası adı ile mevcut dosya adı farklıydı; aynı ID için ikinci dosya açılmadı.

## AI2 Teslim Raporu (2026-09-21)

### Uygulanan seçenek: 2 (yalnızca child/STANDARD form + zorunlu üst tenant)
- **Seçenek 1/3 (provisioning akışına yönlendirme/CTA) uygulanamadı — kanıt:** web'de `POST platform/saas/customers/provision` (`provisionCustomer`) çağıran **hiçbir ekran yok** (`grep` boş); `/system/packages` sayfası yalnızca paket tanımlar ve abonelikleri listeler. Var olmayan bir "Müşteri Provision Et" ekranına link vermek kullanıcıyı yine yanlış yere yönlendirirdi; sahte CTA eklenmedi.
- `apps/web/src/app/(platform)/system/tenants/page.tsx`: "Yeni Tenant" → **"Yeni Alt Tenant"**; form artık **zorunlu "Üst Tenant" seçimi** ister (yalnızca aktif ROOT/STANDARD tenantlar, PLATFORM_ROOT yok; modal açılırken `GET platform/tenants?status=ACTIVE` ile yüklenir, tek aday varsa ön-seçilir); istek gövdesi yalnızca `{ parentId, name, slug? }`; eski "ilk kayıt otomatik ROOT olur" metni kaldırıldı ve müşteri (kök tenant) oluşturmanın bu formdan yapılamadığı açıkça yazıldı; hata mesajı modal içinde, sayfanın mevcut rose/dark hata stiliyle gösterilir.
- Yeni `apps/web/src/lib/tenant-create.ts`: `eligibleParentTenants`, `buildChildTenantPayload` (parent seçili ve aday listesinde değilse istek **kurulmaz**; `type`/yetenek alanı gönderilmez), `describeTenantCreateError`.
- **Hata mesajları:** `ROOT_PROVISIONING_REQUIRED` → teknik olmayan Türkçe açıklama ("Yeni müşteri (kök tenant) bu formdan oluşturulamaz…"); 401/403 → yetki mesajı; 400/404/409 kısa backend doğrulama mesajları (ör. slug çakışması) korunur; 5xx/uzun/boş/ağ hatası/bilinmeyen → güvenli genel mesaj (iç ayrıntı sızmaz).
- `apps/web/src/app/(platform)/system/page.tsx`: "Paket ve Provisioning" kartının **yanıltıcı** metni ("yeni müşteri root tenant provisioning işlemlerini başlat") gerçeği yansıtacak şekilde düzeltildi ("Paketler ve Abonelikler — paketleri tanımla ve müşteri aboneliklerini izle"); işlev değişmedi.
- **Backend değişmedi**; doğrulama kaldırılmadı; izin/tenant-scope kontrolü frontend'e taşınmadı; secret/token/bağlantı bilgisi yok.

### Testler
`apps/web/src/lib/tenant-create.spec.ts` (yeni, **26 test**): aday listesi (PLATFORM_ROOT/askıda/arşiv dışlanır, ada göre sıralı); payload yalnızca `parentId/name/slug` (ROOT/type/yetenek alanı yok, gizli alan sızdırılamaz); boş/bilinmeyen/platform parent için istek kurulmaz; ad zorunlu; hata eşlemesi (ROOT_PROVISIONING_REQUIRED kullanıcı dostu, 401/403, 400/404/409 mesajı, 5xx/uzun/boş/ağ/düz Error/string/undefined → güvenli fallback, secret sızmaz);
sayfa statik sözleşmesi (her istek builder'dan geçer, elle gövde/`type: ROOT`/yetenek alanı yok, zorunlu Üst Tenant `<select required>`, eski ROOT vaadi yok, liste/filtre/sıralama/detay akışları korunur, var olmayan provizyon ekranına link yok, `app-input-dense`/`app-button-primary-dense` ve rose+dark hata stili korunur).
**`pnpm --filter web exec vitest run`: 6 dosya / 63 test PASS** (önceki 5/37 → +1 dosya, +26 test). Web'de bileşen render testi altyapısı (jsdom/testing-library) **yok**; yeni bağımlılık eklenmedi, form davranışı saf yardımcı + statik sayfa sözleşmesi testleriyle kanıtlandı.

### Doğrulanamayanlar / dikkat (AI1)
1. **Tarayıcıda/dev sunucusunda elle deneme yapılmadı:** tarayıcı aracı yok ve form çalışan backend+DB ister; UI davranışı yalnızca tip/lint/test/build ile doğrulandı ("UI çalışıyor" iddiası değil).
2. **Web lint ortam sorunu (önceden var, bu task'la ilgisiz):** `pnpm --filter web lint` bu kurulumda **gerçekte çalışamıyor** — `eslint-plugin-react-hooks` `apps/web`'den çözümlenemiyor (`node_modules/.modules.yaml`: `publicHoistPattern: []`, `nodeLinker: isolated`; `@eslint/eslintrc` FlatCompat eklentiyi proje dizininden arar). `check.sh` web lint'i şimdiye kadar **turbo cache replay**'i (eski `openmas` yolundan) ile "geçiyordu"; web kaynağım değişince cache düştü ve hata ortaya çıktı.
   Kodun lint temiz olduğunu **yalnızca bu çalıştırma için** `NODE_PATH=node_modules/.pnpm/node_modules` ve `TURBO_ENV_MODE=loose` ortam değişkenleriyle doğruladım (`No ESLint warnings or errors`); repo/ortam dosyası değiştirilmedi, kontrol atlanmadı/zayıflatılmadı. Kalıcı çözüm (ör. web'e `eslint-plugin-react-hooks` devDependency'si veya `public-hoist-pattern`) bağımlılık düzenini değiştirir → **AI1 kararı (yeni Q-ENV01)**.
3. **Eksik özellik (yeni Q-DP18):** müşteri (ROOT) provizyonu için **web ekranı yok**; backend yolu (`platform/saas/customers/provision`, `PLATFORM:CUSTOMER:PROVISION`) yalnızca API'den kullanılabilir. Ekran gerekiyorsa ayrı task (paket seçimi, yönetici e-postası/şifresi/adı, abonelik notu; şifre politikası ve secret hijyeni gerekir).
4. Q-DP17 (atomiklik/FAILED ROOT retry), Q-DP04, dev ROOT backfill kapsam dışı kaldı ve açık.

**Yapılmayanlar:** Vardiya ekranları/API, data-plane migration, ROOT provisioning backend değişikliği, Q-DP17 kararı, FAILED ROOT retry, tenant backfill, Docker build/run, Wave 2/3, git commit/push. Backend güvenlik sınırı ve izin/scope kontrolü korundu.
**Doğrulama:** `./scripts/check.sh --skip-docker` **PASS** (api **41 suite / 626 test**, web **6 dosya / 63 test**, typecheck/lint/build) — web lint için yukarıdaki ortam yardımıyla (madde 2).

### Durum
`status: done` — UI sınır düzeltmesi AI1 tarafından onaylandı.

## AI1 Onayı (2026-09-21)

TASK-027.36 kabul edildi ve `done` olarak kapatıldı. Platform tenant formu artık
yalnızca parent seçilmiş STANDARD/child tenant oluşturuyor; `type: ROOT` veya
yetenek alanı gönderilmiyor, PLATFORM_ROOT listelenmiyor ve ROOT provisioning
hatası kullanıcı dostu gösteriliyor.

Q-DP18 (müşteri ROOT provisioning ekranı gerekip gerekmediği) ayrı karar olarak
açık bırakıldı. Q-ENV01 (web lint bağımlılık çözümleme sorunu) pre-existing ortam
borcu olarak açık kaldı; bu task içinde bağımlılık düzeni değiştirilmedi.

---

# TASK-027.36: Query timeout row export limits

## Amaç

Timeout, satır, dosya ve concurrency limitlerini uygula.

## Wave ve bağımlılık

TASK-027.34

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
