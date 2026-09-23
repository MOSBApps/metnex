---
id: TASK-027.61
title: Metnex Platform Branding ve Logo Entegrasyonu
status: done
srs_refs: []
parent_epic: EPIC-004
updated_at: 2026-09-23
---

# TASK-027.61: Metnex Platform Branding ve Logo Entegrasyonu

## Durum

done

## Amaç

Metnex marka görsellerini web uygulamasına erişilebilir, responsive ve tema
uyumlu şekilde entegre etmek.

## Teslim notu (2026-09-23, AI2)

### Keşif

`apps/web/public` dizini hiç yoktu, `apps/web/src/app/icon.png`/favicon da yoktu.
Gerçek app router kökü `apps/web/src/app` (task metnindeki `apps/web/app/icon.png`
yolu değil — proje sözleşmesine uyarlandı, task'ın kendisi buna izin veriyor).
Login ekranı `apps/web/src/app/login/page.tsx` — sade `app-page`/`app-card`
token'larını kullanıyor, ayrı bir header/hero bileşeni yok. Sidebar/topbar için
**iki** bileşen bulundu: `apps/web/src/components/app-sidebar.tsx` (hiçbir yerde
import edilmiyor, ölü kod — dokunulmadı) ve gerçekte render edilen
`ConsoleShell`/`ConsoleTopbar`/`ConsoleSidebar` (`apps/web/src/components/console-shell.tsx`
+ `apps/web/src/components/glass-console/console-shell.tsx`, `(app)/layout.tsx`
ve muhtemelen `(platform)/layout.tsx` üzerinden render ediliyor). Bu ikinci
sistemin kendi bağımsız açık/koyu tema sistemi var (`GlassConsoleRoot`,
`glass-console.css`) — root `ThemeProvider`'dan (login/genel UI) ayrı.
Önemli bulgu: `globals.css`'te `.dark { & .bg-white { background-color: #181e2a } }`
kuralı var — `bg-white` utility'sini koyu temada otomatik olarak koyu bir renge
çeviriyor; bu nedenle logo arkasındaki "her zaman açık" chip için `bg-white`
**kullanılamadı**, `bg-[#f8fafc]` (arbitrary value, bu remap'e yakalanmıyor)
kullanıldı.

Ayrıca masaüstünde "daraltılmış sidebar" diye ayrı bir state (ikon-rail modu)
mevcut değil — sidebar/topbar sadece iki responsive duruma sahip: `md+` (statik
sidebar + `md:w-52` marka alanı) ve `<md` (mobil, off-canvas drawer + hamburger).
**Varsayım (açıkça belirtiliyor):** "Geniş sidebar'da yazılı logo / daraltılmış
sidebar'da logomark" gereksinimi, yeni bir collapse-to-icon-rail özelliği
eklemeden (kapsam dışı — yeni state/etkileşim eklemek "branding" görevinin
ötesine geçer), mevcut `md` kırılma noktasına eşlendi: `md+` → yazılı logo,
`<md` (mobil/dar) → logomark. Bu aynı zamanda "Header ve mobil görünüm"
maddesini de karşılıyor (tek bir responsive marka alanı, iki görsel).

### Asset üretimi (türetme varsayımları açıkça belirtiliyor)

Kaynak dosyalar repo kökünde: `metnex_transparent.png` (417×325, RGBA, yazılı
logo + logomark bir arada) ve `metnex_png.png` (1536×1024, RGBA, koyu hero
görseli). **İkisi de değiştirilmedi, silinmedi — orijinal halleriyle repo
kökünde duruyor.**

Üretilen dosyalar (`apps/web/public/brand/`, `apps/web/src/app/icon.png`),
`node-canvas` (zaten `apps/web/package.json`'da devDependency — TASK-027.55'ten
beri PNG export testleri için kullanılıyordu; **yeni bir bağımlılık
eklenmedi**) ile tek seferlik bir betikle üretildi (betik geçicidir, teslimde
repoda bırakılmadı):

- **`metnex-logo.png`**: `metnex_transparent.png`'nin birebir (byte-identical)
  kopyası — kırpma/yeniden kodlama yok.
- **`metnex-login.png`**: `metnex_png.png`'nin birebir kopyası.
- **`metnex-mark.png`**: **türetildi** — ayrı bir logomark-only kaynak dosyası
  verilmediği için, `metnex_transparent.png`'nin alfa kanalı satır/sütun
  bazında taranarak logomark ile yazılı "Metnex" metni arasındaki boşluk satırı
  bulundu (y≈178–204 arası neredeyse tam saydam), logomark'ın sıkı bounding
  box'ı (`x:74,y:2,w:257,h:175`) 14px saydam kenar boşluğuyla kırpıldı (final:
  285×203, RGBA, saydam arka plan).
- **`app/icon.png`**: aynı logomark kırpması, 256×256 kare saydam tuval
  üzerinde ortalanmış (40px toplam kenar boşluğu), favicon'un küçük boyutlarda
  okunaklı kalması için.

Hiçbir asset dosya adında eski marka adı yok (`metnex-logo`/`metnex-mark`/
`metnex-login`/`icon` — doğrulayan test: `brand-assets.spec.ts`).

### Entegrasyon

1. **`apps/web/src/components/brand-logo.tsx`** (yeni, paylaşılan bileşen) —
   `variant: 'full' | 'mark'`, `height` prop'undan asset'in kendi en-boy
   oranıyla `width` türetiyor (layout shift'i önlemek için next/image'a baştan
   sabit boyut veriliyor). Görsel yüklenemezse (`onError`) düz metin "Metnex"
   fallback'ine düşüyor — login ve sidebar/topbar dahil **her** kullanım
   noktasında aynı davranış (hata modu her yerde aynı olduğu için). `unoptimized`
   bilinçli olarak set edildi: bunlar küçük, sabit birkaç boyutta render edilen
   yerel dosyalar — Next'in on-demand image optimizer'ı burada bir fayda
   sağlamıyor, sadece `/_next/image` üzerinden ekstra bir hop ekliyor; ayrıca
   testlerde `src`'in öngörülebilir/sabit kalmasını sağlıyor.
2. **Login (`apps/web/src/app/login/page.tsx`)** — `metnex_transparent.png`
   tabanlı `BrandLogo variant="full"` login formunun başlığında ("Metnex" h1
   yerine); `metnex_png.png` tabanlı `LoginHeroBackground` (dekoratif,
   `aria-hidden="true"` + boş `alt`, `fixed inset-0 -z-10 object-cover`, karartma
   overlay) sayfanın arkasında. Form kartı (`app-card`) zaten opak arka plana
   sahip (`bg-surface`) — hero arkada olsa da form okunabilirliği etkilenmiyor.
   `.app-page`'in kendi `bg-surface-muted` arka planı login route'unda
   `bg-transparent` ile override edildi (global `.app-page` sınıfı değiştirilmedi
   — diğer sayfalar etkilenmiyor). MFA doğrulama ekranı da aynı hero
   arka planını paylaşıyor (görsel tutarlılık), kendi "MFA Doğrulama" başlığı
   task'ın açık isteği olmadığı için değiştirilmedi.
3. **Sidebar/Topbar (`glass-console/console-shell.tsx`)** — marka alanı artık
   bir `Link` (mevcut dashboard route'una: `/system` sayfalarında `/system`,
   diğerlerinde `/app` — breadcrumb'ın kendi mevcut mantığıyla aynı), içinde
   **her zaman sabit açık renkli** bir "chip" (`bg-[#f8fafc]`, `.dark .bg-white`
   remap'inden bilinçli olarak kaçınıldı) üzerinde iki `BrandLogo`: `md+`'de
   yazılı logo görünür/logomark gizli, `<md`'de tersi (CSS breakpoint ile,
   JS state yok — layout shift veya flicker riski yok). Chip'in sabit açık
   arka planı, logo bitmap'inin koyu metin/mark rengiyle açık **ve** koyu
   console temasında da her zaman yeterli kontrastı garanti ediyor (temaya
   göre ayrı bir koyu logo varyantı üretilmedi — bu bir varsayım/kısayol,
   açıkça belirtiliyor).
4. **Favicon/metadata (`apps/web/src/app/layout.tsx`)** — `metadata.icons =
   { icon: '/icon.png' }` eklendi (Next'in kendi dosya-sözleşmesi taraması
   zaten `app/icon.png`'yi otomatik favicon route'u olarak üretiyor —
   `next build` çıktısında `○ /icon.png` olarak doğrulandı — ama build-time
   bir dosya sözleşmesi doğrudan unit-test edilemediği için `metadata.icons`
   de açıkça eklendi, test edilebilir olsun diye). `title`, `description`,
   `lang="tr"`, tema bootstrap script'i **değiştirilmedi**.

### Erişilebilirlik

- Tüm logo kullanımlarında `alt="Metnex"` (next/image `alt` prop'u, `BrandLogo`
  içinde sabit).
- Login hero görseli dekoratif — `aria-hidden="true"` + boş `alt=""`.
- Marka alanı bir `<Link>` — `aria-label="Metnex – panele git"` (sadece görsel
  bir eleman erişilebilirlik ağacında isimsiz kalmasın diye).
- Renk tek başına anlam taşımıyor — logo her yerde `alt` metniyle birlikte.

### Kapsam dışı (bilinçli olarak dokunulmadı)

Tenant branding/logo upload/MinIO entegrasyonu, yeni backend endpoint, migration,
auth davranış değişikliği, yeni permission/rol, Wave 2/3, remote image domain,
`dangerouslySetInnerHTML`, Docker build/run, git commit/push. `app-sidebar.tsx`
(kullanılmayan ölü kod) bilinçli olarak değiştirilmedi — değişikliğin hiçbir
görünür etkisi olmayacaktı, saf gürültü olurdu.

### Testler (yeni, 25 test)

- `apps/web/src/components/brand-logo.spec.tsx` (5) — varsayılan/mark asset
  seçimi, en-boy oranından `width` türetimi, hata halinde metin fallback'i,
  remote URL kullanılmadığı kontrolü.
- `apps/web/src/app/login/__tests__/page.spec.tsx`'e eklenen 4 yeni test —
  logo asset'i kullanılıyor, fallback çalışıyor, hero dekoratif/boş-alt,
  hiçbir görsel remote URL'e işaret etmiyor. (Bu dosyadaki 10 mevcut testin
  tümü de korunup PASS ediyor — bkz. aşağıdaki "Test altyapısı düzeltmesi".)
- `apps/web/src/components/glass-console/console-shell.spec.tsx` (yeni, 4) —
  hem yazılı logo hem logomark aynı anda DOM'da (CSS breakpoint ile
  gizleniyor — jsdom gerçek bir layout motoru olmadığından `@media` sorgularını
  değerlendirmiyor, bu nedenle bu suite görünürlüğü değil, işaretleme
  sözleşmesini test ediyor: iki eleman var, her biri doğru breakpoint sınıfını
  taşıyor, doğru asset'e işaret ediyor — sınırlama teslim notunda açıkça
  belirtiliyor), marka linkinin `/app`'e (varsayılan) ve `/system`'e (platform
  konsolu) doğru yönlendiği, remote URL kullanılmadığı.
