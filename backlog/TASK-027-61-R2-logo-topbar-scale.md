---
id: TASK-027.61-R2
title: Uygulama Topbar Logosunu İki Kat Büyütme
status: done
srs_refs: []
parent_task: TASK-027.61
parent_epic: EPIC-004
updated_at: 2026-09-23
---

# TASK-027.61-R2: Uygulama Topbar Logosunu İki Kat Büyütme

## Durum

done

## Amaç

Giriş yaptıktan sonra uygulama ekranının sol üstünde yer alan Metnex konsol topbar logosunun mevcut ölçüsünün iki katına çıkarılması (24 px → 48 px) ve görünürlüğünün artırılması.

## Yapılan Değişiklikler ve Kararlar

### 1. Topbar Logo Yükseklikleri (`apps/web/src/components/glass-console/console-shell.tsx`)
- **Geniş Masaüstü Görünümü (`hidden md:inline-flex`):** `BrandLogo variant="full"` yüksekliği **24 px**'den **48 px**'e çıkarıldı (2.0x büyüme, genişlik: **62 px**).
- **Daraltılmış / Mobil Görünüm (`inline-flex md:hidden`):** `BrandLogo variant="mark"` yüksekliği **24 px**'den **48 px**'e çıkarıldı (2.0x büyüme, genişlik: **67 px**).
- Sabit açık renkli chip (`bg-[#f8fafc] px-2 py-1 shadow-sm ring-1 ring-black/10 transition-colors hover:bg-white`) korunarak açık ve koyu konsol temalarında yüksek kontrast sağlandı.

### 2. Topbar Layout ve Dikey Hizalama (`apps/web/src/components/glass-console/console-shell.tsx`)
- Topbar sabit yüksekliği `h-12` (48 px) varsayılanından `h-16` (64 px) seviyesine artırıldı. Böylece 48 px yüksekliğindeki logo chip'i ve 64 px topbar dikey olarak merkezlendi (`items-center`).
- Mobil drawer ve backdrop top konumu `top-12`'den `top-16` seviyesine çekilerek topbar ile dikey çakışmasız hizalandı.
- Masaüstü sidebar (`md:static md:inset-auto`) `flex min-h-0 flex-1` container yapısı sayesinde topbar yüksekliğindeki artışa otomatik ve temiz olarak uyum sağladı.
- Breadcrumb (`min-w-0 flex-1 items-center overflow-hidden truncate`), hamburger butonu, tenant switcher, bildirim ikonu, kullanıcı menüsü ve tema toggle bileşenlerinin dikey ortalanması ve okunabilirliği korundu.

### 3. Login Ekranı Koruması (`apps/web/src/app/login/page.tsx`)
- Login ekranındaki form logosu (`height={72}`) ve hero arka planı (`object-contain`) kesinlikle değiştirilmedi/dokunulmadı.
- Yalnızca giriş sonrası konsol shell topbar logo alanı güncellendi.

## Ölçü Değişim Özeti

| Kullanım Alanı | Asset / Varyant | R1 Yüksekliği | R2 Yüksekliği | R2 Genişliği | Büyüme Oranı |
| --- | --- | --- | --- | --- | --- |
| **Sol Üst Topbar (Geniş / Desktop)** | `metnex-logo.png` (`full`) | 24 px | 48 px | ~62 px | **2.0x** |
| **Sol Üst Topbar (Dar / Mobil)** | `metnex-mark.png` (`mark`) | 24 px | 48 px | ~67 px | **2.0x** |
| **Topbar Yüksekliği (`header`)** | CSS class | `h-12` (48 px) | `h-16` (64 px) | N/A | Dikey hizalama için |

## Değişen Dosyalar

- `apps/web/src/components/glass-console/console-shell.tsx` (değişti — topbar logo `height={48}` + header `h-16` + sidebar `top-16`)
- `apps/web/src/components/glass-console/console-shell.spec.tsx` (değişti — 48px logo yüksekliği ve topbar layout testleri)
- `backlog/TASK-027-61-platform-branding-logo.md` (değişti — R2 revizyon referansı eklendi)
- `backlog/TASK-027-61-R2-logo-topbar-scale.md` (yeni — R2 task dokümanı)

## Güvenlik ve Kapsam Doğrulaması

- Login ekranı logosu (`height={72}`) ve arka plan ölçüleri değiştirilmedi.
- Orijinal kaynak görselleri (`metnex_transparent.png`, `metnex_png.png`) değiştirilmedi.
- Ölü `app-sidebar.tsx` dosyasına dokunulmadı.
- Auth, backend, DB, API, permission kodlarına dokunulmadı.
- Docker build/run yapılmadı.
- Git commit/push yapılmadı.

## Kalite Kapısı Doğrulama Kanıtı

`NODE_PATH="$(pwd)/node_modules/.pnpm/node_modules" TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker` komutu foreground olarak çalıştırılmış ve **Exit Code: 0 (PASS)** ile tamamlanmıştır:

- **Web Vitest Suite:** 22/22 dosya, 253/253 test PASS
- **API Jest Suite:** 61/61 dosya, 1651/1651 test PASS
- **TypeScript & Linting:** 0 hata PASS
- **Web & API Build:** Derleme hatasız tamamlandı.
- **Sonuç:** `Tüm kontroller geçti — push için hazır ✓` (Exit Code 0)

## Browser/E2E Doğrulama Raporu

Oturumda grafik arayüzlü tarayıcı / E2E test aracı bulunmadığı için canlı ekran görüntüleri alınamamıştır.
Tüm bileşenler unit/integration seviyesinde Vitest testleri (`vitest run`), TypeScript statik tip kontrolü (`tsc --noEmit`), Next.js build (`next build`) ve ön planda tamamlanan `./scripts/check.sh --skip-docker` (Exit Code 0) ile doğrulanmıştır.
