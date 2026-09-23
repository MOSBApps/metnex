# Metnex — Platform Privilege Model ve Tenant Role Delegation Karar Paketi (Q-DP24)

Task: TASK-027.43 · Tarih: 2026-09-21 · Yazar: AI2 · Durum: **karar ve kanıt paketi — production authorization kodu DEĞİŞTİRİLMEDİ** · TASK-027.44 (kapanış formu §14): **AI1/PO kararı BEKLİYOR**

> AI2 yalnızca kanıtı, seçenekleri ve öneriyi hazırlar; **Q-DP24'ü kapatan nihai karar AI1/Product Owner'ındır.** Bu belgede yeni permission veya rol **uydurulmamıştır**: "yeni izin/rol gerekir" denen yerlerde ad verilmemiş, yalnızca ihtiyaç tarif edilmiştir. Gerçek DB/HTTP/kullanıcı/rol verisi kullanılmadı; gerçek ortamda doğrulanamayanlar `[DOĞRULANAMADI]` ile işaretlidir. Bu belgeye gerçek secret, token, parola, hash veya kullanıcı verisi yazılmamıştır. Kanıtlar `privilege-model-evidence.spec.ts` ile (salt-okunur, statik) sabitlenmiştir; kanıtlanan bir olgu değişirse test kırılır ve bu paket güncellenmelidir.

## 1. Özet

