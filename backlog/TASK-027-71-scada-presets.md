---
id: TASK-027.71
title: SCADA Preset ve Sanal Kolon Konfigürasyon Engine
status: done
srs_refs: [FR-057, FR-058, FR-059, FR-060, FR-061, TBD-W5-006, AC-020, AC-021]
parent_epic: EPIC-004
related: [TASK-027.68, TASK-027.69, TASK-027.70]
updated_at: 2026-09-24
---

# TASK-027.71: SCADA Preset ve Sanal Kolon Konfigürasyon Engine

> Planlama dosyası: `backlog/TASK-027-71-saved-analysis-presets.md` (TASK-027.62 çıktısı). Bu dosya AI1'in `ready` spesifikasyonuna göre **teslim kaydıdır**; ID aynıdır.

## Durum
done (AI1 onayı, 2026-09-24)

## Amaç
Preset'leri **saf çekirdek** olarak doğrulamak, tenant/sahiplik kapsamında çözmek ve **çalıştırılabilir `AnalysisPlan`** üretmek. Repository, endpoint, web, migration, Nest kaydı yok; gerçek DB/SQL Server yok. Kod: `apps/api/src/reporting/scada/presets/`.

## Teslim edilen
- **Sözleşme** (`scada-preset.contract.ts`): `ScadaPreset` (spesifikasyondaki alanlar + `display`), `PresetLimits` (dışarıdan, eksik/geçersiz ⇒ fail-closed), `PresetErrorCode` (spec listesi + `PRESET_NOT_ACTIVE`), `PresetCaller`, `PresetSourceInfo` (fiziksel ad **yok**), `PresetAuthorizationPort`, `PresetAuditPort`, `AnalysisPlan`. Preset sanal kolonu yalnızca `{virtualColumnId, version?}` tutar; **ifade/AST/SQL/fiziksel şema-tablo-database/bağlantı/credential/çalıştırılabilir kod saklanmaz**.
- **Validator** (`scada-preset.validator.ts`): her iç içelik düzeyinde katı allowlist (bilinmeyen alan ⇒ `PRESET_UNKNOWN_FIELD`; sanal kolon girdisinde fazladan alan ⇒ `PRESET_VIRTUAL_COLUMN_INVALID`), tekrarlar (`PRESET_DUPLICATE_SOURCE/SERIES`), sahip/tenant zorunlulukları, interval/zaman aralığı/saat dilimi (`PRESET_INVALID_INTERVAL/TIME_RANGE/TIMEZONE_UNVERIFIED`), istatistik allowlist (9), karşılaştırma sözleşmesi, filtre allowlist (kalite durumları merkezi sabitten), `LINE|BAR|AREA|TABLE`, tablo sıralama/sayfalama, bağlantı-dizesi benzeri serbest metin reddi. Asla throw etmez; detached kopya döner.
- **Güvenlik** (`scada-preset-security.ts`): `canUsePreset` — kök eşleşmesi, çağıran tenant çözümlenmiş/aktif/çözümlenmiş veri kapsamında, `PLATFORM_ROOT` ve MOSEDAŞ ortak `assertMappableTenant` ile reddedilir (üretim kodunda kural adı geçmez), aktif kullanıcı; `PRIVATE` yalnızca sahip, `TENANT_SHARED` aynı kök. Reddin nedeni söylenmez (`PRESET_SCOPE_BLOCKED`); başka kök preset'i **hiçbir ayrıntı sızdırmaz** (erişim kontrolü doğrulamadan önce).
- **Sürümleme** (`scada-preset-versioning.ts`): monoton sürüm, tekrarlı sürüm no yok, `[effectiveFrom, effectiveTo)`, çakışan ACTIVE ⇒ `PRESET_VERSION_CONFLICT`, ARCHIVED terminal, append-only (`checkAppendOnly`: eski sürüm içeriği sessizce değişmez, yalnız izinli durum geçişi).
- **Resolver** (`scada-preset-resolver.ts`): erişim → doğrulama → sürüm kümesi → etkin sürüm → kaynaklar (aynı kök, aktif, mapping çözülmüş, tenant eşlenebilir ve kapsamda; kaynak saat dilimi doğrulanmış ve preset ile aynı) → seriler (katalogun onayladığı) → sanal kolon referansları (sabitli sürüm ACTIVE+etkin olmalı; sabitsiz: 0 etkin ⇒ `PRESET_VIRTUAL_COLUMN_INVALID`, >1 ⇒ `PRESET_VIRTUAL_COLUMN_VERSION_AMBIGUOUS`; yabancı kök ⇒ `SCOPE_BLOCKED`; katalog uyumu) → SOURCE karşılaştırma kaynakları → **`AnalysisPlan`** (sıralı, deterministik, tenant kapsamı + çözülmüş sanal kolon sürümleri; SQL/fiziksel ad/credential/ifade **yok**; savunma amaçlı `findForbiddenKey` taraması). Çözülemeyen zorunlu referans **tüm planı** bloklar. Saf adaptörler: `planToSeriesRequestBase` (027.68), `planToComparisonInputs` (027.69), `selectPlannedDefinitions` (027.70).
- **Servis** (`scada-preset.service.ts`): `validate`, `checkAppendOnly`, `resolve` (best-effort audit portu), `authorizeShare` — `PRIVATE` ek yetki istemez; `TENANT_SHARED` için **yalnızca `PresetAuthorizationPort`**, port yoksa/hata/`true` değilse fail-closed. **Yeni izin kodu uydurulmadı (Q-W517 açık).**
- **Audit** (yalnızca port): `presetId, presetVersion, customerRootTenantId, actorUserId, scope, result, reasonCode(statik)`; action adı yok (Q-W519), ifade/SQL/kaynak adı/filtre/serbest metin girmez.

