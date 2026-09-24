---
id: TASK-027.59
title: Wave 5 Reporting Uçtan Uca Kabul
status: done
parent_epic: EPIC-004
related: [TASK-027.63, TASK-027.64, TASK-027.65, TASK-027.66, TASK-027.67, TASK-027.68, TASK-027.69, TASK-027.70, TASK-027.71, TASK-027.72, TASK-027.72-R1, TASK-027.73, TASK-027.73-R1, TASK-027.73-R2, TASK-027.73-R3, TASK-027.73-R4, TASK-027.71-R1, TASK-027.74]
updated_at: 2026-09-24
---

# TASK-027.59: Wave 5 Reporting Uçtan Uca Kabul

## Durum
done (AI1 onayı, 2026-09-24). Bu task yeni özellik değildir; mevcut zincirin birlikte çalışması kabul edildi. **Tarayıcıda manuel doğrulama yapılamadı** (bkz. aşağı); yerine API/web entegrasyon testleri ve gerçek CSV snapshot üzerinde kabul paketi kullanıldı. Kabul sırasında **iki bulgu** çıktı (Q-W543, Q-W544) — kod değiştirilmedi.

## Bağımlılık zinciri (027.63 → 027.74)
027.63 Catalog · 027.64 Adapter · 027.65 Query Service · 027.66 Aggregation · 027.67 Quality/Rollover · 027.68 Multi-Series/Statistics · 027.69 Comparison · 027.70 Virtual Columns · 027.71 Presets · 027.72 API · 027.72-R1 Provider Composition · 027.73 Web Screen · 027.73-R1 (CSV keşfi) · R2 (manifest kolon semantiği) · R3 (dev env aktivasyonu) · R4 (dev scope bridge) · 027.71-R1 (dev sanal kolon) · 027.74 Export (PNG completion dahil). Hepsi `done`.

## Kanıt: yeni kabul paketi
`apps/api/src/reporting/scada/api/__tests__/wave5-e2e-acceptance.spec.ts` (24 test; `veriler/raw/*.csv` git-ignored olduğundan snapshot yoksa atlanır). **Gerçek** `endeksler / gt_endeksler / komur_endeksler / sg_endeksler` CSV'leri + gerçek manifest ile, kompoze zincir: manifest/katalog → dev scope → gerçek 027.65 sorgu servisi → kalite/rollover → aggregation → multi-series/istatistik → karşılaştırma → sanal kolon → preset → API servisi → export (CSV/XLSX/PDF/PNG) + export audit. Env: `NODE_ENV=development`, `REPORTING_DEV_FIXTURES=true`, `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=Europe/Istanbul`, `REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=true`. Veritabanı, Docker, SQL Server, gerçek Jasper yok (renderer seam'i stub); tenant/caller kayıtları sentetik.

