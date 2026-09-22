---
id: TASK-027.15-R1
title: Tenant Conflict Access Gate Correction
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

## AI2 Teslim Raporu — Tenant Conflict Access Gate Correction (2026-09-18)

### Amaç

AI1'in TASK-027.15 incelemesinde tespit ettiği kritik tutarsızlığı düzeltmek: çakışan tenant
mapping kayıtları `FATAL_CONFLICTING_TENANT_ASSIGNMENT` olarak raporlanmasına rağmen
`MigrationRunService`'in (ve `computeTenantMappingCoverage`'ın) çakışan kullanıcıya yine de bir
tenant membership/`ASSIGNED` durumu yazması — bir güvenlik açığı.

### Kök Neden

`duplicate-detection.ts`'teki `detectConflictingTenantAssignments()`, bir çakışma tespit ettiğinde
`FATAL` issue'yu doğru şekilde üretiyordu, ama `resolved` map'inde çakışan kullanıcının **ilk
kaydını** tutmaya devam ediyordu ("ilk kayıt esas alındı" — bu yorum deterministik *raporlama*
için düşünülmüştü, ama aynı zamanda gerçek atama değeri olarak da kullanılıyordu).
`MigrationRunService.run()` ve `computeTenantMappingCoverage()`, tenant assignment index'i bu
`resolved` map'inden inşa ettiği için, ikisi de çakışan kullanıcıyı yanlışlıkla `ASSIGNED` olarak
işliyor ve `targetState.tenantMembershipsByUserId`'e bir satır yazıyordu (veya coverage'da
`assignedUsers`'a dahil ediyordu). Orijinal TASK-027.15 testleri bu **yanlış** davranışı "doğru"
olarak doğruluyordu — bu da tutarsızlığın ilk teslimde fark edilmemesinin sebebiydi.

### Düzeltme

`duplicate-detection.ts`'teki `detectConflictingTenantAssignments()` **tek noktadan** düzeltildi:
bir çakışma tespit edildiğinde, o kullanıcı `resolved` map'inden **tamamen çıkarılır** (silinir) ve
bir daha o kullanıcı için tabloda başka bir kayıt gelse bile yeniden eklenmez
(`conflictedUserLegacyIds` seti ile izlenir — duplicate fatal issue üretilmesi de önlenir).
`MigrationRunService.run()` ve `computeTenantMappingCoverage()` **hiç değiştirilmedi** — ikisi de
zaten `resolved`'dan yoksun bir kullanıcıyı "mapping tablosunda yok" yoluyla `UNRESOLVED` olarak
işliyordu, düzeltme bu mevcut, doğru yolu otomatik olarak devreye soktu.

### Değiştirilen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `duplicate-detection.ts` | `detectConflictingTenantAssignments()` — çakışan kullanıcı artık `resolved`'dan siliniyor, ilk kayıt asla erişim değeri olarak kullanılmıyor |
| `duplicate-detection.spec.ts` | 1 test yeniden yazıldı (yanlış "ilk kayda çözülür" beklentisi düzeltildi), 2 yeni test eklendi (üçüncü girdi tekrar eklemiyor, diğer kullanıcılar etkilenmiyor) |
| `tenant-coverage.spec.ts` | 1 test düzeltildi (`assignedUsers` artık 0, `unresolvedUsers` çakışan kullanıcıyı içeriyor) |
| `tenant-governance.spec.ts` | 2 test düzeltildi (membership artık `toHaveLength(0)`), yeni bir `describe` bloğu eklendi (5 test: iki kez çalıştırma erişim üretmiyor, düzeltilmiş mapping ile tek geçerli membership, başka kullanıcıları etkilememe, deterministik rapor, DRY_RUN güvenlik davranışı) |
| `docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` | §0-C'ye R1 düzeltme notu + §0-C.2/§0-C.4/§0-C.5/§0-C.6'daki yanlış açıklamalar düzeltildi |

`MigrationRunService`, `tenant-mapping.ts`, `tenant-mapping-adapter.ts`, `role-template.service.ts`,
`permission-mapping.ts` — **hiçbiri değiştirilmedi** (kapsam madde 1).

### Test Kanıtı

- Tek kullanıcı, iki farklı tenant slug çakışması → `targetState.tenantMembershipsByUserId.size === 0`.
- Aynı çakışma iki kez çalıştırılır → her ikisinde de membership yok (`tenant conflict access gate` describe bloğu, ilk test).
- Çakışma düzeltilmiş yeni mapping tablosuyla yeniden çalıştırma → tam olarak bir geçerli membership oluşur, `report.tenantMembershipResults.assigned === 1`.
- Çakışma başka bir kullanıcıyı (`userLegacyId: '2'`) etkilemiyor — o kullanıcı normal şekilde `ASSIGNED` olur.
- Çakışma raporu (`DryRunReport`), aynı girdiyle iki kez çalıştırıldığında birebir aynı (timestamp hariç).
- `DRY_RUN` modunda çakışma varken hiçbir yazma olmuyor (`stagingStore`/`targetState` boş kalıyor), ama `FATAL_CONFLICTING_TENANT_ASSIGNMENT` yine de raporlanıyor.
- `Sirket` hâlâ hiçbir yerde okunmuyor (önceki testler değişmeden korundu ve hâlâ geçiyor).
- Orphan/boş-slug/geçersiz-slug davranışları bozulmadı (`source-validation.spec.ts`'in tamamı değişmeden geçiyor).

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **109/109 test PASS** (12
  suite — TASK-027.15'in 102 testinden 4'ü düzeltilmiş güvenli davranışı yansıtacak şekilde
  güncellendi, 7 yeni test eklendi; TASK-027.12/13/14'ün testlerinin **hiçbiri** değişmedi/bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı. Gerçek SQL
  Server/PostgreSQL bağlantısı veya apply yapılmadı.

### Kapsam Dışı (görev talimatına uygun, korundu)

Q-T01, Q-S03, Q-ID01, Q-P02 ve Wave 2/Wave 3 — hiçbirine dokunulmadı. `Sirket`, `TenantScopeService`,
root aggregate kararlarına dokunulmadı (statik dosya taraması testleri değişmeden geçiyor).

### Durum (2026-09-18 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle güvenlik düzeltmesi onaylandı (bkz. aşağıdaki
"AI1 Final Onayı" bölümü). TASK-027.15'in ana kaydı da bu onayla birlikte `done` olarak
güncellenmiştir.

## AI1 Final Onayı (2026-09-18)

R1 düzeltmesi onaylandı ve `done` olarak kapatıldı. Conflict durumunda kullanıcının
`resolved` map'inden çıkarıldığı, `UNRESOLVED` yoluyla hiçbir tenant membership veya
runtime erişim üretilmediği ve conflict düzeltildikten sonra yeni mapping ile güvenli
şekilde `ASSIGNED` olabildiği doğrulandı.

`./scripts/check.sh --skip-docker` PASS ve 27 suite / 208 test kanıtı kabul edildi.
