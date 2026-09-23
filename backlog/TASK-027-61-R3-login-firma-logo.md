---
id: TASK-027.61-R3
title: Login Formunda Metnex_Firma Görseli Kullanımı
status: done
srs_refs: []
parent_task: TASK-027.61
parent_epic: EPIC-004
updated_at: 2026-09-23
---

# TASK-027.61-R3: Login Formunda Metnex_Firma Görseli Kullanımı

## Durum

done

## Amaç

Login ekranında kullanıcı adı ve parola alanlarının üstünde yer alan eski form logosunun kaldırılması, yerine repo kökündeki `Metnex_Firma.png` görselinin kopyalanıp (`apps/web/public/brand/metnex-firma.png`) görünür, çerçeveye sığacak ve dengeli şekilde kullanılması ve "Platform foundation starter" altyazısının kaldırılması.

## Yapılan Değişiklikler ve Kararlar

### 1. Asset Kopyalama ve Koruma
- Repo kökündeki kaynak dosya `/Metnex_Firma.png` (1268×730 px, RGBA PNG) orijinal haliyle korundu; silinmedi ve üzerine yazılmadı.
- Repository standartlarına uygun küçük harfli hedef yoluna kopyalandı: `apps/web/public/brand/metnex-firma.png` (birebir byte-identical kopya).

### 2. Login Formu Logo Güncellemesi (`apps/web/src/app/login/page.tsx`)
- `LoginPage` form başlığındaki eski `BrandLogo variant="full"` (metnex-logo.png) kullanımı kaldırıldı.
- Yerine `BrandLogo variant="firma"` (metnex-firma.png) entegre edildi ve yüksekliği `height={120}` px seviyesine büyütüldü.
- `BrandLogo` bileşeni `VARIANT_ASSET['firma']` tanımıyla 1268×730 en-boy oranından genişliği otomatik hesapladı (`Math.round((1268 / 730) * 120) = ~208 px`).
- Form kartı darlıklarında taşmaması için `max-w-full h-auto object-contain` sınıfları uygulandı.
- "Platform foundation starter" alt metni kaldırıldı.
- Kullanıcı adı ve parola alanlarından önce formun üst kısmında ortalandı.
- Görsel yüklenemediğinde metin fallback ("Metnex") ve `alt="Metnex"` erişilebilirlik sözleşmesi korundu.

### 3. Kapsam ve Dokunulmayan Alanların Koruması
- **Login Hero Background:** `metnex_png.png` (`/brand/metnex-login.png`) arka plan görseli ve `object-contain` ölçekleme stili kesinlikle değiştirilmedi.
- **Konsol Topbar & Sidebar Logoları:** `console-shell.tsx`, `ConsoleTopbar` (TASK-027.61-R2 kapsamındaki 48 px logosu ve `h-16` dikey hizalaması) ve favicon asset'lerine dokunulmadı.
- **İş Mantığı:** Auth, login ve MFA doğrulama akışları değiştirilmedi.

## Asset Yolu Özeti

- **Kaynak Görsel (Repo Kökü — Değiştirilmedi/Korundu):** `/Metnex_Firma.png`
- **Uygulama Hedef Görseli (Public Brand Asset):** `apps/web/public/brand/metnex-firma.png`

## Değişen ve Eklenen Dosyalar

- `apps/web/public/brand/metnex-firma.png` (yeni asset — `/Metnex_Firma.png` kopyası)
- `apps/web/src/components/brand-logo.tsx` (değişti — `firma` varyantı eklendi)
- `apps/web/src/components/brand-logo.spec.tsx` (değişti — `firma` varyantı unit testi eklendi)
- `apps/web/src/app/login/page.tsx` (değişti — login formunda `variant="firma"` kullanıldı)
- `apps/web/src/app/login/__tests__/page.spec.tsx` (değişti — `metnex-firma.png` kullanım testi eklendi, eski logo kullanımı olmadığını doğrulama)
- `apps/web/src/lib/__tests__/brand-assets.spec.ts` (değişti — `metnex-firma.png` ve kaynak `/Metnex_Firma.png` koruma testi)
- `backlog/TASK-027-61-platform-branding-logo.md` (değişti — R3 revizyon referansı eklendi)
- `backlog/TASK-027-61-R3-login-firma-logo.md` (yeni — R3 task dokümanı)

## Güvenlik ve Kapsam Doğrulaması

- Remote image veya yeni image domain kullanılmadı.
- `dangerouslySetInnerHTML` kullanılmadı.
- Backend, API, DB veya migration değiştirilmedi.
- Login/auth iş mantığı ve MFA akışı değiştirilmedi.
- Topbar logosu ve hero background değiştirilmedi.
- Orijinal `/Metnex_Firma.png` dosyası korundu.
- Docker build/run yapılmadı.
- Git commit/push yapılmadı.

## Kalite Kapısı Doğrulama Kanıtı

`NODE_PATH="$(pwd)/node_modules/.pnpm/node_modules" TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker` komutu ön planda (foreground) çalıştırılmış ve **Exit Code: 0 (PASS)** ile tamamlanmıştır:

- **Web Vitest Suite:** 22/22 dosya, 255/255 test PASS
- **API Jest Suite:** 61/61 dosya, 1651/1651 test PASS
- **TypeScript & Linting:** 0 hata PASS
- **Web & API Build:** Derleme hatasız tamamlandı.
- **Sonuç:** `Tüm kontroller geçti — push için hazır ✓` (Exit Code 0)

## Browser/E2E Doğrulama Raporu

Oturumda grafik arayüzlü tarayıcı / E2E test aracı bulunmadığı için canlı ekran görüntüleri otomatik alınamamıştır.
Tüm bileşenler unit/integration seviyesinde Vitest testleri (`vitest run`), TypeScript statik tip kontrolü (`tsc --noEmit`), Next.js build (`next build`) ve ön planda tamamlanan `./scripts/check.sh --skip-docker` (Exit Code 0) ile doğrulanmıştır.
