---
id: TASK-024.1-R1
title: Tam Metnex Rename Tarihsel Referans Politikası
status: done
srs_refs: []
parent_epic: EPIC-003
updated_at: 2026-09-17
---

## AI1 Onayı (2026-09-17)

AI1, bu politika belgesini inceleyip onayladı. PROGRESS_LOG.md kararı: **Seçenek A** —
geçmiş kayıtlar append-only kuralı nedeniyle korunacak, dosyanın sonuna bir "Metnex Rename
Cutover" kaydı eklenecek; cutover sonrasında aktif dosya adlarında, runtime'da, deployment'ta,
kullanıcıya görünen metinlerde ve yeni PROGRESS_LOG kayıtlarında eski-ad/ESKI-AD/EskiAd
kullanılmayacak. `AIS_DEMO_PACKAGE` migration immutability gerekçesiyle istisna olarak
onaylandı (marka referansı değil). Status `review` → `done`.

# TASK-024.1-R1: Tam Metnex Rename Tarihsel Referans Politikası

## Bulunan Sorun

TASK-024.1 tesliminde AI2, önceki oturumda farklı bir bağlamda (rename kararından önce)
kurulmuş "DEC-\* ve PROGRESS_LOG.md geçmiş kayıtları değiştirilemez" governance kuralını
sorgusuzca Metnex rename kapsamına da uygulayıp 9 kalemi "DEĞİŞTİRİLMEYECEK" olarak
işaretlemişti. Bu, AI1'in "aktif repository içeriğinde eski-ad/ESKI-AD/EskiAd adı
kalmayacak" kesin kararıyla doğrudan çelişiyordu ve AI2 bu çelişkiyi AI1'e taşımadan
sessizce eski kuralı uygulamıştı.

## Yapılan Analiz ve Düzeltme

`docs/rename/METNEX_HISTORICAL_REFERENCE_POLICY.md` oluşturuldu. Her kalem tek tek yeniden
değerlendirildi ve iki farklı risk türü ayrıştırıldı: **ürün adı/marka riski** (rename'e engel
değil — kararın içeriğini bozmaz) ile **kayıt bütünlüğü riski** (yalnızca bir logun o anki
sistem durumunu birebir kaydettiği, gerçek çakışma barındıran durumlar).

### Sonuç: 9 kalemden 8'i kapsama alındı

| Kalem | Eski sınıf | Yeni sınıf |
|---|---|---|
| DEC-0007, DEC-0008, DEC-0009, DEC-0012, DEC-0013 (5 dosya) | DEĞİŞTİRİLMEYECEK | **KAPSAMA ALINDI** — karar içeriği/tarih/ID değişmez, yalnızca ürün adı metni güncellenir; DEC-0007'nin dosya adı da (`...-eski-ad-...` → `...-metnex-...`) rename edilecek |
| `DEPRECATED_MODULES.md` — `demo.admin@eski-ad.local` | DEĞİŞTİRİLMEYECEK | **KAPSAMA ALINDI** — sentetik/placeholder örnek veri, gerçek bir olayın birebir logu değil |
| `ODC_AI2_ONBOARDING_PROMPT.md` | DEĞİŞTİRİLMEYECEK (hatalı sınıflandırma) | **KAPSAMA ALINDI** — bu bir tarihi kayıt değil, canlı/aktif onboarding talimatı; yalnızca `doganzorlu/eski-ad` harici repo referansı ayrı açık soru olarak kaldı (gerçek hedef repo adı bilinmediği için kör rename edilemez) |

### Gerçek istisna olarak kalan tek kalem