- Bugünkü (TASK-027.42 sonrası) model **Seçenek A**'dır: global rol değişiklikleri yalnızca ACTIVE sistem yöneticisine açık, sistem yöneticisi hedefleri yalnızca sistem yöneticileri tarafından yönetilebilir, sistem yöneticileri birbirini yönetebilir, tenant-kapsamlı roller mevcut route izniyle atanır.
- Kod incelemesinin ortaya koyduğu **kritik yapısal gerçekler** (karar bunlara dayanmalı):
  1. **Üç yetki temsili var:** `users.isSystemAdmin` bayrağı (guard'ı kısa devre yapar), `SYSTEM_ADMIN` sistem rolü ataması (bayrakla yalnızca `assignRole`/`revokeRole`/bootstrap eliyle senkron) ve global (`tenantId` null) sistem-rol atamaları (PLATFORM:* izinlerinin tek kaynağı).
  2. **"Tenant rolü" yönetim yüzeyi yoktur:** `tenant_roles`/`tenant_role_permissions`/`user_tenant_role_assignments` tabloları yalnızca **okunur**; hiçbir servis yazmaz. Bugün fiilen çalışan tenant-kapsamlı yetki `TENANT_ADMIN` **sistem rolünün** bir customer root'ta atanmasıdır.
  3. **Tenant kapsamında `TENANT_ADMIN` her şeydir:** `PermissionGuard`, customer root'ta `TENANT_ADMIN` ataması olan kullanıcıya PLATFORM dışı **tüm** izinleri verir (rolün izin listesine bakılmaz). `TENANT_ADMIN` dışındaki sistem rolleri tenant kapsamında atanırsa **etkisizdir**. Aynı `TENANT_ADMIN` rolü **global** atanırsa izin listesi (`PLATFORM:USER:CREATE/UPDATE`, `PLATFORM:TENANT:CREATE/UPDATE`, …) geçerli olur.
  4. **Delegasyon üst sınırı yoktur:** özel role **herhangi bir** katalog izni verilebilir; ancak bu izinlerin (ROLE:CREATE, PERMISSION:ASSIGN, ASSIGN_ROLE, REVOKE_ROLE, MANAGE_MEMBERSHIP, DEACTIVATE) tek sahibi bugün `SYSTEM_ADMIN` rolüdür — yani delegasyon **latent** (yetkili tek küme sistem yöneticileri).
  5. **Müşteri yöneticisi rol veremez** (customer-admin yüzeyinde rol/izin endpoint'i yok) — tenant-rol delegasyonu ürün kararıdır.
  6. **Tenant scope roller'den bağımsızdır:** `TenantScopeService` yalnızca tenant satırından (`canAggregateChildren`, tip, durum) ve registry'den çözer.
- **AI2 önerisi (özet):** kademeli **A → B'nin çekirdeği**, C'yi ayrı bir kapıya bırak: (1) şimdi A'yı kalıcı kabul et ve kanıtlı boşlukları (`assignRole` tenant tip doğrulaması, bayrak↔rol senkron invariant'ı) kapat; (2) `SYSTEM_ADMIN`/global rol verme-alma için **sahip olmadığın ayrıcalığı veremezsin** üst sınırı + MFA'lı oturum + impersonation'da yasak (B çekirdeği); (3) ayrı izin/servis/iki-aşamalı onay (C) yalnızca ikinci bir sistem yöneticisi zorunlu hâle gelirse veya müşteri tenant-rol delegasyonu ürün gereksinimi olursa. Ayrıntı §5.

## 2. Kanıtlar (E1–E7)

| # | Kanıt | Kaynak | Test |
|---|---|---|---|
| E1 | Katalog **30** izin; yerleşik roller **SYSTEM_ADMIN** (katalogun tamamı), **TENANT_ADMIN** (`PLATFORM:USER:VIEW/CREATE/UPDATE`, `PLATFORM:ROLE:VIEW`, `PLATFORM:TENANT:VIEW/CREATE/UPDATE`, `CUSTOMER:ADMIN:VIEW/MANAGE`, `REPORT:ARTIFACT:VIEW/EXPORT`), **VIEWER** (`PLATFORM:USER/TENANT/ROLE:VIEW`). `ASSIGN_ROLE`, `REVOKE_ROLE`, `MANAGE_MEMBERSHIP`, `DEACTIVATE`, `ROLE:CREATE`, `PERMISSION:ASSIGN` yalnızca SYSTEM_ADMIN'de. **Katalog boşluğu:** tenant ayar uçlarının kullandığı `SETTINGS:SMTP:*`/`SETTINGS:AI_PROVIDER:*` kodları katalogda **yok** (yalnızca sistem yöneticisi bayrağı veya customer-root `TENANT_ADMIN`'i geçer). | `domain/system-role.domain.ts`, `role.service.ts` (`KNOWN_PERMISSIONS`), `tenant-settings-*.controller.ts` | E1 |
| E2 | `PermissionGuard`: (1) `user.isSystemAdmin` → hepsi; (2) `PLATFORM:*` yalnızca **global** (`tenantId IS NULL`) atamaların `rolePermissions`'ından; (3) diğer izinler: header tenant'ın customer root'unda `TENANT_ADMIN` ataması → **her şey**, yoksa `tenantRolePermissions` (system-role izin listesi kullanılmaz). Header yetki değil ipucudur. | `platform/permission.guard.ts` | E2 |
| E3 | Tenant-rol tabloları **yalnızca okunur** (guard, `MeService`, `MfaRequirementService`); yazan kod yok → tenant-rol yönetimi bugün **yok**. Customer-admin'de rol/izin endpoint'i yok. | `permission.guard.ts`, `me.service.ts`, `mfa-requirement.service.ts`, `saas.controller.ts` | E3 |
| E4 | `listAssignableRoles` **tüm** sistem rollerini (SYSTEM_ADMIN dahil) döndürür; `assignRole` tenant tipini doğrulamaz (PLATFORM_ROOT/alt tenant için `TENANT_ADMIN` ataması kabul edilir — etkisiz/anlamsız); `SYSTEM_ADMIN`↔`users.isSystemAdmin` senkronu yalnızca `assignRole`/`revokeRole`/bootstrap; **iki son-yönetici koruması farklı şeyi sayar** (revoke: SYSTEM_ADMIN atama sayısı; deactivate: ACTIVE bayraklı kullanıcı sayısı). Bootstrap hem bayrağı hem rol atamasını yazar. TASK-027.42: `assertMayAdminister`, yedi mutasyon. | `user.service.ts`, `bootstrap.service.ts` | E4 |
| E5 | Özel role **herhangi** bir mevcut izin verilebilir (actor'ın kendi izinleriyle sınırlanmaz); yerleşik roller salt okunur. | `role.service.ts` | E5 |
| E6 | `TenantScopeService` rol tablolarına hiç dokunmaz; PLATFORM_ROOT için scope çözmez (fail-closed); `canAggregateChildren` yalnızca veri kapsamını genişletir. | `tenant-scope/tenant-scope.service.ts` | E6 |
| E7 | Impersonation: yalnızca ACTIVE sistem yöneticisi başlatır; token **hedefin** `isSystemAdmin`'ini, `mfaVerified: true` ve `impersonatorUserId`'yi taşır; her istekte `request.user` DB'den okunur; ayrıcalıklı işlemleri impersonation oturumunda engelleyen kural **yok** (Q-DP22c). | `auth.service.ts` | E7 |
| — | Gerçek ortamda hangi kullanıcıların global rol/`TENANT_ADMIN` taşıdığı, kaç sistem yöneticisi olduğu, özel rol var mı | — | **[DOĞRULANAMADI]** (DB'ye bağlanılmadı; §9 salt-okunur ön kontroller) |
| — | `PackageFeatureGuard` (scope servisinin yorumunda anılıyor) | koddan | **[DOĞRULANAMADI]** — kodda bulunamadı |

## 3. Global rol ve tenant rolü ayrım tablosu (bugünkü gerçek)

| Boyut | Global sistem rolü (`userSystemRoleAssignments.tenantId = NULL`) | Tenant-kapsamlı sistem rolü (`tenantId = <root>`) | Tenant rolü (`tenant_roles` + `user_tenant_role_assignments`) |
|---|---|---|---|
| Nasıl verilir | `POST platform/users/:id/roles` (tenantId'siz) — bugün yalnızca ACTIVE sistem yöneticisi (027.42) | aynı endpoint (tenantId ile) — route izni `ASSIGN_ROLE` | **Verilebilir yüzey yok** (yazan kod yok) |
| Neyi kontrol eder | `PLATFORM:*` izinleri (rolün izin listesinden); `SYSTEM_ADMIN` ayrıca `users.isSystemAdmin`'i çevirir | Yalnızca `TENANT_ADMIN` etkili: o root'un tüm ağacında PLATFORM dışı **her** izin + customer-admin yüzeyi (`assertCustomerAdminScope`) | Guard'da `tenantRolePermissions.permissionCode` (serbest metin); customer-admin izinleri root atamasından alt tenant'a taşınır (`me.service`) |
| Diğer sistem rolleri (VIEWER/özel) | İzin listesi PLATFORM:* olarak etkili | **Etkisiz** (guard bakmaz) | — |
| Tenant izolasyonu | Yok (platform geneli) | Root'a bağlı; alt tenant/başka root'a taşmaz (`assertCustomerAdminScope`) | Atandığı tenant ve root'tan `CUSTOMER:ADMIN:*` |
| Root tenant etkisi | PLATFORM_ROOT bağlamında geçerli | PLATFORM_ROOT/alt tenant'ta `TENANT_ADMIN` ataması kabul edilir ama anlamsız/inert (doğrulama yok) | — |
| Veri kapsamı | Etkilemez | Etkilemez (`TenantScopeService` rol bilmez) | Etkilemez |
| MFA | `mfaRequired` politikası/`requiresMfa` **zorlanmıyor** (Q-DP22b) | aynı | `requiresMfa` alanı var, zorlanmıyor |

**Kesin sınır (bugün):** yetkinin platforma mı müşteriye mi ait olduğunu belirleyen tek şey atamadaki **`tenantId`'nin null olup olmaması**dır; aynı `TENANT_ADMIN` adı iki farklı yetki üretir (global → PLATFORM:* listesi; root'ta → tenant kapsamında her şey). Bu, en büyük yanlış-yapılandırma riskidir (yanlışlıkla global `TENANT_ADMIN` vermek platform yazma izinleri açar).

## 4. Seçenekler

- **A — Mevcut geçici model (027.42):** global rol yalnızca ACTIVE sistem yöneticisine; sistem yöneticileri birbirini yönetir; tenant rolleri mevcut izinle.
- **B — Üst ayrıcalık sınırı:** actor sahip olduğundan yüksek ayrıcalık veremez (`SYSTEM_ADMIN`/global rol yalnızca daha yüksek veya eşit **doğrulanmış** ayrıcalıkla ve ayrı işlem olarak); sistem yöneticileri birbirini yönetemez **veya** ikinci onay gerekir; `SYSTEM_ADMIN` ataması özel işlem.
- **C — Ayrı privilege yönetim modeli:** global rol yönetimi için ayrı permission/servis; tenant rol yönetimi ayrı scope kurallarıyla; `SYSTEM_ADMIN` iki aşamalı/onaylı.

| Kriter | A | B | C |
|---|---|---|---|
| **Tenant izolasyonu** | Değişmez (`TENANT_ADMIN` root'a bağlı). Global `TENANT_ADMIN` yanlış verilebilir (§3 riski) | Global rol verme daralır → yanlışlıkla global `TENANT_ADMIN` riski azalır; tenant kapsamı aynı | En güçlü: global/tenant yönetimi ayrı yüzey ve kurallar; `TENANT_ADMIN` adı belirsizliği ayrı kodlarla çözülür |
| **Root tenant etkisi** | PLATFORM_ROOT'ta anlamsız atama mümkün | + tenant tipi doğrulaması ile kapatılır | Tenant rolü yalnızca `ROOT` (ve alt tenant) için tanımlanabilir |
| **PermissionGuard uyumu** | Tam uyumlu (değişiklik yok) | Guard değişmez; kontrol servis katmanında | Yeni izin kodu katalog+seed+rol atamasını gerektirir; guard'ın `PLATFORM:` dalı yeni koda uyar; tenant kapsamında `TENANT_ADMIN` "her şey" kısa devresi gözden geçirilmeli |
| **Audit gereksinimi** | Mevcut kodlar yeterli (027.42) | + "yetki üst sınırı reddi", MFA/impersonation reddi, ikinci onay olayları | + talep/onay/red/iptal olayları, onaylayan kimliği |
| **Impersonation etkisi** | Impersonation sysadmin'i impersonate eden **ikinci** bir sysadmin ayrıcalıklı işlem yapabilir (Q-DP22c) | Ayrıcalıklı işlemlerde impersonation oturumu **yasak**; audit'te impersonator | Aynı + onay akışında impersonation'ın onaylayıcı olması yasak |
| **Geri dönüş maliyeti** | Sıfır (mevcut) | Düşük–orta: servis kuralları + testler; bayrakla geri alınabilir | Yüksek: şema/seed/yeni izin/rol migration'ı, UI, iki aşamalı akış; geri alma veri geçişi ister |
| **Operasyonel uygulanabilirlik** | Tek yönetici olsa da çalışır | **Tek sistem yöneticili** kurulumda "birbirini yönetemez/ikinci onay" kilitlenme yaratır → break-glass gerekir | İkinci yönetici zorunlu; küçük ekipler için ağır |
| **Mevcut kullanıcı/rol verisine etkisi** | Yok | Yok (yalnızca yeni işlemler daralır); [DOĞRULANAMADI] mevcut global `TENANT_ADMIN`/özel rol atamaları için ön kontrol şart | Var: mevcut atamaların yeni modele taşınması/yeniden atanması |
| **Kapatılan riskler** | F4 (027.42) | + delegasyon yükselmesi, sysadmin ele geçirme yayılımı, impersonation kötüye kullanımı | + tam ayrılık, onaylı yükseltme |
| **Kalan riskler** | Eş yönetici ele geçirmesi tüm platformu düşürür; bayrak↔rol drift'i; global `TENANT_ADMIN` yanlış yapılandırma | Tek admin kilitlenmesi; ikinci onay yoksa hâlâ eş-yönetim | Karmaşıklık/uygulama hataları; onay akışı istismarı |

## 5. Q-DP24 karar matrisi (alt kararlar, seçenekler, AI2 önerisi, boş karar alanı)

| # | Soru | Seçenekler | AI2 önerisi | AI1/PO kararı |
|---|---|---|---|---|
| **a** | Kim `SYSTEM_ADMIN`/global rol **verebilir**? | A1 ACTIVE sistem yöneticisi (bugün) · A2 sistem yöneticisi + MFA'lı oturum + impersonation dışı · A3 ayrı yeni izin/servis (C) | **A2** (B çekirdeği); A3 yalnızca ikinci admin şartı doğarsa | **KARAR (AI1):** yalnızca aktif `SYSTEM_ADMIN` (→ §14.2 satır 1) |
| **b** | Kim `SYSTEM_ADMIN`/global rol **alabilir (geri alır)**? | Verme ile aynı · daha sıkı (ikinci onay) | Verme ile aynı kural; **son yönetici invariant'ı** ayrıca (aşağıda) | **KARAR (AI1):** verme ile aynı kural (→ §14.2 satır 1); son yönetici invariant'ı satır 8 |
| **c** | Sistem yöneticileri birbirini yönetebilir mi (parola/ad/deactivate/rol)? | c1 evet (bugün) · c2 hayır — yalnızca kendi hesabı üzerinde sınırlı işlem + başka sysadmin'e işlem **ikinci onay** ister · c3 evet ama yalnızca MFA'lı oturumla ve impersonation dışı | **c3** (kısa vade); c2 ikinci admin varsa | **KARAR (AI1):** parola/rol işlemlerinde **hayır**, deactivation/containment serbest (→ §14.2 satır 2; §14.5-A/G) |
| **d** | Actor sahip olduğundan yüksek ayrıcalık verebilir mi? (delegasyon üst sınırı) | d1 sınırsız (bugün; latent) · d2 verilen rolün izinleri ⊆ actor'ın etkin izinleri (sysadmin hariç kural: yalnızca sysadmin `SYSTEM_ADMIN` verir) · d3 yalnızca sysadmin herhangi rol verir | **d2 + d3 birlikte** (özel rollerin sızdırılmasını önler; uygulaması küçük) | **KARAR (AI1):** tavan var — yüksek etkin izin kümesi verilemez (→ §14.2 satır 3; §14.5-C) |
| **e** | Tenant-kapsamlı roller kim tarafından atanabilir? | e1 yalnızca platform `ASSIGN_ROLE` (bugün) · e2 e1 + müşteri yöneticisi **kendi root'unda** `TENANT_ADMIN` verebilir (yeni customer-admin endpoint'i) · e3 müşteri yöneticisi + ayrı tenant-rol yönetimi (tenant_roles yazma yüzeyi) | **e1 şimdilik**; ürün talebi doğarsa e2 (F1 sınıfı kapsam sertleştirmesi bittiği için güvenli) | **KARAR (AI1):** yeni permission + ayrı task (→ §14.2 satır 6); şimdilik yalnızca platform yolu |
| **f** | Global ↔ tenant rol sınırı | f1 `tenantId` null/dolu (bugün) · f2 aynı ad ama **ayrı roller** (global rol = `PLATFORM_ADMIN`-benzeri; tenant rolü = `TENANT_ADMIN`) — yeni rol gerektirir · f3 doğrulama: global atamada yalnızca izin verilmiş rol listesi; tenant atamada yalnızca `TENANT_ADMIN` ve **yalnızca `ROOT` tenant** | **f3** (yeni rol/izin gerektirmez) ve f2'yi C ile birlikte değerlendir | **KISMEN (AI1):** global `TENANT_ADMIN` yasak; kalan sınır kuralları teyit bekliyor (→ §14.2 satır 4–5; §14.5-D) |
| **g** | Bayrak (`users.isSystemAdmin`) ↔ rol ataması ikiliği | g1 bugünkü (iki temsil) · g2 tek kaynak: rol ataması; bayrak türetilmiş/yalnızca önbellek (drift kontrolü/invariant testi) · g3 bayrağı kaldır, guard rol atamasından çözsün | **g2** (invariant + periyodik doğrulama); g3 büyük değişiklik | **KARAR (AI1):** canonical = rol ataması, bayrak türetilmiş + drift kontrolü (→ §14.2 satır 7) |
| **h** | Sistem yöneticisi koruma | h1 son-yönetici koruması (iki farklı sayım — bugün) · h2 tek tanımlı invariant (ACTIVE bayraklı ≥ 1 **ve** SYSTEM_ADMIN ataması ≥ 1, her iki yolda aynı) · h3 h2 + break-glass (env bootstrap ile geri kazanım, denetlenen) · h4 h2 + ≥ 2 sistem yöneticisi uyarısı | **h2 + h4**; break-glass için mevcut `SYSTEM_ADMIN_*` env bootstrap'ının tekrar çalışma koşulları ayrıca karara bağlansın | **KARAR (AI1):** canonical rol atamalarına göre tek invariant (→ §14.2 satır 8); ≥2 yönetici uyarısı AI1 setinde yok (açık) |
| **i** | Impersonation ile ayrıcalık | Bkz. §7 | §7 önerisi | **KARAR (AI1):** impersonation'da privilege değişikliği yasak (→ §14.2 satır 9); sysadmin impersonate yasağı karara bağlanmadı |
| **j** | Katalog boşluğu (`SETTINGS:*`) | j1 olduğu gibi (yalnızca sysadmin/`TENANT_ADMIN`) · j2 kataloğa ekle (yeni izin gerektirir — **ayrı onay**) | Bu kararla ilgisiz ama tenant-rol delegasyonu (e3) için önkoşul; kararı e ile birlikte | **AÇIK:** AI1 setinde yok (katalog boşluğu `SETTINGS:*`); tenant-rol delegasyonu task'ında ele alınır (→ §14.2 satır 6) |

## 6. Actor / target privilege matrisi

Satırlar actor, sütunlar işlem. **✓** izinli, **✗** reddedilir (403), **~** koşullu. "Bugün" = 027.42 sonrası kod; A/B/C = seçenek sonrası hedef.

Actor türleri (kanıtlı olanlar): **SA** = ACTIVE sistem yöneticisi (bayrak+rol); **PA** = SYSTEM_ADMIN olmayan, ama global bir rolle `PLATFORM:USER:*` izinleri olan platform yöneticisi (bugün yalnızca özel/global rol atamasıyla mümkün; **[DOĞRULANAMADI]** gerçekte var mı); **TA** = bir customer root'ta `TENANT_ADMIN` (tenant-kapsamlı); **U** = sıradan kullanıcı; **IMP** = impersonation oturumu (öznesi hedef kullanıcı).

| İşlem (hedef) | SA — bugün | PA — bugün | TA — bugün | U | IMP(sıradan özneli) | B'de SA | B'de PA | C'de |
|---|---|---|---|---|---|---|---|---|
| Sıradan kullanıcı: ad/parola/deactivate | ✓ | ✓ | ✗ (platform yüzeyi yok; customer-admin kapsamında kendi root'unda ✓) | ✗ | özne izinlerine göre | ✓ | ✓ | ✓ (yönetim servisi) |
| Sistem yöneticisi hedef: ad/parola/deactivate | ✓ (eş yönetimi — c) | ✗ | ✗ | ✗ | ✗ (özne sysadmin değilse) | c2/c3'e göre ~ | ✗ | ~ (onaylı) |
| `SYSTEM_ADMIN` verme/alma | ✓ (son admin korumalı) | ✗ | ✗ | ✗ | ✗ | ~ (MFA'lı, impersonation dışı, üst sınır) | ✗ | ~ (iki aşamalı) |
| Global rol verme/alma (`TENANT_ADMIN`, özel) | ✓ | ✗ | ✗ | ✗ | ✗ | ~ (üst sınır d2) | ✗ | ~ (ayrı izin) |
| Tenant-kapsamlı `TENANT_ADMIN` verme (root R) | ✓ | ✓ (route izni; bugün latent) | ✗ (yüzey yok) | ✗ | özne izinlerine göre | ✓ | ~ (tenant tip doğrulaması + üst sınır) | ~ (ayrı scope kuralı) |
| Üyelik ekle/kaldır (sıradan hedef) | ✓ | ✓ | ✓ yalnızca kendi root'unda (customer-admin, F1 sonrası kapsamlı) | ✗ | özne izinlerine göre | ✓ | ✓ | ✓ |
| Üyelik ekle/kaldır (sistem yöneticisi hedef) | ✓ | ✗ | ✗ (customer-admin sysadmin hedefi reddeder) | ✗ | ✗ | ✓ | ✗ | ~ |
| Impersonation başlatma | ✓ (yalnızca SA, DB'den) | ✗ | ✗ | ✗ | ✓ eğer özne SA ise (zincirleme; Q-DP22c) | ✓ (kısıt §7) | ✗ | ✗ |
| Özel rol oluşturma / role izin verme | ✓ (tek sahip) | ✗ | ✗ | ✗ | ✗ | ✓ + üst sınır | ✗ | ~ (ayrı izin) |
| Customer-admin yüzeyi: kendi root'undaki kullanıcı parolası (sistem yöneticisi olmayan) | ✓ (sysadmin her root'a) | — | ✓ (R1) | ✗ | özne izinlerine göre | ✓ | — | ✓ |

## 7. Impersonation davranış matrisi

Bugün: yalnızca ACTIVE sistem yöneticisi başlatır; token **hedefin** bayrağını ve `mfaVerified: true` taşır; hedef sysadmin ise oturum tam sistem yöneticisi yetkisidir; ayrıcalıklı işlem kısıtı yok; audit'te `impersonatorUserId` (027.41-R1/.42'de yazılıyor).

| Senaryo | Bugün | Seçenek i1 (kısıtlama yok) | i2 (**önerilen**) | i3 (impersonation'ı sadece okuma) |
|---|---|---|---|---|
| Sıradan kullanıcıyı impersonate et; ayrıcalıklı işlem dene | Reddedilir (özne sysadmin değil) | aynı | aynı | aynı |
| Sistem yöneticisini impersonate et | İzinli; tam yetki | izinli | **Yasak** (sysadmin impersonate edilemez) | yasak |
| Impersonation oturumunda parola/rol/MFA-reset/`SYSTEM_ADMIN` işlemleri | (özne sysadmin ise) izinli | izinli | **Yasak** (tüm güvenlik/ayrıcalık işlemleri) | tüm mutasyonlar yasak |
| Impersonation oturumunda sıradan mutasyon (üyelik vb.) | özne izinlerine göre | izinli | izinli, audit'te impersonator | yasak |
| `mfaVerified` | hep `true` (impersonator'ın MFA'sı kanıtlanmaz) | aynı | impersonation başlatmak MFA'lı oturum ister; token `mfaVerified` **impersonator'ın** durumunu yansıtır | aynı |
| Süre | `JWT_IMPERSONATION_EXPIRES_IN` (varsayılan 1 saat) | aynı | ≤ 1 saat, tekrar başlatma audit'li | — |
**AI2 önerisi: i2.** Uygulama noktası: `request.user.impersonation === true` iken ayrıcalık işlemlerini reddet (servis içinde, controller değil); audit metadata'sında `impersonatorUserId` zorunlu. Q-DP22c (mfaVerified/self-reset/impersonation) ile birlikte karara bağlanmalıdır.

## 8. Sistem yöneticisi koruma seçenekleri

| Koruma | Ne yapar | Etki | Maliyet | Öneri |
|---|---|---|---|---|
| Son-yönetici invariant'ı (h2) | Her iki sayım (bayrak + rol ataması) ≥ 1 ve aynı kural iki yolda | Kilitlenmeyi önler; bugünkü iki farklı sayımı birleştirir | Düşük | **Evet** |
| ≥ 2 sistem yöneticisi uyarısı (h4) | Yalnızca bir SA varsa audit/operasyon uyarısı | Görünürlük | Düşük | Evet |
| MFA'lı oturum şartı | `SYSTEM_ADMIN`/global rol/eş-yönetimi işlemlerinde `mfaVerified` (impersonation hariç değil) | Çalınmış parola-only oturumu keser | Düşük–orta; MFA'sız ilk admin için kurtarma yolu şart | **Evet** (MFA'sı olmayan admin için geçici izin + uyarı) |
| Yükseltme cool-down / bildirim | `SYSTEM_ADMIN` verildiğinde diğer yöneticilere bildirim, süre gecikmesi | Tespit penceresi | Orta (bildirim altyapısı yok — **[DOĞRULANAMADI]**) | İleri aşama |
| İki kişi kuralı | İkinci sistem yöneticisi onayı | En güçlü | Yüksek; tek admin kilitler | Yalnızca ≥ 2 admin zorunlu olursa |
| Break-glass | Denetlenen, sınırlı acil erişim (env bootstrap yeniden çalıştırma koşulu) | Kilitlenme çözümü | Orta; ayrı tasarım | Karara bağla |
| Bayrak↔rol drift kontrolü (g2) | Periyodik/başlangıç doğrulaması: bayraklı ⇔ global SYSTEM_ADMIN ataması | Sessiz yetki farkını yakalar | Düşük | **Evet** |

## 9. Audit olayları ve zorunlu metadata sözleşmesi

**Mevcut (kod):** `SYSTEM_ROLE_GRANTED`, `SYSTEM_ROLE_REVOKED`, `USER_UPDATED`, `USER_PASSWORD_RESET`, `USER_DEACTIVATED`, `TENANT_MEMBERSHIP_ADDED/REMOVED`, `USER_IMPERSONATION_STARTED`, `MFA_ADMIN_RESET`, `CUSTOMER_*` (027.41-R1). Ret/hata aynı eylem koduyla `result: DENIED|FAILED` + statik `reason`.
**Zorunlu metadata (tüm ayrıcalık olayları):** `actorId` (audit sütunu), `targetUserId`, `result` (`SUCCESS|DENIED|FAILED`), `reason` (ret/hata için statik kod), `roleName`, `scope` (`GLOBAL|TENANT`) ve tenant scope'ta `tenantId`/`customerRootId`, `impersonatorUserId` (varsa), `sessionMfaVerified` (öneri), önceki/sonraki durum (`before/after` yalnızca kimlik/durum alanları). **Asla:** parola, hash, token, OTP, MFA secret, request gövdesi.
**Karar sonrası eklenmesi önerilen yeni olay kodları (öneri — ad AI1'dedir; şimdi eklenmedi):** üst-sınır reddi (`reason`: privilege ceiling), MFA'sız oturum reddi, impersonation oturumu reddi, bayrak↔rol drift tespiti, son-yönetici invariant ihlali reddi; C seçilirse: yükseltme talebi/onayı/reddi/iptali (onaylayan kimliği zorunlu).
**Başarı audit'i zorunlu ve mutasyondan sonra; ret/hata audit'i best-effort** (mevcut sözleşme değişmez).

## 10. Karar sonrası implementation görev listesi (önerilen; AI2 uygulamaz)

| # | Görev | Ana dosyalar | Bağımlılık |
|---|---|---|---|
| T1 | `assignRole` doğrulaması: tenant tip/scope (yalnızca `ROOT` için `TENANT_ADMIN`), global atamada izinli rol listesi (f3) | `user.service.ts`, `platform-input.domain.ts` | a, e, f |
| T2 | Bayrak↔rol invariant + tek "son yönetici" tanımı + drift kontrolü (g2, h2, h4) | `user.service.ts`, `bootstrap.service.ts`, yeni domain fonksiyonu | g, h |
| T3 | Üst ayrıcalık sınırı (d2/d3) | `user.service.ts`, `role.service.ts` | d |
| T4 | MFA'lı oturum ve impersonation kısıtı ayrıcalık işlemlerinde (a, c, i) | `user.service.ts`, `auth.service.ts` (yalnızca token'daki `mfaVerified` semantiği) | Q-DP22c |
| T5 | Müşteri yöneticisi `TENANT_ADMIN` verme (e2) — yeni customer-admin endpoint'i + scope + audit | `saas.service.ts`, `saas.controller.ts`, `customer-access.service.ts` | e |
| T6 | (C seçilirse) ayrı izin + yönetim servisi + iki aşamalı akış + şema/seed | `system-role.domain.ts`, yeni modül, migration | a, c, C |
| T7 | Katalog boşluğu `SETTINGS:*` (j2) | `system-role.domain.ts`, seed | **ayrı onay** |
| T8 | Web: rol atama UI'sında SYSTEM_ADMIN/global rol seçeneklerini yetkiye göre gizle/uyar; ikinci onay UI'sı (C) | `web/.../system/users` | T1, T3 |
| T9 | Test: davranış matrisi (§6) tablo-güdümlü test; mevcut `platform-user-admin-privilege-boundary.spec.ts` genişletilir | spec'ler | hepsi |

## 11. Rollback ve mevcut kullanıcılar için geçiş planı

1. **Önce salt-okunur ön kontrol (gerçek ortamda AI1/Ops tarafından; bu task'ta çalıştırılmadı):** (i) `users.isSystemAdmin = true` ⇔ global `SYSTEM_ADMIN` atamasının olup olmadığı (drift); (ii) kaç ACTIVE sistem yöneticisi var; (iii) `tenantId IS NULL` olan `SYSTEM_ADMIN` dışı atamalar (özellikle global `TENANT_ADMIN`); (iv) `TENANT_ADMIN` atamalarının tenant tipi (ROOT dışı/PLATFORM_ROOT); (v) özel rol (`isBuiltin = false`) ve izinleri; (vi) `tenant_roles`/`user_tenant_role_assignments` satır sayısı (yazma yüzeyi olmadığı için 0 beklenir). Sonuç yoksa `[DOĞRULANAMADI]`.
2. **Yeni kurallar önce "audit-only / shadow" modda:** ihlalleri reddetmeden yalnızca audit'e yaz; bir süre sonra zorlayıcıya çevir. Feature bayrağı ile kapatılabilir.
3. **Geçiş:** mevcut atamalar **otomatik değiştirilmez**; uyumsuz atamalar (ör. global `TENANT_ADMIN`, ROOT dışı `TENANT_ADMIN`) rapor edilir ve AI1/PO onayıyla manuel düzeltilir. Bayrak↔rol drift'i varsa hangisinin doğru olduğu insan kararıyla belirlenir; otomatik "onarım" yapılmaz.
4. **Rollback:** B kuralları saf servis kuralı ve bayraklı olduğundan bayrağı kapatmak yeterli (veri değişikliği yok). C için şema/seed migration'ı geri alınabilir olmalı; C öncesi tam yedek + geri alma senaryosu şart.
5. **Break-glass:** kilitlenme durumunda mevcut env bootstrap yolu (`SYSTEM_ADMIN_*`) yalnızca sistem yöneticisi bulunmadığında çalışır — bunun yeterliliği ve denetimi ayrı karar.
6. **Hiçbir gerçek `SYSTEM_ADMIN` ataması/kullanıcı/rol verisi bu task'ta değiştirilmedi.**

## 12. Açık riskler ve Product Owner karar alanları

**Açık riskler:** eş sistem yöneticisi ele geçirmesi tüm platformu düşürür (c1); bayrak↔rol drift'i ve iki farklı son-yönetici sayımı; global `TENANT_ADMIN` yanlış yapılandırması platform yazma izinleri açar; delegasyon üst sınırı yok (latent); tenant-rol yönetim yüzeyi yok (ürün boşluğu); `assignRole` anlamsız tenant atamalarını kabul eder; impersonation oturumunda ayrıcalık kısıtı yok; `SETTINGS:*` katalog boşluğu; MFA politika/zorlaması işlemiyor (Q-DP22b); gerçek ortam verisi doğrulanamadı; F6'nın kalan audit kapsamı açık.

**Product Owner karar alanları (BOŞ — TASK-027.44 ile §14 kapanış formuna taşındı; hâlâ BOŞ, karar bekliyor):**
- Model: A / B / C: **AI1 karar seti = A'nın kalıcılaştırılması + B çekirdeği (§14.2)** · Aşama planı: **§14.3 (güncel)**
- Q-DP24 a–j (§5) kararları: **§5 tablosuna işlendi (AI1 karar seti; j açık, f kısmen)**
- Sistem yöneticisi sayısı politikası (≥ 2 zorunlu mu, break-glass): **AÇIK:** ≥ 2 yönetici politikası AI1 setinde yok; break-glass ve rollback prosedürü ayrı task (027.47) — AI1 kararı 10
- Müşteri yöneticisinin tenant-rol delegasyonu ürün gereksinimi var mı (e2/e3): **Karar:** yeni permission + ayrı task (027.49); AI1 kararı 8
- Katalog değişikliği (`SETTINGS:*`) onayı: **AÇIK** (AI1 setinde yok; 027.49 ile birlikte)
- Geçiş penceresi ve shadow-mode süresi: **AÇIK** (shadow-mode/geçiş penceresi karara bağlanmadı; 027.45/.46 planında)

## 13. Doğrulama ve sınırlar
- **Kod değişikliği yok** (production authorization kodu dokunulmadı); eklenen tek dosya salt-okunur kanıt testidir (`privilege-model-evidence.spec.ts`, 18 test). `tsc`, `jest platform --runInBand` ve `check.sh --skip-docker` sonuçları backlog teslim raporundadır.
- Gerçek DB/HTTP/kullanıcı verisi kullanılmadı; §2/§11'deki `[DOĞRULANAMADI]` maddeleri gerçek ortam incelemesi gerektirir.
- Bu belge Q-DP24'ü **kapatmaz**.

## 14. Q-DP24 karar kapanış formu (TASK-027.44, 2026-09-21)

> **DURUM (güncel, TASK-027.44 güncellemesi): AI1 karar seti kayda alındı (§14.2 sütunu dolduruldu); Q-DP24'ün kapanışı AI1'in `done` onayına ve §14.5'teki teyit noktalarına bağlıdır. Implementation BAŞLATILMADI.** *(Aşağıdaki ilk not, karar iletilmeden önceki durumu anlatır:)* ~~KAPANMADI — AI1/PO kararı BEKLİYOR.~~ TASK-027.44 talimatı yalnızca **AI2 önerisini** verdi ("Product Owner onayı olmadan bağlayıcı kabul edilmez"); onaylanmış bir karar iletilmedi. Bu yüzden aşağıdaki formda **"AI1/PO kararı" sütunları BOŞTUR**, öneriler "AI2 önerisi" olarak işlenmiştir ve **hiçbir authorization kodu, rol modeli veya permission kataloğu değiştirilmemiştir.** PO her satırı işaretleyince (Onay / Değişiklikle onay / Red) form, yalnızca doküman güncellemesiyle kesinleşecek ve §10'daki görevler açılabilecektir. Sonraki task numaraları **öneridir; AI1 atar.**

### 14.1 Kod kanıtıyla önerilerin sınanması (AI2 notları — PO'nun bilerek karar vermesi için)
1. **Global `TENANT_ADMIN` yasağı ürün akışını bozmaz (kodda):** `TENANT_ADMIN`'in tüm işlevsel kullanımları tenant-kapsamlıdır — `MeService` (ROOT tenant join'i), `CustomerAccessService.assertCustomerAdminScope` (root id), `PermissionGuard` tenant dalı (customerRoot), `SaasService.provisionCustomer` (root'a atar). Global (`tenantId` null) `TENANT_ADMIN` yalnızca `PLATFORM:` dalında rol adına bakmadan `rolePermissions` okunduğu için "PLATFORM:USER/TENANT yazma" yan etkisiyle çalışır. **[DOĞRULANAMADI]** gerçek ortamda böyle atama var mı (belge §11 ön kontrol (iii)).
2. **"Sistem yöneticileri birbirini yönetemez" için bir onay mekanizması YOKTUR ve tehlikeli bir yan etki doğurur:** ele geçirilmiş bir sistem yöneticisi hesabı **deaktive edilemez, parolası sıfırlanamaz, rolü alınamaz** hâle gelir (tek istisna: yalnızca hiç sistem yöneticisi kalmadığında çalışan env break-glass). Bu, olay müdahalesini (containment) zayıflatır. Güvenli yol: yasak, **ikinci onay mekanizması var olduktan sonra** açılır **veya** yasak yalnızca *kimlik bilgisi/rol* işlemlerine uygulanıp **deaktivasyon (containment) eşler arasında serbest bırakılır**. Bu bir AI2 değişikliğidir; PO açıkça seçmelidir.
3. **"Sahip olduğundan yüksek privilege veremez"** tanımlı bir ayrıcalık sırası gerektirir (`SYSTEM_ADMIN` > global rol > tenant-kapsamlı `TENANT_ADMIN` > diğer). Yerleşik izin kümeleri üzerinden hesaplanabilir (özel roller: verilen rolün izin kümesi ⊆ actor'ın etkin izin kümesi). Sistem yöneticisi için "en yüksek" olduğundan kural pratikte yalnızca sistem-yöneticisi-olmayanları kısıtlar.
4. **Canonical kaynak seçimi PermissionGuard/JWT/inline kontrolleri etkiler:** guard, perf/audit/settings/MFA-reset kontrolleri ve `AuthService.issueImpersonationAccessToken` **bayrağı** okur; rolü okuyan yalnızca `PLATFORM:` izin çözümlemesidir. Rolü canonical yapmak bayrağı türetilmiş kılar (servis invariant'ı/yeniden hesap; DB trigger seçilirse migration) — bayrağı canonical yapmak ise rol atamasını türetilmiş kılar. AI2 önerisi **rol ataması canonical, bayrak türetilmiş + drift kontrolü**; ancak bayrak hâlâ hot-path'te okunacağı için ikisi de saklanmalıdır.
5. **MFA şartı sıralaması:** MFA zorlaması bağlı değil (Q-DP22b), impersonation token'ı `mfaVerified: true` üretir ve MFA'sız sistem yöneticileri olabilir → global privilege değişikliklerinde MFA zorunluluğu, **önce** `mfaVerified` semantiğinin (impersonator'a göre) ve MFA'sız adminler için geçiş yolunun kararından sonra uygulanabilir; aksi hâlde işlem kilitlenir.
6. **Tenant role delegation yeni bir permission kodu gerektirir** (kataloğda ilgili kod yok) → katalog değişikliği ayrı onay ve ayrı task (uydurulmadı).

### 14.2 Karar tablosu (10 madde)

Her satır: AI2 önerisi · gerekçe · etkilenen endpoint/service · etkilenen permission/rol · migration gereksinimi · rollback · önerilen sonraki task · **AI1 kararı (2026-09-21 mesajı ile dolduruldu; aşağıdaki teknik notlar ve teyit noktaları §14.5'te)**.

| # | Karar | AI2 önerisi | Gerekçe | Etkilenen endpoint/service | Etkilenen permission/rol | Migration | Rollback | Sonraki task (öneri) | **AI1/PO kararı** |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `SYSTEM_ADMIN` kim verir/kaldırır | Yalnızca **ACTIVE sistem yöneticisi** (DB'den doğrulanmış) | 027.42'de uygulandı; ayrı yetkiye gerek doğana kadar en dar; düşük maliyet | `POST/DELETE platform/users/:id/roles…`, `UserService.assignRole/revokeRole/assertMayAdminister` | `PLATFORM:USER:ASSIGN_ROLE/REVOKE_ROLE` (yalnızca SYSTEM_ADMIN'de); yeni izin yok | Yok | Kural zaten mevcut; geri alma = 027.42'yi geri almak (önerilmez) | 027.45 (invariant'larla birlikte doğrulama/test genişletme) | **KARAR (AI1, 2026-09-21, madde 1):** `SYSTEM_ADMIN` verme/kaldırma yalnızca **aktif `SYSTEM_ADMIN`**. |
| 2 | Sistem yöneticileri birbirini yönetir mi | **Kimlik bilgisi/rol işlemleri için hayır; ikinci onay olmadan yasak → containment (deaktivasyon) serbest**; ikinci onay mekanizması gelince istisna onayla | Ele geçirilmiş eş hesabı bloke etme yeteneği kaybedilmemeli (§14.1-2); talimat önerisi ("ikinci onay") onay mekanizması olmadan uygulanırsa containment'ı yok eder | `UserService.setPassword/update/deactivate/assignRole/revokeRole/memberships` (`assertMayAdminister`) | `PLATFORM:USER:UPDATE/DEACTIVATE/…` | Yok (servis kuralı) | Kural bayrakla kapatılır | 027.47 (peer yönetim + ikinci onay tasarımı) | **KARAR (AI1, madde 2):** Eş sistem yöneticileri **parola/rol işlemlerinde birbirini yönetemez**; **deactivation/containment serbest kalır**. (İkinci onay istisnası benimsenmedi.) *AI2 sıralama şartı önerisi — AI1 teyidi bekliyor: bkz. §14.5-A.* |
| 3 | Actor sahip olduğundan yüksek privilege verebilir mi | **Hayır**: verilen rolün etkin izin kümesi ⊆ actor'ın etkin izin kümesi; `SYSTEM_ADMIN` yalnızca sistem yöneticisi | Delegasyon yükselmesini önler (özel role serbest izin verilebiliyor, E5) | `UserService.assignRole`, `RoleService.assignPermission/create` | ROLE:CREATE, PERMISSION:ASSIGN, ASSIGN_ROLE (hepsi SYSTEM_ADMIN) | Yok | Kural bayrağı/servis sürümü geri alınır | 027.46 | **KARAR (AI1, madde 4):** Actor, **sahip olduğundan yüksek etkin izin kümesine sahip rol veremez.** (Etkin küme tanımı 027.46'da — §14.5-C.) |
| 4 | Global rol ↔ tenant-kapsamlı rol sınırı | **`tenantId` null = platform kapsamı, dolu = tenant kapsamı; ikisi asla birbirine dönüştürülemez** (scope değişimi yalnızca revoke + yeni atama, her ikisi audit'li ve yetkili); tenant-kapsamlı atama yalnızca **`ROOT` tenant + `TENANT_ADMIN`** (diğer rol/tenant tipi anlamsız — reddedilir) | Bugünkü tek ayırıcı `tenantId` null'ı; `assignRole` anlamsız atamaları kabul eder (E4); güncelleme yolu yok, yani dönüşüm zaten mümkün değil — kural bunu sabitler | `UserService.assignRole`, `platform-input.domain.ts` | `TENANT_ADMIN`, `VIEWER`, özel roller | **Ön kontrol (salt-okunur)**: mevcut ROOT dışı/PLATFORM_ROOT `TENANT_ADMIN` atamaları ve tenant-kapsamlı diğer rol atamaları raporlanır; otomatik düzeltme yok | Kural kapatılır; veri değişmediği için yeniden atama gerekmez | 027.46 | **KISMEN (AI1 madde 3 ile):** global `TENANT_ADMIN` yasağı karara bağlandı. **Karara bağlanmayan:** tenant-kapsamlı atamada yalnızca ROOT + `TENANT_ADMIN` ve global↔tenant scope dönüştürme yasağı → **AI1 teyidi bekliyor (§14.5-D)**. |
| 5 | `TENANT_ADMIN` global atanabilir mi | **Hayır (yasak)** | Kodda tüm işlevsel kullanımı tenant-kapsamlıdır; global atama yalnızca istenmeyen PLATFORM yazma izinleri açar (§14.1-1) | `assignRole` (reddet); `revokeRole` (mevcut global `TENANT_ADMIN` atamaları **kaldırılabilmeli**) | `TENANT_ADMIN` (yerleşik rol izin listesindeki `PLATFORM:USER/TENANT:*` maddeleri tenant kapsamında kullanılmaz — kataloğ temizliği **ayrı onay**, bu task'ta değişmez) | **Ön kontrol şart (iii)**; varsa PO onaylı manuel kaldırma; otomatik silme yok | Yasak bayrağı kapatılır | 027.46 | **KARAR (AI1, madde 3):** Global `TENANT_ADMIN` **yasaklanır**; mevcut atamalar **otomatik silinmeden salt-okunur ön kontrolde raporlanır** (yasak yeni atamaları engeller; mevcutlar manuel kaldırılana kadar etkindir — §14.5-E). |
| 6 | Tenant rolü atama/kaldırma yetkisi | **Yeni, ayrı bir permission (ad AI1'de) + ayrı task**; yetkili kim: platform tarafında sistem yöneticisi, customer root'ta o root'un `TENANT_ADMIN`'i yalnızca **kendi root'unda** ve yalnızca `TENANT_ADMIN`/tanımlı tenant rolleri (üst sınır kuralı 3) | Bugün tenant-rol yönetim yüzeyi yok (E3); müşteri yöneticisi rol veremez; delegasyon istenirse F1 sınıfı kapsam sertleştirmesi (R1) zaten var | Yeni customer-admin endpoint'leri, `SaasService`, `CustomerAccessService`; (tenant_roles yazma yüzeyi istenirse yeni servis) | **Yeni permission kodu (kataloğa ekleme — ayrı onay)**; `TENANT_ADMIN` | Katalog/seed migration (`permissions`, `role_permissions`); rol/atama verisi değişmez | Yeni permission ve endpoint bayrakla kapatılır; katalog satırı kalır/geri alınır | 027.49 (+ 027.48 öncesi katalog onayı) | **KARAR (AI1, madde 8):** Tenant-role delegation **yeni permission ve ayrı task** ile ele alınır (katalog değişikliği ayrı onay). |
| 7 | `isSystemAdmin` bayrağı ↔ `SYSTEM_ADMIN` rolü senkronu | **Canonical kaynak = `SYSTEM_ADMIN` global rol ataması; bayrak türetilmiş** (hot-path için saklanır); tek servis fonksiyonu ikisini birlikte yazar; başlangıç/periyodik **drift kontrolü**; drift'te otomatik onarım yok, uyarı + audit | Bugün iki yazma yolu var (E4); guard/inline kontroller bayrağı okur — bayrak kaldırılamaz ama tek kaynaktan türetilebilir | `UserService.assignRole/revokeRole`, `BootstrapService`, `AuthService` (bayrak okuma noktaları değişmez) | `SYSTEM_ADMIN` rolü, `users.isSystemAdmin` | **Ön kontrol**: bayraklı ⇔ global SYSTEM_ADMIN ataması eşleşmesi; DB trigger/constraint seçilirse şema migration'ı (AI2 önerisi: önce servis invariant'ı, trigger sonraki aşama) | Servis invariant'ı geri alınır; bayrak ve rol verisi zaten korunur | 027.45 | **KARAR (AI1, madde 5):** Canonical kaynak = **`SYSTEM_ADMIN` rol ataması**; `isSystemAdmin` **türetilmiş/cache alanı**; **drift kontrolü uygulanır** (drift'te çalışma zamanı davranışı 027.45'te — §14.5-B). |
| 8 | Son sistem yöneticisi koruması | **Tek model:** "ACTIVE + canonical kaynağa göre sistem yöneticisi sayısı ≥ 1"; revoke, deactivate, (ileride) silme/durum değişikliği **aynı fonksiyonu** kullanır; ≥ 2 yönetici yoksa audit/operasyon uyarısı | Bugün iki farklı sayım (revoke: atama sayısı; deactivate: ACTIVE bayraklı) tutarsız sonuç verebilir (E4) | `UserService.revokeRole/deactivate` | `SYSTEM_ADMIN` | Yok (kod) | Eski iki ayrı kontrol geri getirilebilir (önerilmez) | 027.45 | **KARAR (AI1, madde 9):** Son yönetici koruması **canonical rol atamalarına göre tek invariant** (ACTIVE tanımı 027.45'te teyit — §14.5-B). |
| 9 | Impersonation sırasında privilege değişikliği | **Hayır**: impersonation oturumunda tüm privilege/güvenlik işlemleri (rol, parola, MFA-reset, üyelik, deaktivasyon) reddedilir; ayrıca **sistem yöneticisi impersonate edilemez**; audit'te `impersonatorUserId` zorunlu | Impersonation token'ı hedefin bayrağını ve `mfaVerified: true` taşır; hedef sysadmin ise tam yetki (E7); Q-DP22c ile birleşik karar | `UserService.*` (yedi mutasyon), `MfaService.adminResetMfa`, `AuthService.issueImpersonationAccessToken`, `JwtStrategy` bağlamı | Yeni izin yok | Yok (kod); mevcut aktif impersonation token'ları (≤ 1 saat) doğal olarak süresi dolar | Kural bayrağı kapatılır | 027.46 | **KARAR (AI1, madde 6):** Impersonation sırasında **privilege değişikliği yasak** (işlem kümesi 027.46'da — §14.5-F). |
| 10 | Global privilege değişikliği için MFA / ikinci onay | **MFA zorunluluğu ayrı güvenlik task'ı** (önce `mfaVerified` semantiği ve MFA'sız adminler için geçiş/break-glass kararı — Q-DP22b/c); **ikinci onay** yalnızca ≥ 2 yönetici ve onay mekanizması varsa (karar 2 ile birlikte) | MFA zorlaması bağlı değil (E-notu §14.1-5); şimdi zorunlu kılmak kilitlenme yaratır | `UserService` (global rol işlemleri), `AuthService`/JWT `mfaVerified` üretimi, `MfaEnforcementGuard` (bağlama ayrı karar) | Yeni izin yok (ikinci onay için onay kaydı/izni C ile birlikte) | Sonraki task'ta: onay kayıtları için şema (yalnızca ikinci onay seçilirse) | Bayrakla kapatılır; MFA şartı kaldırılır | 027.48 (MFA), 027.47 (ikinci onay) | **KISMEN (AI1 madde 7 ve 10):** MFA **ayrı karar ve geçiş task'ından önce zorunlu yapılmaz**; global privilege işlemlerinde **audit zorunlu**; **rollback ve break-glass prosedürü ayrı task'ta**. İkinci onay **karara alınmadı** (benimsenmedi; gerekirse ayrı karar). |

### 14.3 Karar sonrası implementation görevleri (AI1 kararına göre güncel; **hiçbiri başlatılmadı** — AI1: "sıradaki görev TASK-027.45")

| ID | Kapsam | Bağlı AI1 kararı | Durum |
|---|---|---|---|
| **027.45** (sıradaki) | Salt-okunur ön kontrol raporu (global `TENANT_ADMIN`, bayrak↔rol drift'i, sistem yöneticisi sayısı — gerçek ortam AI1/Ops) **+** canonical kaynak (`SYSTEM_ADMIN` rol ataması) + `isSystemAdmin` türetilmiş/cache + tek servis fonksiyonu + drift kontrolü + tek son-yönetici invariant'ı | 3 (ön kontrol), 5, 9 | Başlatılmadı |
| **027.46** | `assignRole` sertleştirmesi: global `TENANT_ADMIN` yasağı, privilege tavanı (etkin izin kümesi), impersonation'da privilege değişikliği yasağı (+ teyit edilirse tenant-kapsamlı atamada ROOT+`TENANT_ADMIN`) | 3, 4, 6 | Başlatılmadı |
| **027.47** | Eş sistem yöneticisi kuralı (parola/rol yasağı, deactivation serbest) **+ sistem yöneticisi kimlik bilgisi rotasyon yolu** (§14.5-A) **+ break-glass/rollback prosedürü** | 2, 10 | Başlatılmadı |
| **027.48** | MFA geçiş kararı ve global privilege işlemlerinde MFA (Q-DP22b/c ile) | 7 | Tamamlandı (2026-09-22, bkz. §14.12) |
| **027.49** | Tenant-rol delegasyonu: yeni permission (katalog onayı önce), endpoint, kapsam/üst sınır/audit | 8 | Tamamlandı (2026-09-22, bkz. §14.13) |

(Numaralar AI1'in; AI2 önerilen kapsam dağılımını sunar, AI1 değiştirebilir.)

### 14.4 Kritik kural ve bu formun sınırı
Nihai karar AI1/Product Owner tarafından verilmeden authorization kodu, rol modeli veya permission kataloğu **değiştirilmemiştir ve değiştirilemez**. Bu bölüm kararı kaydetmez; kararın *biçimini* ve *sonuçlarını* hazırlar. Q-DP24 **açıktır**.

### 14.5 AI2 teknik değerlendirmesi ve teyit noktaları (AI1 karar setine — TASK-027.44 güncellemesi)

AI2, karar setini **teknik olarak uygulanabilir** bulur ve kayda alır (kararı AI2 vermez; kapanış AI1'indir). Aşağıdakiler kodla doğrulanmış **uygulama sonuçlarıdır**; AI1'in teyit etmesi veya ilgili task'ta netleştirmesi gerekir. Karar setini değiştirmezler.

- **A — ⚠️ Karar 2'nin doğrudan sonucu (kodla doğrulandı): sistem yöneticisi parolası API'den hiç değiştirilemez hâle gelir.** Kodda **self-servis parola değiştirme endpoint'i yok** (`auth` yalnızca login/refresh/logout/me; `changePassword`/`resetPassword` araması boş) ve platform yüzeyinde **kendi parolasını değiştirme yasak** (`SELF_CHANGE`). Bugün parolayı yalnızca eş sistem yöneticisi sıfırlayabiliyor; karar 2 uygulanırsa sistem yöneticisi parolası için **hiçbir API yolu kalmaz** (yalnızca DB/env break-glass). Bu, açık kalan "olası hash ifşası için parola rotasyonu" riskini de etkiler (sistem yöneticisi hesapları rotasyona alınamaz). **AI2 önerisi (AI1 teyidi bekliyor):** eş-yönetim kısıtı (027.47) **ancak** bir sistem yöneticisi kimlik bilgisi rotasyon yolu (ör. mevcut parola + gerekirse MFA ile self-servis değiştirme veya onaylı break-glass) ile **birlikte/sonra** yayına alınsın; 027.45/.46 bu kısıtı içermez.
- **B — Drift ve ACTIVE tanımı (karar 5, 9):** drift tespit edildiğinde çalışma zamanı davranışı tanımlanmalı (öneri: **fail-closed** — ayrıcalık değiştiren işlemlerde bayrak≠rol ise reddet + audit; genel erişimde mevcut bayrak davranışı korunup uyarı) ve "son yönetici" sayımı **ACTIVE kullanıcıların** global `SYSTEM_ADMIN` atamaları olarak tanımlanmalı (pasif kullanıcı atama satırı sayılmaz). 027.45'te netleşir.
- **C — "Etkin izin kümesi" (karar 4):** `PermissionGuard` gereği tenant kapsamında `TENANT_ADMIN` "PLATFORM dışı her şey" (rol izin listesi kullanılmaz), global rol `rolePermissions` listesidir, `SYSTEM_ADMIN` (bayrak) her şeydir. Tavan karşılaştırması bu semantikle tanımlanmalı (027.46).
- **D — Global↔tenant sınırı (karar tablosu satır 4) AI1 setinde açık değil:** yalnızca global `TENANT_ADMIN` yasağı kararlaştırıldı. "Tenant-kapsamlı atama yalnızca ROOT + `TENANT_ADMIN`" ve "scope dönüştürme yasağı" AI2 önerisidir; AI1 teyidi bekliyor (027.46).
- **E — Karar 3 yalnızca yeni atamaları engeller:** mevcut global `TENANT_ADMIN` atamaları (varsa) **kaldırılana kadar etkindir**; kaldırma `revokeRole` ile mümkün kalmalı. Ön kontrol raporu 027.45'te.
- **F — Karar 6'nın işlem kümesi:** "privilege değişikliği" için AI2 varsayımı: rol verme/alma (global ve tenant), başkasının parolası, MFA admin reset, deaktivasyon, üyelik ekle/kaldır ve customer-admin eşdeğerleri. "Sistem yöneticisi impersonate edilemez" AI1 setinde **yok**; karara bağlanmadı (Q-DP22c). 027.46'da teyit.
- **G — MFA admin reset eşlere karşı (karar 2):** MFA sıfırlama kimlik bilgisi sınıfı işlemdir; AI2 varsayımı: eşler arasında **yasak**, deaktivasyon (containment) serbest. AI1 teyidi bekliyor (027.47).
- **H — Karar 10:** global privilege işlemlerinde audit zaten zorunlu (027.42: başarı zorunlu, ret/hata best-effort); rollback/break-glass ayrı task (027.47) — o zamana kadar sistem yöneticisi kilitlenme/kurtarma yalnızca mevcut env bootstrap'a bağlıdır (hiç yönetici yokken çalışır).

### 14.6 AI1 teyidi ve Q-DP24 kapanışı (2026-09-21)

AI1, §14.5 teyit noktalarını yanıtladı ve **Q-DP24 kapanış kararını tamamlandı ilan etti; TASK-027.44 `done` yapılabilir; sıradaki görev TASK-027.45.** Kayıt AI1 teyidine dayanır (AI2 kararı kendi adına vermedi). Bağlayıcı uygulama sınırları:

1. **Eş sistem yöneticisi kısıtı** (parola/rol/MFA işlemlerinde birbirini yönetememe), **parola rotasyonu veya onaylı break-glass yolu hazır olmadan production'da zorunlu hâle getirilmeyecek.**
2. **Mevcut davranış TASK-027.47 uygulanana kadar korunacak** (eşler bugünkü gibi birbirini yönetebilir; 027.42 kuralları aynen).
3. **TASK-027.45:** yalnızca salt-okunur ön kontrol, canonical kaynak, drift ve son-yönetici invariant'ı; **enforcement yapmayacak** (davranış değiştiren reddetme/kısıt getirmez).
4. **TASK-027.46:** global `TENANT_ADMIN` yasağı ve privilege tavanı uygulanır; **mevcut atamalar otomatik silinmez.**
5. **TASK-027.47:** eş yönetici parola/MFA işlemleri ve break-glass akışı **birlikte** çözülür (kimlik bilgisi rotasyon yolu dahil).
§14.5-A (sistem yöneticisi parola rotasyonu boşluğu) bu sıralamayla karşılanmıştır; §14.5 B–H maddeleri ilgili task'larda (027.45/.46/.47) netleştirilir. Kararlaştırılmayan/açık: ikinci onay (benimsenmedi), ≥ 2 yönetici politikası, `SETTINGS:*` katalog boşluğu, shadow-mode/geçiş penceresi, tenant-kapsamlı atamada ROOT+`TENANT_ADMIN`/scope dönüştürme yasağı (027.46'da AI1 teyidi), "sistem yöneticisi impersonate edilemez" (Q-DP22c).

### 14.7 Implementation sınırı — TASK-027.45 (2026-09-21)

Q-DP24 kararlarından yalnızca **canonical kaynak (karar 5) ve tek son-yönetici invariant'ı (karar 9)** için **salt-okunur temel** uygulandı: `apps/api/src/platform/privilege/` (canonical sözleşme, SELECT-only snapshot port/adapter, saf deterministik rapor, `PrivilegeAuditService.report()` — yalnızca DRY_RUN). **Sınır:** rapor bir değer üretir; **hiçbir erişim davranışı değişmez** (PermissionGuard/AuthService/inline kontroller bayrağı okumaya devam eder), **enforcement yoktur**, drift veya global `TENANT_ADMIN` bulunması otomatik düzeltme/revoke/flag güncellemesi oluşturmaz, gerçek DB'de çalıştırılmamıştır, hiçbir route/CLI/job raporu açmaz. Global `TENANT_ADMIN` yasağı ve privilege tavanı 027.46'da, eş yönetici kısıtı/parola-MFA/break-glass 027.47'de uygulanacaktır (§14.6). Rapor, gerçek ortam ön kontrolü (§11) için kullanılabilir hâle gelmiştir; çalıştırma yolu AI1 kararıdır.

### 14.8 Implementation sınırı — TASK-027.46 (2026-09-22)

Q-DP24 kararlarından **madde 3 (privilege ceiling), 5 kısmen (global `TENANT_ADMIN` yasağı — enforcement), 6 (impersonation'da privilege değişikliği yasağı)** **enforcement** olarak uygulandı: `apps/api/src/platform/domain/privilege-ceiling.domain.ts` (saf model; gerçek `PermissionGuard` semantiğiyle 225 kombinasyonluk parite testiyle doğrulandı), `UserService` (yedi işlem: `update/setPassword/deactivate/assignRole/revokeRole/addMembership/removeMembership`), `MfaService.adminResetMfa`, `SaasService.setCustomerUserPassword/addCustomerUserMembership`.
**Sınır (bilerek korunmuş):**
- **Karar 2 (eş sistem yöneticisi kısıtı) bu task'ta UYGULANMADI** — §14.6 madde 2 gereği mevcut davranış TASK-027.47'ye kadar korunur (kanıt: `role-assignment-privilege-ceiling.spec.ts` "peer system administrators are still NOT restricted here").
- **Karar 5 (mevcut global `TENANT_ADMIN` atamalarının kaderi):** yalnızca **yeni** atama reddedilir; mevcut atamalar hiçbir kod yolunda otomatik silinmez/değiştirilmez, yalnızca (açıkça talep edilirse) `revokeRole` ile kaldırılabilir durumda kalır. TASK-027.45'in salt-okunur raporu bu atamaları hâlâ `GLOBAL_TENANT_ADMIN` olarak listeler.
- **Karar 4'ün teyit edilmeyen kısmı (§14.5-D: "tenant-kapsamlı atamada yalnızca ROOT+`TENANT_ADMIN`", "scope dönüştürme yasağı"):** AI2 varsayımı olarak ceiling modeline işlendi (`TENANT_ADMIN` yalnızca `ROOT`/`PLATFORM_ROOT` tipli tenant'ta anlamlı, `STANDARD`'da inert) — **açık teyit maddesi olarak kalıyor**, resmi karar değil.
- **Karar 9'un teyit edilmeyen kısmı ("sistem yöneticisi impersonate edilemez"):** AI1 setinde yok; impersonation oturumu privilege işlemlerini yapamıyor ama impersonation'ın **kendisi** hâlâ mümkün (`AuthService.issueImpersonationAccessToken` değişmedi) — Q-DP22c'de açık.
- Karar 7 ve 10 (MFA, ikinci onay) bu task'ın dışında; MFA enforcement, break-glass, rollback prosedürü TASK-027.48/.47'ye bırakıldı.
Testler: 44 yeni test (`role-assignment-privilege-ceiling.spec.ts`) + mevcut privilege/authorization spec'lerinin uyarlanması; üç mutasyon kontrolü (global `TENANT_ADMIN` reddi, `UserService` impersonation reddi, `MfaService` impersonation reddi) geri alınınca sırasıyla 3, 10, 2 test kırıldı. `./scripts/check.sh --skip-docker` PASS (API 52 suite / 1454 test, web 8 dosya / 117 test); gerçek DB/HTTP/MFA sağlayıcısı kullanılmadı.

### 14.9 Implementation sınırı — TASK-027.47 (2026-09-22)

Q-DP24 kararlarından **madde 2 (eş sistem yöneticisi kısıtı, Model B), madde 1 (self-servis parola değişikliği — madde 2'nin ön koşulu) ve madde 4'ün kalan kısmı (break-glass kurtarma)** uygulandı; **madde 7 ve 10 (genel MFA enforcement, ikinci onay) bu task'ın kapsamı dışında bırakıldı** (TASK-027.48).

**Eş sistem yöneticisi kısıtı (Model B):** `UserService.assertTargetRules`'a `credentialClass` seçeneği eklendi — hedef sistem yöneticisiyse, **actor'ın kendisi sistem yöneticisi olsa bile**, `setPassword`/`assignRole`/`revokeRole` işlemleri yeni statik kodla (`PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED`) reddedilir. `MfaService.adminResetMfa`'ya aynı kural (+ ayrı bir `SELF_CHANGE` reddi: sistem yöneticisi kendi MFA'sını bu yüzeyden sıfırlayamaz) eklendi. **Deaktivasyon (containment) kasıtlı olarak dokunulmadı** — TASK-027.42'den beri sistem yöneticileri birbirini deaktive edebiliyordu, bu hâlâ geçerli (Model B'nin "containment serbest kalır" maddesi).
**Bilinen sonuç (raporlanan, düzeltilmeyen):** bu kural artık **hiçbir peer actor'ın bir sistem yöneticisinin global `SYSTEM_ADMIN` atamasını `revokeRole` ile geri alamayacağı** anlamına gelir (revoke'un hedefi zaten `SYSTEM_ADMIN` sahibidir, dolayısıyla credential-class kural her zaman devreye girer) — resmi rol geri alma (demotion) artık yalnızca break-glass veya gelecekteki bir görevle mümkündür; containment (deaktivasyon) hâlâ mevcuttur. `revokeRole`'deki mevcut son-yönetici sayım koruması (`adminAssignments.length <= 1`) kod tabanında **kalır** — normalde credential-class kural tarafından önceliklendirilerek erişilemez hâle gelir, ancak bayrak↔rol drift'i (TASK-027.45) durumunda hâlâ ulaşılabilir bir ikinci savunma katmanıdır (test: "the last-SYSTEM_ADMIN count guard ... defence-in-depth for flag drift").

**Self-servis kimlik bilgisi rotasyonu (Q-DP24 kapanış madde 1'in ön koşulu):** yeni `POST auth/change-password` (`AuthController.changePassword` → `AuthService.changeOwnPassword`), **her ACTIVE kullanıcıya açık** (yalnızca sistem yöneticilerine değil) — bu, eş-yönetim kısıtının kilitlenme yaratmadan devreye alınabilmesinin koşuluydu (§14.6-1). Mevcut parola + politikaya uygun yeni parola ister; hiçbir hedef/kullanıcı kimliği alanı yoktur (yalnızca oturumun kendi kimliği kullanılır — bir tenant yöneticisi veya başka bir actor yapısal olarak başkasının credential'ını bu yolla değiştiremez). Canonical `validatePasswordStrength` servis katmanında da (yalnızca controller'da değil) yeniden doğrulanır (savunma derinliği, `UserService.setPassword` deseniyle aynı). Başarılı rotasyonda kullanıcının **tüm aktif `authSessions` (refresh token) kayıtları** iptal edilir; **erişim jetonu (JWT) anında iptal edilemez** — denylist/blacklist altyapısı yok — bu yüzden en fazla `JWT_EXPIRES_IN` (varsayılan 15dk) kadar sınırlı bir maruziyet penceresi **bilinçli ve belgelenmiş bir kalan risktir**, gözden kaçırılmış değildir. Aynı oturum/jeton iptali kararı `UserService.setPassword`'un (yönetici başlatan sıfırlama) başarı yoluna da eklendi — artık her parola değişikliği yolu (self-servis, yönetici, break-glass) hedefin oturumlarını iptal eder.

**Break-glass kurtarma (madde 4):** yeni `apps/api/src/platform/break-glass/` — `break-glass-recovery.service.ts` (**kasıtlı olarak `@Injectable()` DEĞİL ve `platform.module.ts`'de listeli DEĞİL**, bu yüzden Nest DI grafiği veya herhangi bir route üzerinden yanlışlıkla erişilebilir hâle gelemez — statik testle kanıtlı) ve `break-glass-recovery.entrypoint.ts` (`apps/api/src/migrate.ts`'i taklit eden bağımsız bir CLI girişi; uygulamaya hiç bağlı değil). Yalnızca **hiçbir ACTIVE sistem yöneticisi kalmadığında** (TASK-027.45'in canonical, salt-okunur raporuyla hesaplanır) çalışır; hedefin zaten canonical global `SYSTEM_ADMIN` atamasına sahip olması şarttır (yeni ayrıcalık üretilmez, yalnızca mevcut bir hesap kurtarılır). Yapılandırma tamamen env-tabanlı ve varsayılan olarak KAPALI (`BREAK_GLASS_RECOVERY_TOKEN` ayarlı değilse tamamen devre dışı — kod hiçbir varsayılan token üretmez/içermez). Token karşılaştırması `timingSafeEqual` ile (iki taraf önce sha256'lanır, farklı uzunluk sorunu önlenir). Her sonuç (başarı ve her ret, yanlış token dahil) `eventId` ile audit'lenir; audit metadata'sı yalnızca `result`, `eventId` ve (varsa) `reason`/`targetUserId` içerir. Başarılı kurtarma sonrası ikinci bir deneme, artık aktif bir yönetici bulunduğu için doğal olarak reddedilir — **ayrı bir tek-kullanımlık defter (ledger) tablosu gerekmez.**
**Kanıtlanamayan/yapılmayan (kural gereği açıkça raporlanmıştır):** hız sınırlama (rate-limiting) altyapısı **yoktur** — her CLI çalıştırması kendi başına bir süreçtir, süreçler arası durum tutan bir hız sınırlayıcı bu task'ın kapsamında kurulmamıştır; bu, mevcut altyapının (Redis vb. paylaşılan durum deposu olmadan) güvenli şekilde sağlayamayacağı bir yetenek olduğu için **implementasyon yerine bir sınırlama olarak raporlanmıştır** (talimattaki "yetersizse blocker/karar paketi teslim et" kuralına uygun olarak: temel mekanizma güvenli şekilde kuruldu, hız sınırlama operasyonel bir açık madde olarak bırakıldı — §14.10).

> **R1 güncellemesi (2026-09-22):** AI1'in TASK-027.47 teslimini `review`'da tutup açtığı **TASK-027.47-R1**, bu bölümde "yapılmadı" olarak işaretlenen hız sınırlama ve tek-kullanımlık defter maddelerini ele aldı. Bu paragraf tarihi kayıt olarak **değiştirilmeden** bırakılmıştır — güncel durum için bkz. **§14.11**.

**Testler:** yeni `system-admin-credential-rotation-and-break-glass.spec.ts` (36 test: self-servis rotasyon başarı/ret/zayıf-parola/oturum-iptali/audit; MFA self/peer/ordinary reset; break-glass'ın her ret dalı + başarı + tek-kullanımlık davranışı + statik sınır); `platform-user-admin-privilege-boundary.spec.ts` güncellendi (artık peer reddini, oturum iptalini ve drift senaryosunu test ediyor). **4 zorunlu mutasyon kontrolü** (hepsi manuel çalıştırıldı ve dosyalar geri yüklendi): eş-yönetici kısıtı kaldırılınca 4 test kırıldı; break-glass token kontrolü kaldırılınca 7 test kırıldı; audit'e credential sızdırılınca 1 test kırıldı; son-yönetici koruması (deactivate) kaldırılınca 1 test kırıldı. `pnpm --filter api exec tsc --noEmit` temiz; `pnpm --filter api exec jest platform --runInBand` 16 suite / 898 test; **`./scripts/check.sh --skip-docker` PASS (exit 0)** — API **53 suite / 1490 test**, web 8 dosya / 117 test. Gerçek DB/HTTP/MFA sağlayıcısı/production secret **kullanılmadı**; break-glass gerçek ortamda hiç çalıştırılmadı.

### 14.10 Gerçek ortam için kalan operasyonel adımlar (implementasyon değil — Ops/AI1/PO kararı ve aksiyonu gerektirir)

1. **`BREAK_GLASS_RECOVERY_TOKEN` üretimi ve saklanması:** güçlü, rastgele bir secret üretilip (bu task'ta üretilmedi — kod hiçbir varsayılan sağlamaz) production secret yönetimine (mevcut altyapıya uygun şekilde) eklenmeli; erişimi en az sayıda kişiyle sınırlı tutulmalı ve döndürülebilir olmalı.
2. **Break-glass çalıştırma prosedürü/runbook'u:** `break-glass-recovery.entrypoint.ts`'nin nasıl, kim tarafından, hangi onayla çalıştırılacağı (örn. `DATABASE_URL` + token'a erişimi olan iki kişi kuralı) belgelenmelidir — bu task yalnızca mekanizmayı kurdu, operasyonel prosedürü tanımlamadı.
3. **Hız sınırlama / kötüye kullanım izleme (açık, §14.9):** break-glass için süreçler-arası bir hız sınırlayıcı yoktur; production'da başarısız denemelerin audit tablosu üzerinden izlenmesi (uyarı/alarm) ayrıca kurulmalıdır.
4. **`JWT_EXPIRES_IN` / erişim jetonu maruziyet penceresi kararı:** bu task, parola değişse bile mevcut erişim jetonunun süresi dolana kadar (varsayılan 15dk) geçerli kalmasını belgelenmiş bir kalan risk olarak bıraktı; PO daha kısa bir süre veya bir jeton kara listesi (denylist) altyapısı isteyip istemediğine karar vermeli.
5. **Geçmiş kötüye kullanım incelemesi (Q-DP23/Q-DP22'den beri açık, hâlâ yapılmadı):** gerçek ortamda mevcut `USER_PASSWORD_RESET`, `MFA_ADMIN_RESET` ve (bu task sonrası) `USER_SELF_PASSWORD_CHANGED`/`BREAK_GLASS_RECOVERY` audit kayıtlarının incelenmesi hâlâ AI1/PO/Ops kararıdır; bu task'ta DB'ye bağlanılmadı.
6. **Formal SYSTEM_ADMIN demotion yolu (§14.9'daki bilinen sonuç):** Model B altında artık hiçbir peer bir sistem yöneticisinin rolünü geri alamıyor; PO isterse ayrı bir görevde (yeni bir izin kodu veya ikinci-onay akışıyla, Q-DP24 karar 6/10 ile birlikte) resmi bir demotion yolu tasarlanmalı — o zamana kadar yalnızca containment (deaktivasyon) veya break-glass mevcut. **R1 güncellemesi:** bu maddenin operasyonel prosedürü §14.11'de belgelendi (kod değişikliği değil); resmi bir demotion permission/akışı hâlâ ayrı bir görev gerektiriyor.

### 14.11 Implementation sınırı — TASK-027.47-R1 (2026-09-22)

AI1, TASK-027.47 teslimini **`done` olarak onaylamadı** ve `review` durumunda tutarak dört kapanış engeli bildirdi: (1) break-glass hız sınırlama altyapısı yok, (2) break-glass gerçek DB/HTTP ortamında doğrulanmadı, (3) peer demotion tamamen engellenmiş durumda operasyonel bir açık bırakıyor, (4) self-servis parola değişiminde oturum iptali/audit ayrıca kanıtlanmalı. TASK-027.47-R1 bu dört maddeyi ele aldı; **kod tarafında kapatılanlar (1) ve kısmen (4)'tür — (2) gerçek ortam smoke testi ayrı bir onay/adım gerektirir (aşağıya bakınız), (3) tamamen kod dışı bir operasyonel doküman kararıdır.**

**Break-glass sertleştirmesi (madde 1 ve kısmen madde 2):**
- **Kalıcı, süreçler-arası hız sınırlaması:** yeni `break_glass_attempts` tablosu (tek satırlık singleton), `SELECT ... FOR UPDATE` içeren bir transaction'la atomik artırılır — bu, sahte/bellek-içi bir çözüm DEĞİL, uygulamanın zaten bağımlı olduğu gerçek Postgres altyapısını kullanan kalıcı bir mekanizmadır. Varsayılan: 15 dakikalık pencerede en fazla 5 deneme (`BREAK_GLASS_RATE_LIMIT_MAX_ATTEMPTS`/`BREAK_GLASS_RATE_LIMIT_WINDOW_MS` ile yapılandırılabilir). **Başarılı ve başarısız her deneme sayılır** — yanlış token denemeleri de dahil, token karşılaştırılmadan ÖNCE sayaç işletilir.
- **Kalıcı tek-kullanımlık defter:** yeni `break_glass_recovery_events` tablosu, `tokenHash` (sha256, asla token'ın kendisi değil) üzerinde **UNIQUE** kısıt taşır. Kurtarma, kimlik bilgisi/oturum yazma işlemiyle **aynı transaction** içinde `INSERT ... ON CONFLICT DO NOTHING` ile "claim" edilir — bu, "paralel iki çağrıdan yalnızca biri başarılı olur" garantisinin **tek kaynağıdır**: Postgres çakışan insert'leri serileştirir, kaybeden çağrı sıfır satır görür ve hiçbir credential'a dokunmadan `TOKEN_ALREADY_USED` ile reddedilir. Bu aynı zamanda token'ı **kalıcı olarak tek kullanımlık** yapar — bir token başarıyla tüketildikten sonra (kurtarılan yönetici daha sonra deaktive edilse bile) aynı token bir daha ASLA kabul edilmez; operatör bir sonraki olay için `BREAK_GLASS_RECOVERY_TOKEN`'ı döndürmelidir (bkz. §14.10 madde 1).
- **Opsiyonel açık süre sınırı:** `BREAK_GLASS_TOKEN_EXPIRES_AT` (ISO-8601) — operatör token'ı ayarlarken isteğe bağlı bir bitiş zamanı da ayarlayabilir; süresi geçmiş veya bozuk bir tarih **her zaman** reddedilir (fail-closed).
- **Durum modeli:** `BREAK_GLASS_STATUS` = `AVAILABLE | USED | EXPIRED | RATE_LIMITED | INVALID | BLOCKED | FAILED` — her `recover()` çağrısı bu değerlerden birini döner (`AVAILABLE` yalnızca örtük ön-durumdur). Ayrı, daha ayrıntılı `BreakGlassReason` kodları (ör. `TARGET_NOT_FOUND`, `WEAK_PASSWORD`) audit için korunmuştur; birden fazla reason aynı status'a eşlenir.
- Migration: `apps/api/drizzle/migrations/0003_break_glass_hardening.sql` (drizzle-kit `generate` ile, **canlı DB'ye bağlanmadan**, yalnızca şema-snapshot diff'i üzerinden üretildi — hiçbir migration gerçek ortamda çalıştırılmadı).

**Peer demotion operasyonel prosedürü (madde 3 — kod değişikliği DEĞİL, dokümantasyon kararı):** Model B altında (§14.9) ele geçirilmiş/kötüye kullanılan bir sistem yöneticisi için mevcut yollar:
1. **Deaktivasyon/containment (birincil, anında):** herhangi bir başka ACTIVE sistem yöneticisi `UserService.deactivate` ile hedefi hemen ACTIVE dışına alabilir — bu Model B'de kısıtlanmadı, en hızlı müdahale adımıdır. Deaktivasyon oturumları/erişimi engeller ama global `SYSTEM_ADMIN` rol atamasını KALDIRMAZ.
2. **Audit/olay müdahalesi:** `platform_audit_logs` üzerinden ilgili hesabın `USER_SELF_PASSWORD_CHANGED`, `SYSTEM_ROLE_GRANTED/REVOKED`, `MFA_ADMIN_RESET`, `USER_PASSWORD_RESET` kayıtları incelenmeli; şüpheli oturumlar `authSessions` üzerinden (deaktivasyon zaten tüm oturumları etkisiz kılmaz — yalnızca yeni girişleri engeller; aktif JWT en fazla `JWT_EXPIRES_IN` kadar geçerli kalır, §14.10 madde 4).
3. **Formal rol geri alma (rollback) — yalnızca break-glass ile:** deaktivasyon rolü SİLMEZ; hesabı gerçekten `SYSTEM_ADMIN` rolünden düşürmenin TEK yolu şu an break-glass'tır (son ACTIVE sistem yöneticisi kalmadığında, hedefi **başka** bir canonical `SYSTEM_ADMIN` hesabına döndürerek) veya doğrudan veritabanı müdahalesi (bu task'ın kapsamı dışı, Ops/DBA kararı). **Resmi, uygulama-içi bir demotion endpoint'i bu task'ta eklenmedi** (§14.10 madde 6) — bu bilinçli bir sınırdır, yeni bir bypass icat edilmedi.
4. **Rollback:** break-glass ile geri getirilen hesap, ilk yaptığı işlem olarak (kendi self-servis akışıyla) parolasını değiştirmeli; olay kapatıldığında `BREAK_GLASS_RECOVERY_TOKEN` **döndürülmelidir** (tek kullanımlık olduğu için zaten tekrar kullanılamaz, ama ortamdan da temizlenmelidir).

**Self-servis parola değişimi — ek kanıtlar (madde 4):** mevcut oturum iptali/audit davranışı zaten test edilmişti (TASK-027.47); R1 ayrıca **impersonation oturumunun kendi parolasını dahi değiştiremeyeceğini** ekledi (`AuthService.changeOwnPassword` artık `context.impersonation`/`impersonatorUserId` alır, `PRIVILEGE_DENIAL.IMPERSONATION` ile reddeder, `AuthController` bunu `@CurrentUser()`'dan — request body'den DEĞİL — iletir). Bu, TASK-027.47'de gözden kaçan tek gerçek yetki boşluğuydu.

**Kontrollü yerel DB smoke test (madde 2) — TAMAMLANDI (kullanıcı onayıyla, 2026-09-22):** kullanıcı onayı alındıktan sonra çalıştırıldı. `docker run --rm -e POSTGRES_PASSWORD=... -p 127.0.0.1::5432 postgres:16` ile izole, tek seferlik, kalıcı volume'suz bir container başlatıldı (rastgele yerel port); `DATABASE_URL` yalnızca bu geçici container'a işaret edecek şekilde ayarlandı (gerçek/production DB'ye hiç bağlanılmadı); derlenmiş `dist/migrate.js` (programatik Drizzle migrator, `drizzle-kit` değil) ile tüm migration'lar (0000–0003) uygulandı; `BreakGlassRecoveryService` ve gerçek `PlatformAuditService` doğrudan (test placeholder token'larla, gerçek secret değil) örneklenip aşağıdaki senaryolar elle tetiklendi — **15/15 doğrulama geçti:**
- Son yönetici kaybı senaryosunda başarılı kurtarma: parola hash'i değişti, `status` `ACTIVE`'e döndü, `isSystemAdmin` korundu.
- Aynı token'ın ikinci kullanımı reddedildi (ledger + admin-count invariant'ı tutarlı).
- Yeni bir token, yönetici tekrar kaybedildiğinde başarıyla çalıştı (tek-kullanımlığın token'a özgü olduğu, kalıcı bir kilitlenme olmadığı doğrulandı).
- Süresi geçmiş token (`BREAK_GLASS_TOKEN_EXPIRES_AT`) hiçbir yazma yapmadan reddedildi.
- Eşik aşıldıktan sonra (yanlış token denemeleriyle) **doğru token dahil** her istek `RATE_LIMITED` ile reddedildi — global, kalıcı sayaç doğrulandı.
- **Gerçek paralel yarış:** aynı token ile `Promise.all` üzerinden eşzamanlı iki `recover()` çağrısı yapıldı — gerçek Postgres'in unique-constraint serileştirmesiyle **yalnızca biri başarılı oldu**, kaybeden `TOKEN_ALREADY_USED` ile reddedildi (mock'larla kanıtlanamayan, yalnızca gerçek DB'de kanıtlanabilecek tek senaryo).
- `platform_audit_logs` tablosundaki gerçek satırlar sorgulandı: hiçbirinde token veya parola metni yok.

Test scripti geçicidir, repoya eklenmedi (scratch dosyası olarak çalıştırıldı ve silindi). Container, test bitiminde `docker stop` ile durduruldu (`--rm` ile başlatıldığı için otomatik silindi); kalıcı volume hiç oluşturulmadı, `down -v`/prune gerekmedi. Bu artık **açık bir madde değildir.**

**Testler:** `system-admin-credential-rotation-and-break-glass.spec.ts` 36 → **56 test** (yeni: expired/malformed-expiry/future-expiry token, rate-limit eşiği/pencere-sıfırlama, tek-kullanımlık defter — admin-count'tan bağımsız, claim'in tek karşılıklı-dışlama noktası olduğu, impersonation'ın self-servis parolayı değiştiremediği, controller'ın impersonation bağlamını ilettiği + genişletilmiş statik mutasyon kontrolleri). **5 mutasyon kontrolü** manuel çalıştırıldı ve dosyalar geri yüklendi: tek-kullanım kontrolü kaldırılınca 2 test, hız sınırlama kısa-devre edilince 17 test, audit'e yeni parola sızdırılınca 1 test, break-glass oturum iptali kaldırılınca 1 test kırıldı (ayrıca TASK-027.47'nin orijinal 4 kontrolü de bu teslimde tekrar doğrulandı — bkz. §14.9). `pnpm --filter api exec tsc --noEmit` temiz; `pnpm --filter api exec jest platform --runInBand` 16 suite / 909 test; `pnpm --filter api exec jest src/db --runInBand` 2 suite / 40 test (yeni tablo şeması tenant-izolasyon/bağlantı-güvenliği testlerini bozmadı). `./scripts/check.sh --skip-docker` PASS (exit 0) — API 53 suite / 1501 test, web 8 dosya / 117 test. **Ek olarak, kullanıcı onayıyla, break-glass geçici/izole bir yerel Postgres'e karşı gerçekten çalıştırıldı** (yukarıdaki smoke test paragrafı) — 15/15 senaryo geçti, gerçek paralel yarış dahil. Gerçek production DB/HTTP/MFA sağlayıcısı/production secret hiç kullanılmadı.

### 14.12 Implementation sınırı — TASK-027.48 (2026-09-22)

Q-DP22b/c (MFA policy + admin reset kararları) kullanıcı tarafından kapatıldı ve uygulandı —
detaylar `docs/migration/METNEX_AUTHORIZATION_ENDPOINT_AUDIT_AND_MFA_POLICY_DECISION.md` §5.3/§6.1
ve `docs/runbooks/MFA_ENFORCEMENT_ROUTE_MATRIX.md`'de.

Bu paketin daha önce açık bıraktığı iki nokta netleşti:

- **Satır 199 ("sistem yöneticisi impersonate edilemez", Q-DP22c) hâlâ karara bağlanmadı** —
  TASK-027.48 bunu değiştirmedi. Impersonation'ın kendisi hâlâ mümkün
  (`AuthService.issueImpersonationAccessToken` değişmedi); yalnızca *privilege işlemleri*
  (027.46'dan beri) ve şimdi *MFA admin reset'in `mfaVerified` şartı* impersonation oturumlarında
  zaten reddediliyordu — bu task yeni bir impersonation kısıtı eklemedi, yalnızca admin reset'e
  aktörün kendi MFA doğrulama durumu şartını ekledi (§6.1 Q1).
- **Satır 200 / 209 ("global privilege değişikliğinde MFA zorunluluğu"):** bu paket MFA
  enforcement'ın *global privilege işlemlerine özel* bir şart olarak mı yoksa *tüm korumalı
  route'larda genel* bir şart olarak mı devreye gireceğini açık bırakmıştı. Kullanıcı kararı
  ikincisiydi: `MfaEnforcementGuard`, global privilege işlemleriyle sınırlı kalmadı, aşağıdaki
  route matrisindeki tüm korumalı yüzeye uygulandı (bkz.
  `docs/runbooks/MFA_ENFORCEMENT_ROUTE_MATRIX.md` §3). Bu, satır 200'ün "MFA ayrı karar ve geçiş
  task'ından önce zorunlu yapılmaz" notunu karşılar — geçiş task'ı (027.48) tamamlandı, kilitlenme
  riski web tarafında eksik olan MFA setup UI'ının aynı task'ta eklenmesiyle kapatıldı.

Yeni izin kodu icat edilmedi; admin reset ve policy route'ları hâlâ geçici `isSystemAdmin` kuralını
kullanıyor (kalıcı model Q-DP22a'da açık).

### 14.13 Implementation sınırı — TASK-027.49 (2026-09-22)

Karar 8'de öngörülen şekilde uygulandı: **yeni permission kodları** (`TENANT:ROLE:VIEW`,
`TENANT:ROLE:ASSIGN`, `TENANT:ROLE:REVOKE` — kataloğa eklendi, 30→33), **yetkili** yalnızca o
customer root'un `TENANT_ADMIN`'i (mevcut `PermissionGuard`'ın `tenantAdminAssignment` kısa
devresiyle örtük olarak "everything non-PLATFORM:*" alır, ayrıca yeni koda özel bir izin listesi
eklemeye gerek yoktu) veya sistem yöneticisi, **yalnızca kendi root'unda**
(`CustomerAccessService.assertCustomerAdminScope` yeniden kullanıldı, tekrar yazılmadı).

Ek kullanıcı kararları (bu paketin karar 8'inde açık bırakılmış ayrıntılar):
- Kendine atama: izin verilir, yalnızca ceiling ile sınırlı (`domain/tenant-role-ceiling.domain.ts`).
- Kapsam seviyesi: yalnızca customer root düzeyi (child tenant'lara özel rol yönetimi yok).
- Son yönetici koruması: yeni `tenant_roles.isAdminRole` kolonu (migration `0004_tenant_role_admin_flag.sql`)
  ile işaretli bir rolün bir tenant'taki son ACTIVE ataması kaldırılamaz.

Yeni dosyalar: `apps/api/src/platform/tenant-role.controller.ts`,
`apps/api/src/platform/tenant-role.service.ts`,
`apps/api/src/platform/domain/tenant-role-ceiling.domain.ts` (ayrı, SYSTEM_ADMIN/TENANT_ADMIN
modelini — bu dosyanın kendisi — değiştirmeyen pure ceiling fonksiyonu). Route:
`GET/POST/DELETE tenant-roles[/assignable|/users/:userId[/:assignmentId]]`,
`X-Tenant-Id` header ile (mevcut `settings/*` controller deseniyle aynı), tam guard zinciri
(`JwtAuthGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard,
MfaEnforcementGuard` + `@RequireMfaSetupComplete()` — TASK-027.48 enforcement kapsamına da girdi).

**Kapsam dışı kalan (bilinçli):** tenant rolü **oluşturma/düzenleme** endpoint'i bu task'ta
yapılmadı (task'ın kendi endpoint sözleşmesi yalnızca listeleme/atama/kaldırmayı istiyordu) —
`tenant_roles` satırları hâlâ elle/ayrı bir mekanizmayla oluşturulmalı; web UI da yapılmadı (task
metninde MFA'daki gibi açık bir UI talebi yoktu). İkisi de ayrı, daha küçük bir follow-up task
olabilir.

#### 14.13.1 AI1 review düzeltmeleri (2026-09-22, ikinci tur)

İlk teslim `review`'da tutuldu; iki güvenlik açığı bulundu ve düzeltildi:

1. Son-yönetici sayımı hedef kullanıcının `status`'unu filtrelemiyordu (pasif/kilitli bir
   kullanıcının ataması "hâlâ bir yönetici var" sayılabiliyordu) — düzeltildi, artık yalnızca
   `ACTIVE` kullanıcıların ataması sayılıyor.
2. Kontrol (son-yönetici sayımı) ile silme arasında atomiklik yoktu — iki paralel revoke isteği
   aynı anda kontrolü geçip son iki yöneticiyi birlikte kaldırabilirdi. Düzeltildi: tüm
   `isAdminRole` yolu artık tek bir `db.transaction()` içinde, o tenant'taki tüm `isAdminRole`
   atamaları `SELECT ... FOR UPDATE` ile kilitleniyor (break-glass'ın TASK-027.47'de kurduğu aynı
   desen — `break-glass-recovery.service.ts`).

İki mutasyon da bizzat çalıştırılıp doğrulandı (`eq(users.status,...)` kaldırılınca 1 statik test,
`.for('update')` kaldırılınca 1 test kırıldı). Gerçek Postgres'te paralel iki revoke'un
gerçekten serileştiği canlı bir smoke test (break-glass'ın TASK-027.47-R1 smoke testine benzer)
**bu turda yapılmadı** — kod incelemesi + mock'lu testler + Postgres'in `FOR UPDATE`
serileştirme garantisi bilgisine dayanıyor.
