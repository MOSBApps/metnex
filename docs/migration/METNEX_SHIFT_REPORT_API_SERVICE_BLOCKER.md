# Vardiya API/Service Implementation — Blocker Paketi (TASK-027.24)

> **Sonuç: Production API/service implementasyonu BLOKLU.** `apps/` altında hiçbir kod yazılmamıştır.
> Kontrat: `METNEX_SHIFT_REPORT_API_SERVICE_CONTRACT.md`. Bu belge hiçbir soruyu kapatmaz; her blocker için
> etki, seçenekler, varsayım riski, gerekli karar ve karar sonrası dosya listesini verir.
> **Tarih:** 2026-09-19 · **Hazırlayan:** AI2

## 0. Neden bloklu — özet

1. **Yapısal blocker (B0):** Vardiya için tablo/şema yok ve bu task Drizzle schema, migration, mapping tablosu,
   tenant oluşturmayı yasaklıyor → repository katmanı yazılamaz; okunabilir/yazılabilir tek bir ShiftReport
   satırı bile var olamaz.
2. **Davranışı değiştiren açık kararlar:** Q-V07, Q-V11, Q-V19, Q-V20, Q-V21 doğrudan endpoint davranışını
   belirler (permission, şema hedefi, tenant/mapping varlığı). Q-V22, Q-V09, Q-V23, Q-V24 belirli endpoint'leri etkiler.
3. **Düşük riskli, karar gerektirmeyen test:** Talimat "mevcut mekanizmaların doğrudan yeniden kullanımını
   kanıtlayan düşük riskli contract testleri yazılabilir" diyor. `tenant-scope.service.spec.ts` zaten
   `resolve()` fail-closed/kapsam davranışını 8 testle kanıtlıyor (kontrat §0-F2); Vardiya'ya özgü bir nesne
   olmadan yazılacak yeni bir test bu kanıtı tekrar eder, yeni güvence katmaz. Bu yüzden **yeni test/kod
   eklenmedi** (kapsam disiplini). Bu bir karardır; AI1 aksini isterse eklenebilir.

## 1. Blocker tablosu

Bloklama düzeyi: **A** = implementasyonu tamamen engeller · **B** = belirli endpoint/davranışı engeller ·
**C** = kontrata girer, implementasyonu engellemez (varsayılan-koruma mümkün).

### B0 — Vardiya tablosu/şema yok (yapısal)
| Alan | İçerik |
|---|---|
| Soru | Yok (task kısıtı) — Q-V11 ile birlikte |
| Etki | Repository/entity yok; endpoint'ler test edilemez |
| Seçenekler | (a) Ayrı schema task'ı (Drizzle) açmak; (b) bu task'a schema eklemek (yasak) |
| Varsayım riski | Şemayı bu task'ta eklemek Q-V11'i fiilen kapatır (tablo `public`'e mi data-plane'e mi) |
| Gerekli karar | AI1: schema task'ının kapsamı ve sırası |
| Sonrası dosyalar | `apps/api/src/db/schema/` yeni dosya + schema barrel; drizzle migration; (data-plane ise) data-plane migration mekanizması |

### B1 — Q-V07 Permission catalogue kodları — **A**
| Alan | İçerik |
|---|---|
| Etki | Her endpoint `@RequirePermission(kod)` ister; `SHIFT:REPORT:*` katalogda **yok** (grep boş). Kod uydurmak Q-V07'yi kapatır; kodsuz endpoint ise korumasız (guard `required` yoksa `true` döner → **fail-open**) |
| Seçenekler | (a) `SHIFT:REPORT:VIEW/UPDATE` (Q-M03 taslak) ekle; (b) VIEW/CREATE/UPDATE ayrımı (Q-V19); (c) başka adlandırma; (d) `CanReceiveShiftReportEmail` karşılığı da (Q-V07 ikinci yarısı) |
| Varsayım riski | Yanlış ad → role template/migration (TASK-027.12–16 `APPROVED_PERMISSION_CODE_MAP`) ve UI ile kalıcı uyumsuzluk; **permission kodları sonradan yeniden adlandırmak pahalı** (DB `tenantRolePermissions.permissionCode` metin). Kodsuz bırakmak güvenlik açığı |
| Gerekli karar | AI1/PO: kesin kod listesi + catalogue'a ekleme onayı |
| Sonrası dosyalar | `apps/api/src/platform/permission-catalogue.ts` (+ spec), gerekirse `migration/botc-identity/permission-mapping.ts` sabitleri, seed/permissions senkron mekanizması |

