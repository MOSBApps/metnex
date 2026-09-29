---
id: TASK-029.01
title: Domain, Tenant, Operasyon Merkezi ve External Reference Sözleşmesi
status: done
parent_epic: EPIC-005
related: [TASK-029.00, TASK-029.00-R1, TASK-029.00-R2, DEC-0014, DEC-0017]
updated_at: 2026-09-28
---

# TASK-029.01: Domain, Tenant, Operasyon Merkezi ve External Reference Sözleşmesi

## AI1 Onayı (2026-09-28)
`done`. Doğru sınırlar korunmuş: saf domain sözleşmesi; NestJS/API/UI/DB/migration değişmemiş;
operasyon merkezi ayrı tenant yapılmamış; `tenantId`+`operationCenterId` birlikte kapsam anahtarı;
varlık sahibi/işletmeci ayrılmış; MOSEDAŞ yalnız external-system adı; D-04 otomatik düzeltilmemiş;
yeni permission/gerçek entegrasyon yok. MOSEDAŞ statik test istisnası gerekçeli ve kontrollü —
"MOSEDAŞ tenant değildir" kararını değiştirmiyor, yalnız dış sistem referansı olarak
kullanılabildiğini belgeliyor.

## Durum
done (AI1 onayı, 2026-09-28). İlk **gerçek teknik** EPIC-005 task'ı; yalnız saf TypeScript
domain/reference sözleşmesi + testler. **API endpoint'i, web ekranı, migration/seed, gerçek
DB/SQL Server bağlantısı, yeni tenant/rol/permission ve Docker yoktur.**

## Teslim

`apps/api/src/operations/domain/` (yeni domain kökü, hiçbir NestJS modülüne bağlanmadı — pure
functions + interfaces, `static-guarantees.spec.ts` bunu kanıtlar):

