---
id: TASK-024.1
title: Metnex tam rename envanteri ve isim sözleşmesi
status: review
srs_refs: []
parent_epic: EPIC-003
updated_at: 2026-09-17
---

## AI2 Teslim Raporu (2026-09-17)

Teslimat: `docs/rename/METNEX_RENAME_INVENTORY.md` (10 bölüm; task tanımındaki 8 zorunlu
bölüm + Ek/ham tarama çıktısı + teslim özeti).

- **Tarama:** `rg -c -i 'openmas|aiskeleton'` ile 147 dosya / 572 geçiş tespit edildi;
  `node_modules`, `.git` (repo zaten git kontrolünde değil), `.next`, `dist`, `coverage`,
  `target` dışlandı. Dosya/klasör adında `eski-ad` geçen 9 dosya + 2 klasör
  (`services/jasper-renderer/src/{main,test}/java/com/eski-ad`) ayrıca listelendi.
  `eski-urun` adında dosya/klasör bulunmadı (yalnızca içerik referansı, 17 geçiş).
- **Mapping:** Task'taki 9 satırlık üst düzey sözleşme, 41 somut bulgu satırına
  genişletildi (cookie/localStorage adları, DB/MinIO/Docker/Maven/npm kimlikleri, ODC
  dosya adları dahil); tarihi kayıtlar (DEC-0007/8/9/12/13, PROGRESS_LOG geçmiş
  girdileri, DEPRECATED_MODULES.md, migration SQL) açıkça "DEĞİŞTİRİLMEYECEK" olarak
  işaretlendi.
- **En yüksek risk bulguları:** (1) `eski-ad_refresh_token` httpOnly auth cookie'si —
  rename deploy anında tüm aktif oturumları geçersiz kılar; (2) `apps/web/package.json`
  adı ile `apps/web/Dockerfile`'daki iki `--filter @eski-ad/web` satırının atomik
  değişmesi zorunluluğu; (3) `scripts/create-project.sh`/`.ps1`'in kendi `'eski-ad'`
  literal pattern'inin bu projenin markası değil fork-generator mekanizması olması —
  körü körüne rename edilmemesi gerektiği ayrı bir karar maddesi olarak işaretlendi.
- **Rename sırası:** 12 adımlık, düşük riskten (saf dokümantasyon) yüksek riske
  (tarayıcı session state, sunucu/DB/CI) doğru sıralanmış öneri hazırlandı; her adım
  ayrı bir `TASK-024.N` olarak planlanmalı önerisi eklendi.
- **Kapsam:** Bu task'ta hiçbir dosya/klasör/package/DB/deployment adı değiştirilmedi,
  hiçbir veri taşınmadı/silinmedi, git işlemi yapılmadı (zaten git deposu yok), BOTC
  repository'sine dokunulmadı. Gerçek secret/parola/connection string değeri teslim
  dokümanına kopyalanmadı (yalnızca placeholder/dev-default değerlerden bahsedildi).
- **Durum:** `status: review` — nihai `done` kararı AI1'e bırakılıyor (proje genelinde
  daha önce kurulan review→done onay deseniyle tutarlı).

# TASK-024.1: Metnex Tam Rename Envanteri ve İsim Sözleşmesi

## Amaç

Repository, uygulama, deployment, veri ve dokümantasyon katmanlarında kullanılan
`eski-ad`, `ESKI-AD`, `EskiAd` ve türevlerini tespit ederek hedef isimleri
kesinleştirmek. Bu task sonraki rename task'larının güvenli ve eksiksiz kaynağıdır.

## Hedef isim kararı

| Kategori | Hedef |
|---|---|
| Ürün adı | Metnex |
| Repository / klasör | metnex |
| npm scope | `@metnex/*` |
| Docker image prefix | `metnex-` |
| Container / network / stack prefix | `metnex-` |
| Deployment path | `/opt/metnex` |
| PostgreSQL database/user | `metnex` |
| MinIO bucket prefix | `metnex-` |
| Kullanıcı-facing servis adı | Metnex |

## Kapsam

- Tüm proje dosyalarında case-insensitive eski ad taraması.
- Dosya ve klasör adlarında geçen eski adların envanteri.
- `@eski-ad/*`, Docker image/tag, container, network, stack, registry, domain,
  database, user, bucket, path ve environment referanslarının sınıflandırılması.
- `EskiAd` ve eski ürün açıklamalarının tespiti.
- Migration SQL, seed, backup ve deployment etkilerinin ayrıca belirtilmesi.
- Her bulgu için hedef ad, değişiklik yapılacak sonraki task ve risk kaydı.
- Kullanıcı kararı gereği aktif repository içeriğinde eski isim kalmaması hedefi.

## Kapsam dışı

- Bu task'ta dosya, klasör, package, database veya deployment adı değiştirmek.
- PostgreSQL/MinIO verisini taşımak veya silmek.
- Git commit/push veya Git history rewrite.
- BOTC repository'sinde değişiklik yapmak.

## Beklenen teslimat

`docs/rename/METNEX_RENAME_INVENTORY.md` dosyası aşağıdaki bölümleri içermelidir:

1. Tarama yöntemi ve kapsamı.
2. Eski isimlerin dosya ve klasör bazlı tam listesi.
3. Hedef isim mapping tablosu.
4. Runtime/deployment/database etkileri.
5. Rename sırası ve dosya sahipliği.
6. Veri kaybı, downtime, redirect ve geriye dönük uyumluluk riskleri.
7. Rename sonrası doğrulama komutları.
8. Açık sorular ve varsayımlar.

## Kabul kriterleri

| Kriter | Kanıt |
|---|---|
| `eski-ad`, `ESKI-AD`, `EskiAd` ve türevleri taranmış | Envanter + kullanılan komutlar |
| Dosya adı ve içerik referansları ayrı listelenmiş | Envanter tabloları |
| Runtime isimleri ile ürün/branding isimleri ayrıştırılmış | Mapping tablosu |
| PostgreSQL, MinIO, Docker ve deployment etkileri kaydedilmiş | Etki analizi |
| Git history rewrite kapsam dışı açıkça belirtilmiş | Risk/karar bölümü |
| Eski isimlerin aktif içerikte bırakılmaması hedefi korunmuş | Hedef sözleşme |
| Production kodu ve veri değişmemiş | `git status` + teslim özeti |

## Kalite kapısı

- `rg -n -i 'openmas|aiskeleton|@openmas|openmas-' .` taraması çalıştırılacak.
- `node_modules`, build çıktıları ve cache sonuçları ayrıca belirtilerek yanlış
  pozitifler ayrıştırılacak.
- Docker kapısı kullanıcı kararıyla çalıştırılmayacak.
- `docs/opendevcon/PROGRESS_LOG.md` append-only güncellenecek.
- `docs/opendevcon/METNEX_STATE.md` task durumunu yansıtacak; bu dosya sonraki
  rename task'larında `METNEX_STATE.md` olarak ele alınacaktır.

## AI2 talimatı

Bu task yalnızca envanter ve karar hazırlığıdır. Kör global replace yapma,
production koduna veya veritabanına dokunma. Her eski referansı dosya/konum,
hedef değer ve sonraki task ile ilişkilendir. Gerçek secret, parola veya
connection string değerlerini teslim dokümanına kopyalama.
