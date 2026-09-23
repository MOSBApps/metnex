---
id: TASK-027.61-R1
title: Metnex Logo Görsel Ölçekleme ve Layout Düzeltmesi
status: done
srs_refs: []
parent_task: TASK-027.61
parent_epic: EPIC-004
updated_at: 2026-09-23
---

# TASK-027.61-R1: Metnex Logo Görsel Ölçekleme ve Layout Düzeltmesi

## Durum

done

## Amaç

TASK-027.61 ile eklenen logo entegrasyonunda gözlemlenen ölçekleme ve arka plan kompozisyon sorunlarını gidermek:
1. Login arka plan görselinin (`metnex_png.png`) kırpılmadan tüm kompozisyonu gösterecek şekilde ölçeklenmesi (`object-contain`).
2. Login formunun üstündeki Metnex logosunun büyütülmesi (~1.8x, `height={72}`).
3. Giriş sonrası uygulama sol üstündeki logo alanının büyütülmesi (~1.33x, `height={24}`).

## Yapılan Değişiklikler ve Kararlar

### 1. Login Arka Plan Ölçeklemesi (`apps/web/src/app/login/page.tsx`)
- `metnex_png.png` (`/brand/metnex-login.png`, 1536×1024) görseli için kullanılan `object-cover` stili `object-contain object-center` ile değiştirildi.
- Görselin en-boy oranı (3:2) bozulmadan tam kompozisyonun görüntülenmesi sağlandı.
- Tuval dışındaki boşluklar marka renkleriyle tam uyumlu koyu arka plan `bg-[#060814]` ile dolduruldu.
- `aria-hidden="true"` ve boş `alt` ile dekoratif erişilebilirlik niteliği korundu.

### 2. Login Form Logosu (`apps/web/src/app/login/page.tsx`)
- `BrandLogo variant="full"` yükseklik değeri `height={40}` px'den `height={72}` px'e çıkarıldı (~1.8x büyüme).
- Genişlik 72 × (417/325) = 92.4 px olarak otomatik türetildi.
- Kart genişliğini (`max-w-sm`, 384px) taşırmaması için `max-w-full h-auto` sınıfları eklendi.
- "Platform foundation starter" metni ile arasında `mt-3` dengeli boşluk bırakıldı.
- `BrandLogo` bileşeni sabit asset boyutlarıyla layout shift'i engeller.

### 3. Uygulama Sol Üst Logosu (`apps/web/src/components/glass-console/console-shell.tsx`)
- Gerçekte kullanılan marka alanı olan `ConsoleTopbar` güncellendi (`app-sidebar.tsx` ölü koduna dokunulmadı).
- Masaüstü geniş sidebar (`md:inline-flex`) için `BrandLogo variant="full"` yüksekliği `height={18}` px'den `height={24}` px'e çıkarıldı (~1.33x büyüme, genişlik: 30.8 px).
- Mobil / daraltılmış header (`inline-flex md:hidden`) için `BrandLogo variant="mark"` yüksekliği `height={18}` px'den `height={24}` px'e çıkarıldı (~1.33x büyüme, genişlik: 33.7 px).
- Logoyu taşıyan chip alanının dolgusu ve kontrastı (`bg-[#f8fafc] px-2 py-1 shadow-sm ring-1 ring-black/10 transition-colors hover:bg-white`) güncellendi.
- Topbar yüksekliği (`h-12`) ve breadcrumb hizalaması bozulmadı.

## Ölçü Özeti

| Kullanım Alanı | Varyant | Eski Yükseklik | Yeni Yükseklik | Yeni Genişlik | Büyüme Oranı |
| --- | --- | --- | --- | --- | --- |
| Login Form Logosu | `full` (wordmark) | 40 px | 72 px | ~92.4 px | ~1.80x |
| Sol Üst Topbar (Geniş / Desktop) | `full` (wordmark) | 18 px | 24 px | ~30.8 px | ~1.33x |
| Sol Üst Topbar (Dar / Mobil) | `mark` (logomark) | 18 px | 24 px | ~33.7 px | ~1.33x |

## Değişen ve Eklenen Dosyalar

- `apps/web/src/app/login/page.tsx` (değişti — login hero `object-contain` + logo `height={72}`)
- `apps/web/src/app/login/__tests__/page.spec.tsx` (değişti — R1 ölçekleme sözleşmesi testleri eklendi)
- `apps/web/src/components/glass-console/console-shell.tsx` (değişti — topbar logo `height={24}`)
- `apps/web/src/components/glass-console/console-shell.spec.tsx` (değişti — topbar logo `height={24}` testleri eklendi)
- `backlog/TASK-027-61-platform-branding-logo.md` (değişti — R1 revizyon referansı eklendi)
- `backlog/TASK-027-61-R1-logo-layout-scaling.md` (yeni — R1 task dokümanı)

## Güvenlik ve Kapsam Doğrulaması

- Orijinal logo dosyaları (`metnex_transparent.png`, `metnex_png.png`) ve `public/brand/` görselleri değiştirilmedi/silinmedi.
- Yeni backend endpoint, veritabanı veya migration eklenmedi.
- Auth veya login iş mantığına dokunulmadı.
- Ölü `app-sidebar.tsx` koduna dokunulmadı.
- Docker build/run yapılmadı.
- Git commit/push yapılmadı.

## Kalite Kapısı Doğrulama Kanıtı

`NODE_PATH="$(pwd)/node_modules/.pnpm/node_modules" TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker` komutu foreground olarak çalıştırılmış ve **Exit Code: 0 (PASS)** ile tamamlanmıştır:

- **Web Vitest Suite:** 22/22 dosya, 253/253 test PASS
- **API Jest Suite:** 61/61 dosya, 1651/1651 test PASS
- **TypeScript & Linting:** 0 hata PASS
- **Web & API Build:** `@metnex/web` ve `api` derlemeleri hatasız tamamlandı.
- **Sonuç:** `Tüm kontroller geçti — push için hazır ✓` (Exit Code 0)

## Browser/E2E Doğrulama Raporu

Oturumda grafik arayüzlü tarayıcı / E2E test aracı bulunmadığı için ekran görüntüleri otomatik alınamamıştır.
Tüm bileşenler unit/integration seviyesinde Vitest testleri (`vitest run`), TypeScript statik tip kontrolü (`tsc --noEmit`), Next.js build (`next build`) ve ön planda tamamlanan `./scripts/check.sh --skip-docker` (Exit Code 0) ile doğrulanmıştır.