- `apps/web/src/app/layout.spec.ts` (yeni, 2) — `metadata.title` ve
  `metadata.icons` kontrolü.
- `apps/web/src/lib/__tests__/brand-assets.spec.ts` (yeni, 6) — dosya sistemi
  seviyesinde: her üretilen asset var ve geçerli bir PNG (PNG imzası
  kontrolü), hiçbir dosya adında eski marka adı yok, **orijinal kaynak
  dosyalar repo kökünde değişmeden duruyor** (üretilen `metnex-logo.png`/
  `metnex-login.png`'nin orijinalleriyle byte-identical olması, orijinallerin
  hâlâ mevcut ve bozulmamış olduğunu da dolaylı olarak kanıtlıyor).

**Test altyapısı düzeltmesi (mevcut testi bozmadan):** `login/__tests__/page.spec.tsx`
sayfa artık bir `<Image>` render ettiği için, next/image'ın dev-mode "duplicate
src" defter tutma mekanizması (`new URL(src, window.location.href)`, ikinci
çağrısı korumasız) her render'da çalışıyor. Testin önceki `window.location`
mock'u `href: ''` ile başlıyordu — gerçek bir tarayıcıda asla olmayacak bir
değer — ve bu, `new URL(relatifSrc, '')` için geçersiz taban URL'i oluşturarak
render'ı çökertiyordu. Düzeltme: mock, gerçek `Location.href` setter
semantiğini taklit eden küçük bir accessor'a (`get/set href`, mevcut URL'e göre
göreli değerleri çözüyor) çevrildi; testlerin "navigasyon olmadı" iddiaları artık
sabit `''` yerine `initialHref` ile karşılaştırılıyor — testlerin gerçekte
kontrol ettiği şey değişmedi, sadece test ortamının tarayıcı gerçeğine daha
sadık olması sağlandı. Mevcut 10 testin tamamı bu düzeltmeden sonra da PASS.