## Testler
`presets/__tests__/scada-preset.spec.ts` (87) + `scada-preset-static.spec.ts` (5): PRIVATE/TENANT_SHARED erişimi, farklı kök, çözümsüz/pasif/MOSEDAŞ/PLATFORM_ROOT/kapsam dışı tenant, tekrarlar, bilinmeyen/fiziksel/credential alanlar, preset'te ifade yokluğu, sanal kolon sürüm çözümü/belirsizliği/pencere sınırları, preset sürüm çakışması ve append-only, zaman aralığı/saat dilimi/interval, plan SQL içermez ve tenant kapsamı taşır, 027.68/.69/.70 zincirleri, determinizm, girdi değişmezliği (dondurulmuş), sızıntı, audit metadata, saflık/statik taramalar. Yeni MOSEDAŞ anan spec'ler `TASK-027-58-R1` envanterine eklendi.

## Mutasyon kontrolleri (gerçekten uygulandı, geri alındı, `diff` ile doğrulandı)
| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | PRIVATE'i başkasına aç | yakalandı (2 test) |
| M2 | TENANT_SHARED'i başka köke aç | yakalandı |
| M3/M3b | kaynak kök / veri kapsamı kontrolünü kaldır | yakalandı |
| M4/M4b | MOSEDAŞ/eşlenemez tenant korumasını kaldır (kaynak + çağıran) | yakalandı (3) |
| M5 | çözümsüz mapping'i kabul et | yakalandı |
| M6 | preset'e `expression` alanı ekle | yakalandı |
| M7 / M7b | plana fiziksel şema alanı ekle (tarama açık / kapalı) | yakalandı (15 / 1) |
| M8 | sanal kolon sürüm belirsizliğini yok say | yakalandı |
| M9a/M9b | duplicate series / source kabul et | yakalandı |
| M10 | bilinmeyen alanları kabul et | yakalandı (28) |
| M11 | inaktif preset çalışsın | yakalandı (5) |
| M12 | girdiyi mutasyona uğrat (dondurulmuş girdi) | yakalandı |
| M13 | audit metadata'ya ham ifade ekle | yakalandı |
| M14 | determinizmi boz (sıralama kaldır) | yakalandı |
(M12'nin ilk denemesi derleme hatalıydı ⇒ geçersiz sayıldı, tür-güvenli yeniden yapıldı.)

## Doğrulama
`pnpm --filter api exec tsc --noEmit` temiz; `jest src/reporting --runInBand`: 1114/1114; `./scripts/check.sh --skip-docker` (Q-ENV01 workaround) yeşil. Git commit/push yok; DB/Docker/dev server yok.

## Açık kalanlar
- **Q-W517** açık: `TENANT_SHARED` paylaşma/yönetme yetkisi hangi **mevcut** izinle sınırlanacak — mevcut izin listesi bu task'ta uydurulmadı; motor yalnızca `PresetAuthorizationPort` çağırır, port yoksa paylaşım reddedilir. Karar 027.72 (API) başında gerekir.
- **Q-W533** (yeni, bkz. open-questions): `PRESET_NOT_ACTIVE` kod uzantısı; preset saat diliminin her kaynağın doğrulanmış dilimine eşit olması; filtre/display allowlist içerikleri; `PresetLimits` kaynağı.

## AI1 Onayı ve Kararlar (2026-09-24)
`done`. Q-W533: `PRESET_NOT_ACTIVE` korunur; preset timezone tüm kaynakların doğrulanmış timezone'ına eşit olmak zorunda; filtre/display allowlist'leri kabul; `PresetLimits` sabit kod değil, environment/source profile üzerinden sağlanır, eksik/geçersiz ⇒ bloklanır. Q-W517 kapandı: PRIVATE yalnız owner; TENANT_SHARED aynı customer-root kullanıcıları; paylaşma/değiştirme/silme mevcut customer-root TENANT_ADMIN veya sistem yöneticisi kapsamı (adaptör 027.72'de `PresetAuthorizationPort` ile bağlanır); kullanma/görüntüleme mevcut `REPORT:ARTIFACT:VIEW`; yeni permission kodu eklenmez.

## API resolver referansı (TASK-027.72)
Resolver `ScadaAnalysisApiService` içinden çağrılır (`backlog/TASK-027-72-scada-reporting-api.md`): ad-hoc analiz istekleri geçici bir PRIVATE preset olarak aynı `resolvePreset` yolundan geçer; `PRESET_SCOPE_BLOCKED` API'de `SCADA_NOT_FOUND` (404) olur, `PRESET_NOT_ACTIVE` → 409 `SCADA_PRESET_NOT_ACTIVE`. Preset okuma uçları: `GET /reports/:code/analysis/presets[/:presetId]`.
