---
id: TASK-029.13
title: Dark Theme Combobox Contrast ve Dropdown Görünümü
status: done
parent_epic: null
related: []
updated_at: 2026-09-29
---

# TASK-029.13: Dark Theme Combobox Contrast ve Dropdown Görünümü

## AI1 Onayı (2026-09-29)
`done`. Doğru yapılanlar: repository discovery gerçek bileşenleri doğrulamış; SearchableSelect,
native select, checkbox/radio dark tema sorunları düzeltilmiş; light tema korunmuş; dropdown
dynamic loading davranışı değişmemiş; yeni component/API/permission/bağımlılık eklenmemiş; UI
Contract semantic stilleri korunmuş; web testleri/typecheck/`check.sh --skip-docker` geçmiş;
tarayıcı doğrulamasının yapılmadığı açıkça raporlanmış. `colors.md`'deki "dark mode desteklenmez"
ifadesi ve tablo satır seçimindeki `bg-brand/5` kullanımı bu task'ın dışında bırakıldı — ayrı UI
bakım task'ları olarak değerlendirilecek.

## Durum
done (AI1 onayı, 2026-09-29). UI düzeltme — backend/DB yok, yeni bağımlılık yok, API sözleşmesi
değişmedi.

## Repository Discovery (bulgular)