| Senaryo | Kanıt |
|---|---|
| 1 Giriş/erişim | S1: tüm SCADA rotalarında JWT→MFA→header→membership→permission zinciri, okuma `VIEW`, export `EXPORT`; katalog `SCADA_HOURLY_ANALYSIS` + "Geliştirme CSV snapshot verisi". **Giriş/tenant seçimi/menü** platform bileşenleridir (bu pakette yeniden test edilmedi; mevcut auth/tenant/menü testleri + `reports-list-client.spec`). |
| 2 Kaynak keşfi | S2: dört kaynak, doğrulanmış kolonlar seçilebilir, doğrulanmamışlar `available:false` ve sorgulanamaz, doğrulanmış ama birimsiz seri `unit:''` ("Birim belirtilmemiş" UI'da — web spec), yanıtta fiziksel yol/tablo/dosya adı yok. Tenant değişiminde temizleme: web spec (4 test). |
| 3 Saatlik | S3: gerçek CSV endeks farkları birebir; **gerçek 0 → 0** (snapshot'ta sıfır-tüketim saatleri var); **eksik okuma (Turbin2, 18.11.2025) → null + bayrak, asla 0**; sayaç sıfırlaması (GT2, 25.02.2026) → `COUNTER_RESET_UNRESOLVED`, değer null. |
| 4 Günlük | S4: INDEX günlük = saatlik toplamı; eksik saatli gün temiz/tam görünmez; Europe/Istanbul'da DST yok (29.03.2026 = 24 kova). **DST/GAP davranışı bu veride tetiklenmez** — 027.66/027.67 birim paketleri kanıtıdır. |
| 5 Çoklu seri | S5: deterministik sıra (girdi sırasından bağımsız, çıktı birebir aynı), 9 istatistik alanı, bir serideki eksiklik diğerini bloklamaz. Renk determinizmi: `scada-chart-helpers.spec`. |
| 6 Karşılaştırma | S6: PERIOD fark/yüzde, sıfır taban → yüzde `null` ("—"), eşleşmeyen kovalar görünür; SOURCE açık `seriesMapping` ister (`SCADA_MAPPING_REQUIRED`), kısmi eşleme `SERIES_MAPPING_REQUIRED` ile bloklanır (pozisyonla eşleştirme yok). **Bulgu Q-W543(b).** |
| 7 Sanal kolon | S7: oluştur→aktif et→analiz; "(sanal)" id+sürüm; null girdi → null sonuç; sıfıra bölme → `VIRTUAL_COLUMN_DIVISION_INVALID`; geçersiz formüller reddedilir/saklanmaz; yalnız yetkili yönetir; **expression yanıt/audit/export'ta yok**; **API restart'ında in-memory store boşalır** (yeni store boş — beklenen dev davranışı, raporlandı). |
| 8 Preset | S8: private + aynı-root shared listelenir, başka root/başka kullanıcının private'ı görünmez, expression yok; preset çözülür ve çalışır; inactive `SCADA_PRESET_NOT_ACTIVE`. **Bulgular Q-W543(a), Q-W544** (stub preset store ile). |
| 9 Export | S9: gerçek analizden CSV/XLSX/PDF(Jasper seam)/PNG: filtreler, fiziksel+sanal seri, kalite bayrakları, development etiketi, null≠0, "Birim belirtilmemiş", expression/fiziksel ad yok, karşılaştırma CSV/XLSX; PNG başarı audit'i yalnız doğrulanmış completion'da; Jasper hatası statik, yapılandırılmamışsa fallback (`FALLBACK` audit). CSV injection / çift export / UI davranışı: `scada-export-*` ve `report-analysis-client.spec` (027.74 paketi). |
| 10 Tenant izolasyonu | S10: root A'nın sanal kolon/preset/export bağlamı root B'ye görünmez; dışlanan organizasyon, PLATFORM_ROOT, inactive ve unresolved tenant hiçbir veri almaz (analiz ve export); katalog dışlanan organizasyonu içermez. Web: tenant değişiminde grafik/tablo/preset/seçim temizliği ve eski isteğin yeni state'i ezmemesi (mevcut web spec). |
| 11 Fail-closed | S11: fixture kapalı/production ⇒ fixture sağlayıcıları yok; bridge kapalı ⇒ dev controller yok; dilim eksik ⇒ `SCADA_TIMEZONE_MISMATCH`; provider yok ⇒ 503; limit yok ⇒ 503 (analiz ve export); sorgu/export audit'i yazılamıyor ⇒ `SCADA_AUDIT_FAILED`; export-audit portu yok ⇒ 503; boş analiz ⇒ `BLOCKED` / `SCADA_EXPORT_EMPTY`; doğrulanmış serisi olmayan kaynak seçilemez ve analiz edilemez; geçersiz formül reddedilir. |

## Mutasyon kontrolleri (14; uygulanıp geri alındı, yeşil tabanda)
Hepsi yakalandı: fixture flag kontrolü kaldırıldı · scope bridge kontrolü kaldırıldı · timezone kapısı kaldırıldı (varsayılan dilim) · manifest doğrulaması (`verified === true`) kaldırıldı* · tenant izolasyonu (preset root kontrolü) kaldırıldı · null→0 (projeksiyon) · aggregation atlandı (günlük=saatlik) · karşılaştırmada index eşleştirmesi** · sanal kolon validator'ı kaldırıldı · expression yanıta eklendi · export permission kaldırıldı · PNG completion actor kontrolü kaldırıldı · audit hatasında başarı döndü · tenant değişiminde analiz state'i korundu (web).
\* Gerçek manifest'te "verified:false ama geçerli tipli" kolon yok; bu mutant `scada-manifest-semantics.spec` (sentetik manifest) tarafından yakalanır, kabul paketi tek başına yakalamaz.
\** Kabul paketinde ardışık saatlerin hiçbiri "yok" olmadığından index==anahtar sonucu verir; mutant 027.69 karşılaştırma birim paketi tarafından yakalanır.

## Doğrulama
`tsc` (api, web) temiz · api `reporting` 1707/1707, api tümü 3313/3313 (113 suite) · web 330/330 (27 dosya) · `./scripts/check.sh --skip-docker` yeşil (Q-ENV01 workaround'u). Mevcut testte güncelleme: DEC-0014 R1 envanter tablosuna yeni test dosyası satırı eklendi (`TASK-027-58-R1-scada-contract-closure.md`).

## Manuel / E2E yapılamayan adımlar (açık)
- **Tarayıcıda `pnpm dev` ile gerçek uçtan uca akış yapılamadı:** oturum, yerel veritabanı (kullanıcı/üyelik/MFA/`REPORT:ARTIFACT:VIEW`+`EXPORT`) ve çalışan servisler gerekir; Docker/`dev.sh` çalıştırılmadı, mevcut servislere dokunulmadı. Ekran görüntüsü alınmadı. Giriş, tenant seçimi, "Raporlar" menüsü ve gerçek Jasper çıktısı manuel doğrulama bekliyor.
- Gerçek Jasper (PDF) ve Türkçe font: ayrı dev-renderer smoke testi (Q-W542).
- DST/GAP'in gerçek veride görünmesi (Europe/Istanbul'da DST yok).
- Sanal kolon in-memory: API restart'ında silinir (dev); kalıcılık kapsam dışı.

## Yeni açık noktalar
**Q-W543, Q-W544** — bkz. `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`.

## Kapsam dışı / yapılmadı
Production SQL Server/PostgreSQL, gerçek production verisi/secret, kalıcı sanal kolon/preset repository, yeni permission/tenant/mapping, Wave 2/3. Git commit/push yok.

## 2026-09-24 — R1 notu (AI1 kararı sonrası)
Kabulde bulunan üç eksik `backlog/TASK-027-59-R1-wave5-preset-source-completion.md` ile giderildi (`review`): Q-W543(a) preset form hydration, Q-W543(b) açık SOURCE seri eşleme, Q-W544 development bellek-içi preset store. Bu görev `review` durumunda kalır; kanıt tablosundaki senaryo 6 (SOURCE) ve senaryo 8 (preset) artık R1 testleriyle (gerçek CSV üzerinde `dev-presets.spec.ts` ve web `scada-preset-source.spec.tsx`) desteklenir.

## AI1 Onayı (2026-09-24): TASK-027.59-R1 ve TASK-027.59 `done`; Wave 5 development kabulü tamamlandı. Q-W543(a/b) ve Q-W544 giderildi (preset hydration, açık SOURCE seri eşleme, dev bellek-içi preset store; tenant-izole, in-memory sınırında). Operasyonel not: tarayıcıda manuel kabul yapılmadı; test ve gerçek CSV entegrasyon kanıtlarıyla kapanışa engel değil.