### Doğrulama

- `pnpm --filter web exec vitest run` → 22 dosya, 253 test, hepsi PASS.
- `pnpm --filter web exec tsc --noEmit` → temiz.
- `pnpm --filter web exec next build` → başarılı; `/icon.png` build çıktısında
  statik bir route olarak listelendi (favicon dosya sözleşmesinin gerçekten
  çalıştığının kanıtı).
- `NODE_PATH="$(pwd)/node_modules/.pnpm/node_modules" TURBO_ENV_MODE=loose
  ./scripts/check.sh --skip-docker` (Q-ENV01 workaround ile) → lint, tip
  kontrolü, API 61 suite/1651 test + web 22 suite/253 test, web+api build,
  hepsi PASS. Docker build `--skip-docker` ile atlandı.

**Browser/E2E doğrulaması yapılamadı** — bu oturumda gerçek bir tarayıcı/E2E
aracı yok, ayrıca kullanıcının kendi dev sunucusunu yönetmemem gerektiği
(oturumun standing instruction'ı) nedeniyle görsel olarak açık/koyu tema,
mobil kırılma noktası ve favicon'un gerçek bir sekmede nasıl göründüğü
doğrudan gözlemlenmedi. Statik doğrulama olarak: üretilen PNG'ler (logo, mark,
icon) doğrudan görüntülenerek kırpmanın temiz olduğu teyit edildi; renk/kontrast
mantığı yukarıda açıklandığı gibi CSS token'ları okunarak elle doğrulandı
(`bg-white` remap tuzağı dahil). Kullanıcı isterse kendi ortamında
`/login`, geniş/dar pencere genişliğinde konsol sidebar'ı, açık/koyu tema ve
tarayıcı sekmesindeki favicon'u gözle kontrol edebilir.