- **`SearchableSelect`** (`apps/web/src/components/searchable-select.tsx`) — tek gerçek
  "combobox" bileşeni; portal/popover değil, panel inline (normal document flow'da), zaten
  `bg-surface`/`text-ink`/`hover:bg-surface-subtle` gibi semantic token'lar kullanıyor.
- **`FilteredCheckboxList`** adında ayrı bir component **repoda yok**. Fonksiyonel eşdeğeri:
  SCADA analiz panellerindeki inline çoklu-seçim checkbox listeleri (ör. `scada-catalog-panel.tsx`
  "Seriler" bölümü, `scada-virtual-column-panel.tsx`, `report-analysis-client.tsx`). Bunlar ayrı
  bir component değil, doğrudan `<input type="checkbox">` kullanıyor.
- **Native `<select>`** kullanımı: `scada-virtual-column-panel.tsx`, `scada-preset-panel.tsx`,
  `scada-source-mapping-panel.tsx`, `scada-catalog-panel.tsx`, `report-analysis-client.tsx`,
  `tenant-switcher.tsx`, `customer-provision-modal.tsx`, `system/{tenants,roles,users}/page.tsx`,
  `admin/users/page.tsx`, `glass-console/primitives.tsx` — hepsi `app-input`/`app-input-dense`
  semantic class'ını kullanıyor.
- **Portal/popover ile açılan dropdown yok** — repoda `createPortal`/`Portal` kullanımı sıfır.
  Bu nedenle "panel input'un arkasında kaybolması" riski bu kod tabanında yapısal olarak yok.
- Dark tema gerçek bir runtime özelliği (`docs/ui-contract/foundations/colors.md`'nin "karanlık mod
  desteklenmez" ifadesi **güncelliğini yitirmiş** — kod tabanında `ThemeProvider`,
  `.dark` class toggle (`document.documentElement`) ve `globals.css`'te tam bir `.dark` token seti
  zaten mevcut ve production'da kullanılıyor. Bu doküman-kod tutarsızlığı ayrıca not edildi, bu
  task'ın kapsamında düzeltilmedi çünkü colors.md güncellemesi ayrı bir governance kararı
  gerektirir).

## Bulunan Kontrast Hataları (kanıt: `apps/web/src/app/globals.css`)

1. **Native `<select>` açılır listesi (`<option>`) için hiçbir dark stil tanımlı değildi.**
   `.dark` bloğu `select`'in kapalı kutusunu (`background-color`/`color`/`color-scheme: dark`)
   doğru şekilde koyulaştırıyordu, ama `<option>` öğelerine hiç dokunmuyordu — tarayıcıya bağlı
   olarak açılan liste bazı durumlarda tarayıcının varsayılan (açık) renklerini kullanabiliyordu.
2. **`<input type="checkbox">` / `<input type="radio">` dark override'dan tamamen hariç
   tutulmuştu** (`:not([type="checkbox"]):not([type="radio"])` deseni onları özellikle dışarıda
   bırakıyor) ve hiçbir `accent-color`/`color-scheme` tanımı yoktu — "Seriler" gibi checkbox
   tabanlı seçim listelerinde kutucuklar karanlık panelin üzerinde işletim sistemi varsayılanı
   (açık/beyaz) kare olarak kalıyordu.
3. **`SearchableSelect`'te seçili seçenek vurgusu `bg-brand/5 text-brand`** — %5 opaklıktaki
   marka rengi koyu `surface` tokenının üzerinde pratik olarak görünmüyor (aynı desen
   `bg-brand/5`, tenant/kullanıcı tablo satırı seçiminde de tekrarlanıyor ama bu task yalnız
   combobox/dropdown kapsamındaki `SearchableSelect`'i kapsıyor; tablo satırı seçimi ayrı bir
   component kategorisi ve bu task'ın kapsamı dışında bırakıldı).

## Yapılan Düzeltmeler

- `apps/web/src/app/globals.css`:
  - `@layer base`'e `input[type="checkbox"], input[type="radio"] { accent-color: var(--brand); }`
    eklendi (her iki temada tutarlı, semantic `brand` token'ından).
  - `.dark` override bloğuna:
    - `& input[type="checkbox"], & input[type="radio"] { color-scheme: dark; }` — tarayıcının
      kutunun kendisini (işaretsiz haldeki border/dolgu) koyu tema chrome'uyla çizmesi için.
    - `& select option { background-color: #181e2a; color: #f1f5f9; }` ve
      `& select option:disabled { color: #64748b; }` — native açılır listenin koyu surface
      token'ıyla eşleşmesi için (Chromium/Firefox `<option>` stilini destekler).
- `apps/web/src/components/searchable-select.tsx`: seçili seçenek artık
  `bg-brand/15 font-semibold text-brand` (opaklık üçe katlandı + kalınlık ikinci bir ayırt edici
  sinyal — renk tek başına anlam taşımıyor kuralına uyum); hover'a ek olarak
  `focus-visible:bg-surface-subtle focus-visible:outline-none` eklendi (klavye/erişilebilirlik
  odak durumu artık açıkça görünür).
- Light tema hiçbir yerde değiştirilmedi — yalnız `.dark` bloğu ve (tema-bağımsız) `accent-color`
  eklendi; `accent-color` light temada da brand rengini kullanır, bu görsel bir gerileme değil
  (önceden tarayıcı varsayılan checkbox rengi kullanılıyordu, şimdi marka rengi — UI Contract'ın
  "hardcoded Tailwind rengi yasak" kuralına aykırı değil çünkü CSS custom property (`var(--brand)`)
  kullanılıyor, hardcoded hex değil).

## Yeni Combobox Component'i Oluşturulmadı
Mevcut `SearchableSelect` ve native `<select>`/`<input type="checkbox">` düzeltildi; yeni bir
bileşen eklenmedi. `// @ui-override` gerektiren bir sapma yok.

## Dropdown Dynamic Loading Policy
Değiştirilmedi. `SearchableSelect`'in debounce (300ms), minChars, race-condition koruması
(`requestIdRef`) ve loading/error/empty ayrımı davranışı hiç dokunulmadan korundu — yalnızca
görsel class'lar değişti.

## Testler

- `apps/web/src/components/searchable-select.spec.tsx` (yeni, 4 test):
  panel/seçenek listesinin semantic token kullandığını ve hardcoded gray/white kullanmadığını,
  seçili seçeneğin `bg-brand/5`'ten daha güçlü bir vurguyla + `font-semibold` ile ayırt
  edildiğini, hover/`focus-visible` state'lerinin açıkça stillendiğini, boş/min-char durumunun
  `text-ink-muted` kullandığını doğrular.
- `apps/web/src/app/globals.dark-theme.spec.ts` (yeni, 5 test): `globals.css`'i ham metin olarak
  okuyup native `<select>` `<option>` dark stilini, disabled option okunabilirliğini,
  `color-scheme: dark`'ın select/input'a uygulandığını, checkbox/radio `accent-color` ve
  `color-scheme: dark` kurallarının varlığını doğrular (Tailwind jsdom'da derlenmediği için
  component testiyle doğrulanamayan CSS-seviyesi kurallar, repodaki diğer statik-içerik testleriyle
  aynı yöntemle doğrulandı).
- Tarayıcıda manuel görsel doğrulama **yapılmadı** (kullanıcının dev server'ı başlatılmadı/
  durdurulmadı — standing kısıt). Bu, review durumunun bir parçası olarak açıkça belirtilir;
  AI1/PO'nun tarayıcıda görsel onayı önerilir.

## Sınırlar (uygulandı)
Backend değiştirilmedi; yeni permission eklenmedi; API sözleşmesi değişmedi; yeni bağımlılık
eklenmedi; rapor analiz iş mantığına dokunulmadı; gerçek DB/Docker kullanılmadı; git commit/push
yapılmadı.

## Doğrulama
- `pnpm --filter web exec vitest run`: **397/397** (31 dosya) — önceki 388'den 397'ye çıktı (9 yeni
  test).
- `pnpm --filter web exec tsc --noEmit`: temiz.
- `./scripts/check.sh --skip-docker`: yeşil (ilk denemede backend'deki
  `reporting.jasper-integration.spec.ts` testi 5s timeout ile flake verdi — izole çalıştırıldığında
  6/6 yeşil; web/UI değişikliğiyle ilgisi yok; ikinci `check.sh` çalıştırması tamamen yeşil).

## Kapsam Dışı / Ayrı İş Notu
- `docs/ui-contract/foundations/colors.md`'nin "karanlık mod desteklenmez" ifadesi kod tabanının
  gerçek durumuyla çelişiyor; bu doküman güncellemesi ayrı bir governance/AI1 kararı gerektirir,
  bu task kapsamında yapılmadı.
- Tenant/kullanıcı tablolarındaki satır seçim vurgusu da aynı `bg-brand/5` desenini kullanıyor
  (`system/tenants`, `system/users`, `admin/tenants`, `admin/users`) — bu, "combobox/dropdown"
  kapsamının dışında (tablo satırı seçimi), ayrı bir task adayı olarak not edilir.
