---
id: TASK-027.73-R2
title: SCADA CSV Manifest Column Semantics Verification
status: done
parent_epic: EPIC-004
related: [TASK-027.73-R1, TASK-027.63-R1, TASK-027.67, DEC-0015]
updated_at: 2026-09-24
---

# TASK-027.73-R2: SCADA CSV Manifest Column Semantics Verification

## Durum
done (AI1 onayı, 2026-09-24)

## Amaç
Q-W538 blocker'ını çözmek: `veriler/manifest/scada-fixtures.manifest.json` içindeki kolonların `valueType`, `unit`, görünen `label` ve seçilebilirliğini **yalnız kanıtla** tanımlamak; geliştirme ekranında gerçek CSV verisiyle grafik üretilebilir hale getirmek. Ham CSV'ler değiştirilmedi (SHA-256'lar aynı); ham satır/credential/hassas değer bu dosyaya ve manifeste yazılmadı.

## 1. Kaynak envanteri (yalnız toplu istatistik)
| Kaynak | Kolon (header) | Satır | ID / Tarih / Saat | Ölçüm adayı | Zaman aralığı (naif yerel) | Tekrarlı zaman damgası | Adım |
|---|---|---|---|---|---|---|---|
| `endeksler` | 33 | 7727 | RaporID / KayitTarihi / KayitSaati | 30 | 2025-11-05 20:40 → 2026-09-23 22:00 | 0 | çoğu 60 dk, sapmalar ve birkaç boşluk var |
| `gt_endeksler` | 24 | 6383 | ID / KAYIT_TARIHI / KAYIT_SAATI | 21 | 2026-01-01 00:00 → 2026-09-23 22:03 | 0 | çoğu ~60 dk, sapmalar var |
| `komur_endeksler` | 15 | 6384 | ID / KAYIT_TARIHI / KAYIT_SAATI | 12 | 2026-01-01 00:00 → 2026-09-23 22:03 | 0 | aynı |
| `sg_endeksler` | 19 | 6383 | ID / KAYIT_TARIHI / KAYIT_SAATI | 16 | 2026-01-01 00:00 → 2026-09-23 22:03 | 0 | aynı |
Kolon/satır sayıları manifestle ve gerçek header/satırlarla **eşit**; hiçbir ölçüm kolonunda sayısal parse hatası yok; boşluk oranı `0` (tek istisna: `endeksler.MCC_{1,2,3}_ENDEKS` ≈ %30); sabit-sıfır kolonlar: `HamSuKuyu_m3`, `Turbin{1,2}_CalismaSaati`, `GT{1,2}_{SICAKSU,BESISUYU,MAKEUP,KONDENS}…`, `SG50_{1,2,3}_BESI_TON`, `MSA_ISTASYONU`. Kaynak içi tutarlılık: tüm kaynaklar aynı naif yerel zaman biçimi (`GG.AA.YYYY` + `SS:DD:SS`), tekrarlı damga yok. Kolon başına istatistik (sayısal parse edilemeyen, boşluk oranı, azalmayan çift oranı, azalan çift sayısı, tümü-sıfır) her kolonun `CSV-STAT:` kanıt satırındadır.

## 2. Kanıt kaynakları ve varılan sonuç
- **BOTC `HourlyConsumptionWindow.xaml.cs:166-177`** — `GetDefaultValueTypeForTable`: yalnız üç tablo (`Saatlik_Ort_Veriler`, `MUSTERI_CEKIS_SAATLIK`, `VardiyaPerformans`) "Gerçek Değer"; bu dört `*_endeksler` tablosu için varsayılan "Endeks". *Bu tek başına yetmez* (bir varsayılan), bu yüzden aşağıdaki kolon-düzeyi kanıtla birlikte kullanıldı.
- **BOTC `IsletmeRaporlariWindow.xaml.cs:385-447`** — kolon-düzeyi kanıt: aşağıdaki kolonlar gün başı/sonu okumalarının **farkı** (`last − first`) alınarak kullanılıyor ⇒ sayaç/endeks kullanımı (`BOT.Domain/IsletmeModelleri.cs:6-58` modellerinde de tanımlı).
- **CSV istatistiği** — doğrulanan kolonların azalmayan çift oranı ≈ 0,95–1,00 (azalanlar sayaç sıfırlama/reset adayı; 027.67 politikasıyla ele alınır).
- **Birim kanıtı** — yalnız BOTC'nin **kendi etiketi/dönüşümü**: `GT/SG DG (Sm3)` (:214, :226), `GT/SG Buhar (ton)` (:219, :231), `KK Kömür (ton)` (:199, :202), `Ana Buhar (ton)` (:246 ← `AnaBuharM1` :443/:453/:503), `iht / 1000.0` ile MWh'e çevrilen `IcIhtiyacTrafo*_kWh` (:445, :234).
- **Çelişki (birim reddedildi):** BOTC elektrik farkını `"GT/SG Elektrik (MWh)"`/`"Üretim (MWh)"` etiketiyle gösteriyor (:213, :225, :167, :234) ama kolon adı KWH diyor ve dönüşüm **yok** (:385-387, :404-406, :439-444). `Turbin1/2_Enerji_kWh` ve GT/SG elektrik kolonlarında **birim yazılmadı**.
- Kanıtsız kalanlar (`verified:false`, `valueType:null`, `unit:null`): BOTC modelinde/raporunda **kullanılmayan** tüm kolonlar (ör. `ToplamElektrikUretim_kWh` — azalmayan çift oranı 0,60, sayaç değil; sabit-sıfır kolonlar; `MCC_*`, `SH*_Atemperator_ton`, `SICAK_SU_URETIM_KWH`, `TOPLAM_IC_ENERJI_KWH` …). Kolon adı hiçbir çıkarımda kullanılmadı (`_KWH/_TON/_INDEX/_VALUE` yorumlanmadı).

## 3. Manifest sonucu
Her kaynağa `columns[]` eklendi (ölçüm adayının **tamamı** açıkça bildirildi): `{ sourceColumn, label, verified, valueType, unit?, evidenceRefs[] }`.
| Kaynak | Doğrulanmış (INDEX) | Doğrulanmamış |
|---|---|---|
| `endeksler` | 6 (`Turbin1/2_Enerji_kWh`, `IcIhtiyacTrafo1/2_kWh`, `AnaBuharM1`, `Bar13BuharTedari_ton`) | 24 |
| `gt_endeksler` | 9 (GT1-3 elektrik / doğalgaz / buhar) | 12 |
| `komur_endeksler` | 6 (KK1/2 buhar, KK1/2 kömür, sıcak su buhar, degazör buhar) | 6 |
| `sg_endeksler` | 9 (SG50_1-3 elektrik / doğalgaz / buhar) | 7 |
Birimler: `Sm3` (GT/SG doğalgaz), `ton` (GT/SG buhar, KK kömür, AnaBuharM1), `kWh` (`IcIhtiyacTrafo1/2_kWh`); diğer doğrulanmış kolonlar **birimsiz** ⇒ arayüz "Birim belirtilmemiş". `REAL_VALUE` olarak doğrulanan kolon **yok** (kanıt yok). Her kolonun `evidenceRefs` listesi BOTC dosya:satır, tablo varsayılanı, CSV-STAT ve birim kanıtı (`UNIT:`) ya da neden birim yok (`UNIT-NOT-VERIFIED:`) içerir. Manifestte fiziksel DB adı/credential yok (testle sabit).

## 4. Kod
- `ScadaFixtureColumnDeclaration` (`sourceColumn`, `label`, `verified`, `valueType|null`, `unit|null`, `dailyOperation`, `evidenceRefs`). Doğrulama kuralları (`dev-csv-scada-fixture.ts`): `verified:true` **ve** boş olmayan `evidenceRefs` **ve** `valueType ∈ {INDEX, REAL_VALUE}` **ve** id/tarih/saat kolonu değil **ve** kolon bir kez bildirilmiş **ve** CSV'de sayısal okumaya sahip; aksi halde UNVERIFIED (listelenir, seçilemez, sorguya kapalı). Manifestte olmayan/CSV'de olmayan kolon sorgulanamaz. `label` yalnız görünen ad.
- **027.68'e küçük additive gevşetme (bilerek):** seri `unit` boş string `''` kabul edilir (= birim doğrulanmamış). Önceden boş birim seriyi `INVALID_STATISTICS_INPUT` ile blokluyordu ve birimsiz doğrulanmış kolon hiç analiz edilemiyordu. Sanal kolon tanımındaki `unit` zorunluluğu değişmedi. İlgili 027.68 testi güncellendi + yeni test.
- Web: değişiklik yok (R1'deki UNVERIFIED / "Birim belirtilmemiş" davranışı manifestle kanıtlandı).

## 5. Testler
Api: `scada-manifest-semantics.spec.ts` (31; gerçek CSV/manifest bölümü snapshot yoksa atlanır) — dört CSV header/kolon/satır envanteri, kolon sayısı tutarlılığı, manifest kolonlarının gerçek header'da bulunması ve tam kapsama, id/tarih/saat'in bildirilememesi, kanıt/valueType/unit kuralları, çelişkili elektrik biriminin yazılmaması, INDEX/REAL_VALUE seçilebilirliği, doğrulanmamış kolonun seçilememesi/sorgulanamaması, birimsizlik, isimden tip/birim türetmenin engeli, kanıtsız/çift bildirim, CSV'nin değişmediği (SHA-256) ve hash doğrulaması, whitelist, gerçek CSV'den sorgu sonucu, null'ın 0 olmaması (INDEX ve REAL_VALUE), boş kaynak, tenant kapsamının genişlememesi, dilimsiz analiz yok. Web: `scada-catalog-manifest.spec.tsx` (4; gerçek manifestten katalog, seçilebilir seri, "Birim belirtilmemiş", UNVERIFIED kapalı, istek gövdesi, null "—", kalite bayrağı, etiket). Toplam: api 3074/3074 (104 suite), web 291/291.

## 6. Mutasyon kontrolleri (uygulandı, geri alındı, `diff` ile doğrulandı — hepsi testleri kırdı)
Doğrulanmamışı doğrulanmış yapma (3) ve kanıtsız doğrulama (3) · kolon adından valueType (11) · kolon adından birim (4) · id/tarih/saat'i seri yapma: ayrıştırıcı (7), ayrıştırıcı+koruma birlikte (6) · manifestte olmayan kolonu seçilebilir yapma (21) · fixture'ı production'da açma (10) · dosya yolunu response'a ekleme (3) · hash kontrolünü kaldırma (2) · CSV'de olmayan kolonla sorgu (1) · null'ı 0 yapma (1) · çift bildirimi kabul (1). Web: doğrulanmamış onay kutusunu açma (2), addan birim türetme (1).
**Dürüstlük notu:** iki mutant ilk turda kaçtı — (a) null→0: INDEX sayaç testinde sıfır ardından "sayaç sıfırlama" bayrağıyla yine null çıkıyordu; REAL_VALUE null testi eklendi ve yakalandı; (b) yalnız yapısal-kolon korumasının kaldırılması: ayrıştırıcı zaten bu kolonları vermediği için koruma tek başına erişilemezdi; koruma+ayrıştırıcı birlikte mutasyonu ve ek test ile yakalandı.

## 7. Doğrulama
`pnpm --filter api exec tsc --noEmit` temiz; `jest src` 104 suite / 3074 test; `pnpm --filter web exec tsc --noEmit` temiz; `vitest run` 25 dosya / 291 test; eslint hata yok; `./scripts/check.sh --skip-docker` yeşil. Docker, gerçek SQL Server/PostgreSQL, migration, production smoke **çalıştırılmadı**; git commit/push yok; yeni tenant/kaynak/permission yok.
**Tarayıcı/E2E: yapılamadı** (çalışan `next dev`/api sunucularına dokunulmadı, oturum gerekir). Yerine: gerçek `veriler/raw` CSV'leri üzerinde api entegrasyon testi (keşif + analiz + audit) ve gerçek manifestten beslenen web bileşen testi. Elle doğrulama: api'yi `NODE_ENV=development REPORTING_DEV_FIXTURES=true REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=Europe/Istanbul` ile çalıştır → Raporlar → "SCADA Saatlik/Günlük Analiz" → bir kaynak → `*_DOGALGAZ_TUKETIM_SM3` gibi bir seri → Saatlik → Analiz Çalıştır (doğrulanmamış kolonlar tıklanamaz; birimsizlerde "Birim belirtilmemiş").

## 8. Kabul kriterleri eşlemesi
1-4 (artifact, kaynaklar, en az bir doğrulanmış seri) ve 9-10 (doğrulanmamış seçilemez, birim yoksa "Birim belirtilmemiş") ve 11-12 (null≠0, bayraklar) ve 5-8 (aralık sınırı, saatlik analiz, grafik/tablo, etiket) testlerle kanıtlandı; tarayıcıda elle görülmesi yapılamadı.

## AI1 Onayı ve Kararlar (2026-09-24)
`done`. Q-W539 **açık kalır**: BOTC'deki elektrik MWh/KWH çelişkisi teyit edilmeden birim yazılmaz. Boş birim onaylandı: `unit: null` geçerli bir durumdur; yalnız birim eksik diye seri analizden engellenmez (027.68 additive gevşetmesi kabul). valueType doğrulanmışsa seri analiz edilebilir, arayüz "Birim belirtilmemiş" gösterir. Kanıtsız birim türetme yapılmaz.

## R3 referansı (2026-09-24)
Geliştirme fixture'ının `pnpm dev` ile otomatik etkinleşmesi (`dev.sh` → `REPORTING_DEV_FIXTURES`, `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE`) `TASK-027.73-R3` ile teslim edildi: `backlog/TASK-027-73-R3-development-fixture-environment.md`. Manifest semantiği değişmedi.