### B2 — Q-V19 CREATE/UPDATE ayrımı — **B**
| Alan | İçerik |
|---|---|
| Etki | `POST` ve `PATCH`/`complete` için tek mi iki permission mı |
| Seçenekler | (a) tek `UPDATE` (BOTC `CanManageShifts` tek); (b) `CREATE`+`UPDATE` ayrı |
| Varsayım riski | (a) sonradan ayırmak mevcut rol atamalarını kırar/yeniden dağıtım gerekir; (b) gereksiz ince taneli izin |
| Gerekli karar | PO |
| Sonrası dosyalar | B1 ile aynı + controller dekoratörleri |

### B3 — Q-V11 Data-plane schema yerleşimi — **A**
| Alan | İçerik |
|---|---|
| Etki | `TenantScopeService.resolve()` `schemaName` döndürür ve ShiftReport bunun **ilk tüketicisi** (kontrat F1). Tablo `public`'te ise `schemaName` kullanılmaz; data-plane'de ise runtime `pgSchema(schemaName)` ile repository yazılır. DEC-0010 Phase 5-9 **uygulanmadı** (`DB_META.md`) |
| Seçenekler | (a) `public` (geçici, sonra taşı); (b) data-plane şema (Phase 5 önce); (c) Phase 5'i Vardiya ile birlikte başlat |
| Varsayım riski | (a) sonradan data-plane'e taşımak = veri taşıma + repository yeniden yazımı; izolasyon **cross-customer** sınırını (DEC-0010'un asıl amacı) baştan zayıflatır. (b) çok büyük ön iş |
| Gerekli karar | AI1/PO + DEC-0010 Phase 5 planı |
| Sonrası dosyalar | Repository (`shift-reports/shift-report.repository.ts`), schema dosyası, data-plane migration runner, `customer_schema_registry.migrationVersion` güncellemesi |

### B4 — Q-V20 Tenant kayıtlarının varlığı — **A**
| Alan | İçerik |
|---|---|
| Etki | MOSB/MOSBİO/MOSEDAŞ tenant'ları hedef ortamda yoksa `resolve()` 404; mapping'in hedef tenant'ı yok → hiçbir kayıt RESOLVED olamaz; tüm liste boş |
| Seçenekler | (a) Tenant'lar zaten mevcut (doğrulama gerekir); (b) ayrı bir tenant provisioning task'ı (iki adımlı: tenant satırı + schema provizyonu, DEC-0010) |
| Varsayım riski | Var sanmak → testler geçer ama gerçek ortamda tüm kayıtlar erişilemez; tenant'ı bu task'ta oluşturmak yasak |
| Gerekli karar | AI1/PO: mevcudiyet teyidi ve provisioning sahipliği |
| Sonrası dosyalar | Tenant bootstrap/provisioning task'ı (dosyalar o task'a ait) |

