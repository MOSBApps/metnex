---
id: TASK-027.71
title: Kayıtlı Analiz Preset’leri
status: done
srs_refs: [FR-057, FR-058, FR-059, FR-060, FR-061, TBD-W5-006, AC-020, AC-021]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.71: Kayıtlı Analiz Preset’leri

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.71

## Başlık

Kayıtlı Analiz Preset’leri

## Durum

planned

## Amaç

Analiz konfigürasyonunu (kaynak, tablo, çözünürlük, kolonlar, değer tipleri, ölçek ayarları) **merkezi Metnex verisi** olarak, kişisel kapsamda saklayıp tekrar çağırmak.

## Ön koşullar

- TASK-027.70 `done`.
- **Kapanan karar kapıları:** Q-W505, Q-W506, Q-W510.
- **Kalan (ready olmadan önce):** Q-W517 (`TENANT_SHARED` paylaşma/yönetme yetkisi hangi **mevcut** izinle sınırlanacak; yeni permission uydurulmaz), Q-W519 (audit adları).

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W506 C:** `PRIVATE` (yalnızca oluşturan) ve `TENANT_SHARED` (tenant kapsamındaki yetkili kullanıcılar) preset; paylaşım ayrıca yetki kontrolünden geçer; aynı isimli preset **sessizce üzerine yazılmaz**; preset’ler versiyonlanır; karşılaştırma, ölçek, filtre ve sanal kolon referansları saklanır.
- **Q-W505 B:** control-plane; `tenantId` + `ownerUserId`; data-plane’e payload tablosu yok. **Q-W510 C:** ölçek ayarı preset’te saklanabilir.

## Kapsam

- Preset modeli (control-plane, sürümlü): `ownerUserId`, `tenantId`, kapsam (`PRIVATE | TENANT_SHARED`), ad, kaynak referansı (**katalog UUID’si**), çözünürlük, seçili kolonlar (+ analiz parametreleri), **karşılaştırma ayarları**, **ölçek ayarları**, **filtreler**, sanal kolon referansları (kimlik+sürüm), sürüm.
- **Yazma kuralları:** aynı kapsamda aynı ad **sessizce üzerine yazılmaz** (açık yeni sürüm veya çakışma reddi); `TENANT_SHARED` oluşturma/güncelleme/paylaşma ayrıca yetki kontrolünden geçer (Q-W517).
- **Yükleme güvenliği:** preset’te saklanan kaynak/kolon/sanal kolon yükleme anında katalog+scope ile **yeniden doğrulanır**; yetkisi düşmüş/kaldırılmış kaynak veya sanal kolon **fail-closed** reddedilir; preset yetki vermez (BOTC’nin “kolon yoksa boş nesne yarat” davranışı taşınmaz).
- `TENANT_SHARED` okuma: tenant scope’undaki yetkili kullanıcılar; farklı tenant’ta görünmez.

## Kapsam dışı

- Yerel dosya (`HourlyPresets.json`) içe aktarımı, UI (TASK-027.73), zamanlanmış rapor/e-posta.
- Tarih aralığı kaydı (preset aralığı değil konfigürasyon saklar; göreceli aralık ayrı karar).
- Data-plane payload tablosu (Q-W505 B).

## Bağımlılıklar

TASK-027.70. Sonraki: TASK-027.72.