### Kullanılan ve oluşturulan tüm asset'ler

- `metnex_transparent.png`, `metnex_png.png` (repo kökü, orijinal, **değiştirilmedi**)
- `apps/web/public/brand/metnex-logo.png` (yeni, `metnex_transparent.png`'nin birebir kopyası)
- `apps/web/public/brand/metnex-mark.png` (yeni, türetildi — logomark kırpması)
- `apps/web/public/brand/metnex-login.png` (yeni, `metnex_png.png`'nin birebir kopyası)
- `apps/web/src/app/icon.png` (yeni, türetildi — logomark, kare tuval)

### Değişen/yeni dosyalar

- `apps/web/src/components/brand-logo.tsx` (yeni)
- `apps/web/src/components/brand-logo.spec.tsx` (yeni)
- `apps/web/src/app/login/page.tsx` (değişti)
- `apps/web/src/app/login/__tests__/page.spec.tsx` (değişti)
- `apps/web/src/components/console-shell.tsx` (değişti — `brandHref` iletimi)
- `apps/web/src/components/glass-console/console-shell.tsx` (değişti)
- `apps/web/src/components/glass-console/console-shell.spec.tsx` (yeni)
- `apps/web/src/app/layout.tsx` (değişti)
- `apps/web/src/app/layout.spec.ts` (yeni)
- `apps/web/src/lib/__tests__/brand-assets.spec.ts` (yeni)
- `apps/web/public/brand/*.png`, `apps/web/src/app/icon.png` (yeni asset'ler)

---

## Revizyon: TASK-027.61-R1

Logo ölçekleme, arka plan kompozisyonu (`object-contain`) ve layout düzenlemeleri `TASK-027.61-R1` kapsamında tamamlanmıştır.
Bkz: [`TASK-027-61-R1-logo-layout-scaling.md`](TASK-027-61-R1-logo-layout-scaling.md)

---

## Revizyon: TASK-027.61-R2

Giriş sonrası konsol topbar logosunun iki kat büyütülmesi (24 px → 48 px) ve dikey layout düzenlemesi (`h-16`) `TASK-027.61-R2` kapsamında uygulanmıştır.
Bkz: [`TASK-027-61-R2-logo-topbar-scale.md`](TASK-027-61-R2-logo-topbar-scale.md)

---

## Revizyon: TASK-027.61-R3

Login formundaki eski form logosunun kaldırılması, yerine kökteki `Metnex_Firma.png` görselinin kopyalanıp (`apps/web/public/brand/metnex-firma.png`) `BrandLogo variant="firma"` ile kullanılması `TASK-027.61-R3` kapsamında uygulanmıştır. Hero background ve topbar logolarına dokunulmamıştır.
Bkz: [`TASK-027-61-R3-login-firma-logo.md`](TASK-027-61-R3-login-firma-logo.md)