### B5 — Q-V21 Mapping saklama yeri — **A**
| Alan | İçerik |
|---|---|
| Etki | Mapping resolver'ın veri kaynağı (kod sabiti / `public` control-plane tablosu / data-plane tablosu). Tablo yasak; sabit ise onay/audit izi yok |
| Seçenekler | (a) Konfigürasyon sabiti (onaylı, sürümlü); (b) `public` mapping tablosu; (c) data-plane tablosu (Q-V11'e bağlı) |
| Varsayım riski | Sabit → onay geçmişi/audit ve `approvedBy/At` sözleşmesi karşılanmaz; tablo → schema kararı Q-V11 ile çakışır |
| Gerekli karar | AI1/PO (+ Q-V11) |
| Sonrası dosyalar | Mapping schema/servis (`shift-reports/location-tenant-mapping.*`), seed/onay akışı task'ı |

### B6 — Q-V22 effectiveFrom ve reassignment — **B**
| Alan | İçerik |
|---|---|
| Etki | `PATCH` tenant/lokasyon değiştiremez (kontrat), ama RESOLVED satırın tenant değişimi için süreç yok; import (TASK-027.26) re-run davranışı ve `effectiveFrom` geçmiş kayıt etkisi |
| Seçenekler | (a) Reassignment yasak (yalnızca yeni kayıt); (b) onaylı+audit'li reassignment işlemi; (c) supersede zinciri |
| Varsayım riski | Sessiz taşıma tenant izolasyon ihlali; tamamen yasak operasyonel çıkmaz yaratabilir |
| Gerekli karar | PO/AI1 |
| Sonrası dosyalar | Reassignment servis/endpoint (ayrı task), mapping şeması `supersedesMappingId` |

### B7 — Q-V16 Unresolved kayıt yönetimi — **C**
Etki: bu kontratın **dışında** (admin/remediation endpoint'i yok). Kontrat fail-closed'dır; yönetim yolu
tanımlanmadığından unresolved satırlar okunamaz (kasıtlı). Varsayım riski: yeni yetki icadı. Karar: PO
(öneri: yeni yetki gerektirmeden mapping düzeltme + yeniden çözümleme). Dosyalar: yalnızca karar (b) seçilirse
yeni task.

### B8 — Q-V18 Tenant-içi lokasyon scope — **C**
Etki: liste filtresi/erişim. Kontrat R10 ile BOTC davranışını korur (tüm RESOLVED lokasyonlar görünür); yeni
lokasyon permission'ı üretilmedi. Varsayım riski: KÖMÜR KAZANI/KIRIM DEPO/SANTRAL sahipliği çözülünce başka
birimin raporlarını görme sorunu → sonradan sıkılaştırma kırıcı olabilir. Karar: PO (Q-V01 sonrası).
Dosyalar: service filtre + (gerekirse) yeni permission task'ı.

### B9 — Q-V08 Canlı/arşiv permission ayrımı — **C**
Etki: yalnızca arşiv okuma (TASK-027.27); canlı 5 endpoint'i etkilemez. Kontratta arşiv yoktur. Karar: PO,
TASK-027.27 öncesi. Dosyalar: B1 ile aynı.

### B10 — Diğer davranış belirleyici sorular (kontratta işaretli)
| Soru | Düzey | Etki | Varsayım riski |
|---|---|---|---|
| Q-V09 sunucu-taraflı kilit | B | `COMPLETED` güncelleme cevabı (öneri 409) | Yanlış varsayım = ya BOTC'nin UI-only açığını taşımak ya da PO'nun istemediği kilit |
| Q-V04 LOCKED/FAILED/ARCHIVED | C | Status enum'u | Enum sonradan genişletmek additive (düşük) ama daraltmak pahalı |
| Q-V12 audit tenant izi | C | Audit sorgulanabilirliği | `metadata` tabanlı → tenant bazlı audit filtre pahalı |
| Q-V14 `shiftCode` değer kümesi | B | Doğrulama kuralı | Yanlış küme geçerli kaydı reddeder/geçersizi kabul eder |
| Q-V15 operatör snapshot | C | DTO alanı | Sonradan eklemek additive |
| Q-V23 (yeni) idempotency anahtarı | B | Create tekrar davranışı | Uygulamada mevcut kural yok; yanlış tasarım çift kayıt |
| Q-V24 (yeni) audit hata politikası | C | `log()` fırlatırsa istek düşer mi | Audit kaybı vs kullanıcı kaybı dengesi |

## 2. Karar sonrası uygulama planı (öneri sıra)

1. Schema task'ı (B0/B3): Q-V11 kararı → Drizzle schema + migration (+ data-plane).
2. Permission task'ı (B1/B2): Q-V07/V19 kararı → `permission-catalogue.ts`.
3. Tenant provisioning + mapping (B4/B5): Q-V20/V21.
4. **Sonra** `apps/api/src/shift-reports/` (controller, service, scope adapter, repository, DTO, testler) —
   kontrat §2–§7'ye göre; Q-V09/V22/V23/V24 kararlarıyla.
5. TASK-027.30 güvenlik testleri (kontrat §3 R1–R10).

## 3. Teyit
Bu task'ta `apps/` altında hiçbir dosya eklenmedi/değiştirilmedi; hiçbir blocker sorusu varsayımla kapatılmadı.