Zincir: `TASK-027.70` → **TASK-027.71** → `TASK-027.72`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/presets/* (yeni, **olası**)
- apps/api/src/db/schema/* + Drizzle migration (Q-W505 sonrası; DEC-0009 kompozit FK/tenant standardı)
- docs/domain/DOMAIN_MODEL.md, docs/domain/DB_META.md

## API/UI/veri sözleşmesi

- **Veri (öneri):** `AnalysisPreset { id, ownerUserId, tenantId, name, sourceKey, resolution, columns[{name, valueType, customMax?}], virtualColumnIds[], version }`.
- **API:** TASK-027.72. **UI:** TASK-027.73.

## Tenant ve permission kuralları

- `PRIVATE` yalnızca sahibine; `TENANT_SHARED` tenant kapsamındaki yetkili kullanıcılara; paylaşım yetkisi Q-W517; farklı tenant’ta aynı kullanıcı için ayrı kapsam.
- Yükleme anında kaynak/kolon yetkisi yeniden değerlendirilir; preset yetki vermez.
- Yeni permission yok (Q-M03/Q-W511).

## Audit ve güvenlik kuralları

- Oluşturma/güncelleme/silme audit’lenir (kod adı Q-SA kararı); preset içeriği (kolon adları, ayarlar) audit’e yazılmaz — kimlik/sürüm/ad hash’i.

## Test senaryoları

1. AC-020/021: kaydet → yeni oturumda/farklı istemciden çağır; PRIVATE/TENANT_SHARED görünürlük izolasyonu; tenant dışı görünmez.
2. Yükleme: kaynağı kaldırılmış/yetkisi düşmüş preset → fail-closed ve açıklayıcı statik hata; silinmiş sanal kolon referansı.
3. Aynı ad: sessiz üzerine yazma **yok** (yeni sürüm açıkça veya çakışma reddi); sürüm geçmişi; ölçek/karşılaştırma/filtre alanlarının tam saklanması.
4. Tenant izolasyonu, kullanıcı silinince sahiplik davranışı (Q-W505).
5. Paylaşım: yetkisiz kullanıcı `TENANT_SHARED` oluşturamaz/paylaşamaz; paylaşılan preset sahibi silinince davranış (Q-W505/W517 uygulama kararı).

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Yükleme anı yeniden doğrulaması kaldırılınca yetkisiz kaynak testi kırılır.
2. Sahiplik filtresi kaldırılınca izolasyon testi kırılır.
3. Benzersizlik kontrolü kaldırılınca ad testi kırılır.
4. Sessiz üzerine yazma engeli kaldırılırsa ad testi kırılır; paylaşım yetkisi kontrolü kaldırılırsa paylaşım testi kırılır.

## Kabul kriterleri

- Preset merkezi saklanır, yerel dosyaya bağlı değildir; aynı kullanıcı farklı istemciden erişir.
- Preset hiçbir zaman yetki vermez; yükleme daima yeniden yetkilendirilir.
- Kaydedilen alanlar Q-W506 kararıyla belgelenmiştir; `check.sh --skip-docker` geçer.

## Rollback yaklaşımı

Migration varsa forward-only ve yalnızca bu modülce okunan tablo → devre dışı bırakma güvenli. Modül kaydı kaldırılırsa preset özelliği kapanır, analiz elle seçimle çalışır.

## Sonraki task

TASK-027.72

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Kod/test için **hayır** (mock DB). Gerçek PostgreSQL migration doğrulaması **ayrı, açık onay** ile.

## AI1/PO kararı gerektiren açık sorular

- **Q-W517** — `TENANT_SHARED` preset paylaşma/yönetme yetkisi hangi mevcut izinle sınırlanacak
- **Q-W519** — Katalog/sanal kolon/preset değişiklik audit action/entity adları; formül metninin audit’e yazılması

## BOTC referansı

- **Referans davranış:** `ReportPreset`/`PresetColumnInfo`, `btnSavePreset_Click`, `cmbPresets_SelectionChanged` (kaynak/tablo/kolon bekleme döngüleri, eksik kolonu elle yaratma).
- **Taşıma sınırı:** Taşınmaz: `%APPDATA%\BOT_APP\HourlyPresets.json`, UI’da 100 ms’lik bekleme döngüleri, olmayan kolonu sahte `DbColumn` ile yaratma, kayıtta kaynak adı (isim) ile referans.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — Sanal kolon tüketimi (TASK-027.70)
Preset sanal kolonlardan yalnızca **referans** saklar (`virtualColumnId` [+ isteğe bağlı sabit `version`]); ifade metni/girdi listesi/sonuç saklanmaz. Çalıştırmada çağıran katman tanımları tenant-kapsamlı depodan çeker ve `VirtualColumnService.evaluate`'e verir; bilinmeyen/pasif/çakışan sürüm statik kodla döner (`VIRTUAL_COLUMN_*`). Preset tanımı değiştiremez, tenant/kaynak genişletemez. Ayrıntı: `backlog/TASK-027-70-scada-virtual-columns.md`.


> **Durum notu (2026-09-24):** Saf çekirdek teslimi `backlog/TASK-027-71-scada-presets.md` içinde (`review`). Bu dosya yalnızca planlama kaydıdır.