`apps/api/drizzle/migrations/0002_thick_earthquake.sql` — `AIS_DEMO_PACKAGE`: Bu "eski-ad"
markasıyla ilgili değil ("AIS" prefix'i), zaten kaldırılmış Demo Operations'a ait işlevsiz bir
sabit, ve migration dosyaları proje genelinde immutable kabul ediliyor (veritabanı tutarlılığı
riski). İstisnanın gerekçesi isim politikası değil, migration immutability kuralı.

### Koşullu istisna — gerçek governance çakışması, AI1 kararı bekleniyor

`docs/opendevcon/PROGRESS_LOG.md`'nin **geçmiş girdileri**: append-only bütünlük kuralı
(`AGENT_BOOTSTRAP.md`) ile zero-tolerance hedefi burada gerçekten çakışıyor. AI2 bunu tek
taraflı çözmedi; iki somut seçenek sundu:

- **Seçenek A (önerilen):** Geçmiş girdiler hiç değiştirilmez (append-only korunur); rename
  uygulandığında dosyanın sonuna tek bir "Rename Cutover" girdisi eklenir, bu tarihten sonraki
  tüm yeni girdiler yalnızca "Metnex" kullanır.
- **Seçenek B:** Mevcut dosya byte-for-byte `PROGRESS_LOG_ARCHIVE_PRE_METNEX_2026-09-17.md`
  adıyla arşivlenir, `PROGRESS_LOG.md` sıfırdan "Metnex" ile devam eder — canlı dosyada literal
  sıfır "eski-ad" bayt'ı kalır.

### Dosya adı rename kapsamının teyidi

AI1'in belirttiği `METNEX_STATE.md`, `docs/project/METNEX_*.json` (5 dosya),
`METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` zaten TASK-024.1 ana envanterinde kapsama alınmıştı;
bu task'ta her biri için **aynı anda güncellenmesi zorunlu çapraz referans listesi** çıkarıldı
(`AGENT_BOOTSTRAP.md`, tüm `backlog/TASK-*.md` dosyalarındaki path referansları — bu
referansların güncellenmesi geçmiş kararın içeriğini değil yalnızca kırık bir bağlantıyı
düzeltir, dolayısıyla istisna değildir).

## Yeni Kesin Tarama Sonucu

Bu task yalnızca politika/sınıflandırma içerir; hiçbir dosya adı veya içeriği değiştirilmedi,
bu yüzden ham `rg -c -i 'openmas|aiskeleton' ...` sonucu TASK-024.1 ile birebir aynı: **147
dosya, 572 geçiş**. Değişen, bu geçişlerin sınıflandırmasıdır — rename kapsamına alınan geçiş
sayısı ~538'den ~555'e çıktı; gerçek istisna 1 dosyada sabit kaldı; yalnızca
`PROGRESS_LOG.md`'nin geçmiş girdileri AI1 kararını bekleyen koşullu istisna olarak kaldı.

## Kabul Kriterleri Karşılama

| Kriter | Durum |
|---|---|
| İstisna listesi kaldırıldı veya açık PO kararıyla yeniden sınıflandırıldı | ✅ — 9 kalemden 8'i kapsama alındı, gerekçeli |
| Aktif dosya adı/içeriğinde eski-ad/ESKI-AD/EskiAd kalmaması hedeflendi | ✅ — yalnızca 1 gerçek istisna (migration SQL, marka-dışı) |
| PROGRESS_LOG.md geçmiş kayıtları için somut mekanizma belirtildi | ✅ — 2 seçenek sunuldu, öneri yapıldı, nihai karar AI1'e bırakıldı |
| ODC_AI2_ONBOARDING_PROMPT.md ve deprecated kayıt örnekleri yeniden değerlendirildi | ✅ — ikisi de kapsama alındı |
| Yeni kesin tarama sonucu raporlandı | ✅ — 147 dosya/572 geçiş (değişmedi, sınıflandırma değişti) |
| Gerçek rename işlemi henüz yapılmadı | ✅ — bu task salt politika, TASK-024.2+ bekliyor |
| Git commit/push yapılmadı | ✅ |

## Değiştirilen/Eklenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `docs/rename/METNEX_HISTORICAL_REFERENCE_POLICY.md` | Yeni |
| `backlog/TASK-024-1-R1-metnex-historical-reference-policy.md` | Yeni |
| `docs/opendevcon/METNEX_STATE.md`, `docs/opendevcon/PROGRESS_LOG.md` | Güncellendi |

## Kalan Açık Karar

`docs/opendevcon/PROGRESS_LOG.md`'nin geçmiş girdileri için Seçenek A mı Seçenek B mi
uygulanacak — bu netleşmeden TASK-024.2 (veya PROGRESS_LOG.md'yi etkileyecek herhangi bir
rename adımı) başlatılmamalı. Diğer tüm kalemler için AI2 önerisi nettir, ek karar gerekmez.