| Dosya | İçerik |
|---|---|
| `tenant-identity.ts` | `TenantIdentity`, `isMappableTenant`, `isForbiddenMosedasTenant` — DEC-0014/DEC-0017'nin "MOSEDAŞ tenant değildir" kuralının bu domain için **bağımsız** kopyası (defense in depth; SCADA'daki `tenant-guards.ts` ile aynı desen). D-04'ü kapatmaz. |
| `reference-validity.contract.ts` | `ReferenceValidityPeriod`, `isValidityPeriodWellFormed`, `isInstantWithinValidity`, `selectEffectiveAt` — zaman içindeki sahiplik/işletmeci değişimini kaybetmeden temsil eden ortak yapı taşı. |
| `external-reference.contract.ts` | `ExternalSystemReference`, `EXTERNAL_SYSTEMS = ['BEAM','NETSIS','MOSEDAS','SCADA_DMS']`, `isSafeExternalReferenceValue` (bağlantı dizesi/secret/JWT/SQL URI şekilli değerleri reddeden ortak güvenlik kapısı). |
| `facility-machine.contract.ts` | `FacilityReference`, `MachineReference` — BEAM/ERP'deki gerçek varlığa Metnex'in sınırlı, opak referansı (DEC-0014 §3). |
| `ownership-operator.contract.ts` | `AssetOwnershipReference` (varlık sahibi, dış sistem) ve `OperatorReference` (işletmeci Metnex tenant'ı) **ayrı tipler**; `resolveEffectiveOwnershipAndOperator` ikisini bağımsız zaman noktalarında çözer, hiçbir zaman birbirine eşitlemez. |
| `operation-center.contract.ts` | `OperationCenter`, `OperationCenterKind` (`KOMUR_KAZANI`\|`KIRIM_TESISI`), `OPERATION_CENTER_OWNER_ROLE` (sabit kind→rol tablosu), `TenantOperationRoleAssignment`, `resolveOperationCenterOwner`, `resolveOperationCenterForCaller`. |
| `tenant-operation-scope.contract.ts` | `TenantOperationScope`, `UserOperationCenterScope`, `OPERATION_ACCESS_KINDS` (`VIEW`,`DATA_ENTRY`,`APPROVAL`,`CORRECTION`,`MANAGEMENT`), `ActiveTenantMembership`, `OperationCallerContext`, `resolveUserOperationAccess`, `validateUserOperationCenterScope`. |

### Tasarım kararları (kod kanıtıyla)

- **Operasyon merkezi ayrı tenant değildir:** `OperationCenter` yalnız `operationCenterId`,
  `kind`, `ownerTenantId`, `status` alanlarını taşır — `slug`/`type` gibi tenant-şekilli alan
  yoktur (`operation-center.spec.ts`).
- **Kömür Kazanı yalnız MOSB ENERJİ, Kırım Tesisi yalnız MOSBİO altında çözülür:**
  `OPERATION_CENTER_OWNER_ROLE` sabit tablosu + `resolveOperationCenterOwner`, sahibi tenant'ın
  atanmış rolü uyuşmuyorsa (`OWNER_ROLE_MISMATCH`) veya hiç atanmamışsa (`OWNER_ROLE_UNASSIGNED`)
  **reddeder**. Rol, **hiçbir zaman bir tenant slug'ından/adından türetilmez** — atama harici bir
  girdi (`TenantOperationRoleAssignment[]`), bu modülün icat ettiği bir slug eşlemesi değildir.
  Bu, D-04'ün (MOSB/MOSB ENERJİ/MOSBİO tenant dili) kod tarafında **otomatik düzeltilmediğini**,
  yalnızca izole edildiğini garanti eder.
- **`tenantId` + `operationCenterId` birlikte kapsam anahtarı:** `TenantOperationScope`'un her
  ikisi de zorunlu (`operationCenterId: null` = tenant geneli, asla "herhangi bir tenant"
  anlamına gelmez). `resolveUserOperationAccess`, `operationCenterId` eşleşse bile **aktif tenant
  üyeliği olmadan asla** erişim vermez (`MEMBERSHIP_NOT_ACTIVE`).
- **Görüntüleme ve veri girişi ayrı:** `OPERATION_ACCESS_KINDS` beş ayrı kapsam tanımlar; bir
  `UserOperationCenterScope` yalnızca içerdiği kapsamları verir, biri diğerini ima etmez.
- **Varlık sahibi ≠ işletmeci:** `AssetOwnershipReference` ve `OperatorReference` yapısal olarak
  ayrı tiplerdir (biri diğerinin alanını taşımaz); `resolveEffectiveOwnershipAndOperator` ikisini
  aynı anda, birbirinden bağımsız okur.
- **Zaman içindeki değişim korunur:** `ReferenceValidityPeriod` + `selectEffectiveAt`, geçmiş
  kaydı **silmeden/üzerine yazmadan**, sorgulanan ana göre doğru kaydı seçer; geçersiz veya süresi
  dolmuş pencere hiçbir zaman "hâlâ geçerli" sayılmaz.
- **Sistem yöneticisi sınırı:** `OperationCallerContext.isSystemAdmin`, `resolveUserOperationAccess`
  içinde **hiçbir adımı atlamaz** — sistem yöneticisi bypass'ı (varsa) bu domain sözleşmesinin
  dışında, çağıran guard/permission katmanının kararıdır; burada icat edilmedi.
- **MOSEDAŞ:** yalnız iki dosyada anılır — `tenant-identity.ts` (ret kuralı) ve
  `external-reference.contract.ts` (`EXTERNAL_SYSTEMS` içinde bir sistem adı olarak).
  `static-guarantees.spec.ts` bunu statik olarak kanıtlar; MOSEDAŞ hiçbir yerde tenant olarak
  oluşturulmaz.
- **Fiziksel DB adı / secret asla çıkmaz:** `isSafeExternalReferenceValue`, bağlantı dizesi
  şekilli (`Server=`, `jdbc:`, `postgres://`), JWT şekilli veya kontrol karakteri içeren hiçbir
  değeri kabul etmez; her external reference tipi bu kapıdan geçer.

### Kapsam dışı / açık bırakılanlar (bu task kapatmadı)

Netsis entegrasyon anahtarları/veri sözleşmesi (D-05), kepçe cihazı entegrasyonu (D-11), gerçek
SQL Server/BEAM/MOSEDAŞ bağlantısı, kalori/kül formülleri, başlangıç kalite limitleri, rapor
kolonları/Jasper şablonları, tarihsel migration kapsamı, yeni permission kodlarının nihai
kataloğa eklenmesi. **D-04 (MOSB/MOSB ENERJİ/MOSBİO tenant dili ile `tenant-mapping.ts`
çelişkisi) bu task'ta otomatik düzeltilmedi** — yalnız `backlog/EPIC-005-…md`'deki blocker
tablosunda raporlandı; `OPERATION_CENTER_OWNER_ROLE` tablosu bu çelişkiye **bağımlı değildir**
(rol ataması harici girdi olduğu için).

## Testler

`apps/api/src/operations/domain/__tests__/` — 7 dosya, spesifikasyondaki 12 senaryonun
**tamamını** kapsar: `operation-center.spec.ts` (Kömür Kazanı/Kırım Tesisi kind→rol çözümü, ayrı
tenant kabul edilmemesi, başka tenant'ın merkezinin çözülememesi, MOSEDAŞ/PLATFORM_ROOT sahip
olamaz, `operationCenterId` tek başına yetki değil), `tenant-operation-scope.spec.ts` (çoklu
tenant üyeliği izolasyonu, görüntüleme/veri girişi ayrımı, `operationCenterId` tek başına yetki
vermez, sistem yöneticisi bypass'ı yok, MOSEDAŞ/PLATFORM_ROOT eşlenemez), `ownership-operator.spec.ts`
(sahip≠işletmeci, geçmiş değişim korunur, geçersiz/süresi dolmuş reddedilir, secret/connection
string reddi), `reference-validity.spec.ts`, `external-reference.spec.ts` +
`facility-machine.contract.ts` testleri (MOSEDAŞ yalnız sistem adı, secret/connection string
reddi), `static-guarantees.spec.ts` (NestJS/DB/SQL/permission-kodu/secret/tenant-oluşturma yok;
MOSEDAŞ yalnız iki dosyada; rol tablosu slug'dan türetilmez).

## Doğrulama

- `pnpm --filter api exec tsc --noEmit`: temiz.
- `apps/api/src/operations/domain/__tests__/`: 6 dosya, **94/94** test geçti (7 senaryo grubu:
  operation-center, tenant-operation-scope, ownership-operator, reference-validity,
  external-reference, static-guarantees).
- Tüm API test paketi: **3469/3469** (121 suite) — bu task'ın eklenmesinden önce **3375** olan
  toplam, yeni 94 testle 3469'a çıktı.
- `./scripts/check.sh --skip-docker`: yeşil.

### Yan etki: mevcut TASK-027.58/58-R1 statik güvenlik testlerinin genişletilmesi

Yeni domain modülü MOSEDAŞ'ı iki üretim dosyasında (bağımsız ret kuralı kopyası + dış sistem adı)
andığı için, `apps/api/src/reporting/scada-contract/dec-0014-slug-consistency.spec.ts` ve
`scada-static-security.spec.ts` (TASK-027.58/58-R1'in "her yeni MOSEDAŞ referansı sessizce
geçmez" statik kilidi) **beklendiği gibi kırıldı**. Bu, kilidin çalıştığının kanıtıdır — sessizce
atlanmadı: her iki test dosyasına `operations/domain/` için açık, gerekçeli bir istisna eklendi
(`tenant-identity.ts` = bağımsız ret kuralı kopyası, `external-reference.contract.ts` = yalnız dış
sistem adı, `operation-center.contract.ts`/`tenant-operation-scope.contract.ts` = bu kuralın
tüketicileri) ve `backlog/TASK-027-58-R1-scada-contract-closure.md` envanter tablosuna yeni
satırlar eklendi (aynı testin kendi zorunluluğu). DEC-0014/DEC-0017'nin "MOSEDAŞ tenant değildir"
kararı **değişmedi**; yalnızca aynı korumanın ikinci, bağımsız bir kopyasının varlığı kayda
geçirildi.

## Kesin sınırlar (uygulandı)
Production DB'ye bağlanılmadı, SQL Server bağlantısı kurulmadı, migration/seed yazılmadı/uygulanmadı,
yeni tenant oluşturulmadı, yeni rol/permission kataloğa eklenmedi, API endpoint'i veya web ekranı
açılmadı, Docker çalıştırılmadı, git commit/push yapılmadı.
