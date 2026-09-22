---
id: TASK-027.44
title: Q-DP24 Privilege Model Kararının Kapatılması
status: review
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID orijinal batch'te bir Wave 5 placeholder'ıydı (`Central report preset model`). AI1'in talimatıyla kapsam **Q-DP24 karar kapanış formu** olarak yeniden tanımlandı; placeholder'ın işi **yapılmadı**. Talimattaki dosya adı (`…privilege-model-decision-closure.md`) mevcut dosyadan farklıydı; aynı ID için ikinci dosya açılmadı. Orijinal placeholder altta korunur.

## AI2 Teslim Raporu (2026-09-21)

**Docs-only task: production kodu, authorization, rol modeli, permission kataloğu ve veri DEĞİŞTİRİLMEDİ. Q-DP24 KAPATILMADI.**

### ⚠️ Kapanış durumu — neden "kapatılmadı"
Talimat "kararları AI1/Product Owner onayıyla kapatmak" ve "Kritik kural: nihai karar AI1/PO tarafından verilmeden authorization kodu, rol modeli veya permission kataloğu değiştirilemez" diyor; ancak mesajda **onaylanmış bir karar iletilmedi**, yalnızca **AI2 önerisi** ("Product Owner onayı olmadan bağlayıcı kabul edilmez") verildi. Bu yüzden 10 maddenin **"AI1/PO kararı" sütunları BOŞ bırakıldı**, öneri "AI2 önerisi" olarak işlendi ve karar bağlayıcı kaydedilmedi. PO her satırı işaretleyince (Onay / Değişiklikle onay / Red) form yalnızca doküman güncellemesiyle kesinleşecek ve implementation görevleri açılabilecek. Onaylı karar bekleniyor; AI2 bu kararı kendi adına kapatmadı.

### 🔄 Güncelleme — AI1 karar seti kayda alındı (2026-09-21)
AI1 10 maddelik karar setini iletti; AI2 **kararı kendi adına vermedi, AI1 kararı olarak kayda aldı** (`METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.2 "AI1 kararı" sütunu ve §5 a–j tablosu dolduruldu; boş alan kalmadı). Kararlar: (1) SYSTEM_ADMIN verme/kaldırma yalnızca aktif SYSTEM_ADMIN; (2) eş sistem yöneticileri parola/rol işlemlerinde birbirini yönetemez, deactivation/containment serbest; (3) global TENANT_ADMIN yasak, mevcut atamalar otomatik silinmeden salt-okunur ön kontrolde raporlanır; (4) actor, sahip olduğundan yüksek etkin izin kümesine sahip rol veremez; (5) canonical kaynak SYSTEM_ADMIN rol ataması, isSystemAdmin türetilmiş/cache + drift kontrolü; (6) impersonation'da privilege değişikliği yasak; (7) MFA ayrı karar ve geçiş task'ından önce zorunlu değil; (8) tenant-role delegation yeni permission + ayrı task; (9) son yönetici = canonical role atamalarına göre tek invariant; (10) global privilege işlemlerinde audit zorunlu, rollback ve break-glass ayrı task.
**Kapanış AI1'in `done` onayına bağlıdır; implementation BAŞLATILMADI** (AI1: sıradaki görev TASK-027.45). Bu güncellemede yalnızca dokümantasyon değişti.

**AI2 teknik değerlendirmesi (belge §14.5 — kararı değiştirmez, AI1 teyidi/netleştirme ister):**
- **A ⚠️ Karar 2'nin sonucu (kodla doğrulandı):** kodda **self-servis parola değiştirme yolu yok** ve platform yüzeyinde kendi parolayı değiştirmek yasak (`SELF_CHANGE`); bugün sistem yöneticisi parolasını yalnızca eş yönetici sıfırlayabiliyor → karar 2 uygulanınca **sistem yöneticisi parolası için hiçbir API yolu kalmaz** (yalnızca DB/env break-glass) ve "olası hash ifşası için parola rotasyonu" riski sistem yöneticileri için uygulanamaz olur. **Öneri:** eş-yönetim kısıtı (027.47) bir kimlik bilgisi rotasyon yolu (self-servis değiştirme / onaylı break-glass) ile birlikte veya sonra yayına alınsın; 027.45/.46 bu kısıtı içermez.
- **B** drift'te çalışma zamanı davranışı (öneri fail-closed ayrıcalık işlemlerinde) ve "ACTIVE" tanımı (pasif kullanıcının ataması sayılmaz) 027.45'te; **C** "etkin izin kümesi" `PermissionGuard` semantiğiyle (tenant'ta TENANT_ADMIN = PLATFORM dışı her şey) tanımlanmalı (027.46); **D** global↔tenant sınırı kısmen açık (ROOT+TENANT_ADMIN kuralı ve scope dönüştürme yasağı AI1 setinde yok); **E** karar 3 yalnızca yeni atamaları engeller, mevcutlar kaldırılana kadar etkindir; **F** "privilege değişikliği" işlem kümesi ve "sysadmin impersonate edilemez" (setde yok) teyidi; **G** MFA admin reset eşlere karşı yasak varsayımı; **H** break-glass/rollback 027.47'ye kadar yalnızca mevcut env bootstrap'a bağlı.

**Kısmen açık kalan noktalar:** karar tablosu satır 4 (global↔tenant sınırı) ve satır 10'un "ikinci onay" kısmı; ≥ 2 yönetici politikası, `SETTINGS:*` katalog boşluğu ve shadow-mode/geçiş penceresi AI1 setinde yok. Bunlar §14.5'te işaretli; Q-DP24'ün tam kapanışında AI1 tarafından ya karara bağlanır ya da ilgili implementation task'ına devredilir.

### Kapanış formu (belge §14)
`docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14: 10 karar için AI2 önerisi · gerekçe · etkilenen endpoint/service · etkilenen permission/rol · migration gereksinimi · rollback yaklaşımı · sonraki task (öneri) · **boş AI1/PO kararı**. Önerilen implementation görevleri (numaralarını AI1 atar): **027.45** canonical kaynak + tek son-yönetici invariant'ı + drift kontrolü; **027.46** `assignRole` sertleştirmesi (global `TENANT_ADMIN` yasağı, tenant-kapsamlı atamada yalnızca ROOT+`TENANT_ADMIN`, delegasyon tavanı, impersonation'da privilege yasağı); **027.47** eş sistem yöneticisi yönetimi + ikinci onay tasarımı; **027.48** global privilege değişikliklerinde MFA (Q-DP22b/c ile); **027.49** tenant-rol delegasyonu (yeni permission — katalog onayı önce); öncül: gerçek ortam salt-okunur ön kontrolü.

### AI2'nin önerileri sınarken bulduğu — PO'nun bilerek karar vermesi gereken noktalar (§14.1)
1. **"Sistem yöneticileri birbirini yönetemez; istisna → ikinci onay" önerisi bugün güvenli uygulanamaz:** ikinci onay mekanizması yok; yasak tek başına ele geçirilmiş bir eş sistem yöneticisi hesabını **deaktive etme, parolasını sıfırlama, rolünü alma** yeteneğini yok eder (yalnızca hiç yönetici kalmadığında çalışan env break-glass kalır) — olay müdahalesini zayıflatır. AI2 önerisi: yasak kimlik bilgisi/rol işlemlerine uygulanır, **containment (deaktivasyon) eşler arasında serbest kalır** veya yasak onay mekanizması gelene kadar ertelenir. Bu, talimat önerisinden bilinçli bir sapmadır ve PO'nun açık seçimi gerekir.
2. **Global `TENANT_ADMIN` yasağı ürün akışını bozmaz (kodda):** tüm işlevsel kullanımlar tenant-kapsamlı (`MeService`, `CustomerAccessService`, `PermissionGuard` tenant dalı, `provisionCustomer`); global atama yalnızca istenmeyen `PLATFORM:USER/TENANT` yazma izinleri açar. Gerçek ortamda mevcut global atama var mı **[DOĞRULANAMADI]** — yasaktan önce salt-okunur ön kontrol şart; otomatik silme yok, mevcutlar kaldırılabilmeli (`revokeRole` serbest).
3. **"Sahip olduğundan yüksek privilege veremez"** için ayrıcalık sırası tanımı gerekir (verilen rolün etkin izin kümesi ⊆ actor'ın etkin izin kümesi; `SYSTEM_ADMIN` yalnızca sistem yöneticisi).
4. **Canonical kaynak:** guard/perf/audit/settings/MFA-reset/impersonation bayrağı okur; rolü yalnızca `PLATFORM:` izin çözümlemesi okur → önerilen: rol ataması canonical, bayrak türetilmiş (hot-path için saklanır) + drift kontrolü; önce servis invariant'ı, DB trigger/constraint sonraki aşama.
5. **MFA şartı sıralaması:** MFA zorlaması bağlı değil, impersonation token'ı `mfaVerified: true` üretir, MFA'sız adminler olabilir → şimdi zorunlu kılmak kilitlenme yaratır; önce `mfaVerified` semantiği ve MFA'sız admin geçişi (Q-DP22b/c) — AI2 önerisi ile uyumlu (ayrı security task).
6. **Tenant-rol delegasyonu** yeni permission kodu gerektirir (kataloğda yok) → katalog değişikliği ayrı onay + ayrı task; kod uydurulmadı.

### Doğrulama
- **`./scripts/check.sh --skip-docker`: PASS (exit 0)** — API **50 suite / 1364 test**, web 8 dosya / 117 test. Kod değişmediği için sonuç mevcut test kapsamıdır (önceki teslimle aynı).
- **Q-ENV01 workaround (açık):** yalnızca bu çalıştırma için `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose`; repo/env dosyası değişmedi, kontrol atlanmadı.
- Gerçek DB/HTTP kullanılmadı; gerçek ortam verisi (global `TENANT_ADMIN`, bayrak↔rol drift'i, sistem yöneticisi sayısı) **[DOĞRULANAMADI]**.

### Değişen dosyalar
Yalnızca dokümantasyon: `docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` (§14 eklendi; durum satırı ve "PO karar alanları" notu güncellendi), `BOTC_MIGRATION_OPEN_QUESTIONS.md` (append-only), `METNEX_STATE.md`, `PROGRESS_LOG.md`, bu backlog kaydı.

### Açık kalanlar
**Q-DP24 (AI1/PO kararı bekliyor)**, F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill, gerçek ortam audit incelemesi/parola rotasyonu değerlendirmesi. Yapılmayanlar: production authorization kodu, permission kataloğu/rol değişikliği, gerçek DB/HTTP, MFA enforcement, tenant-role delegation, F6, Wave 2/3, Docker, git commit/push.
`status: review` — `done` AI1'in onayına bağlı (karar seti kayda alındı, §14.5 teyitleri bekliyor).

---

# TASK-027.44: Central report preset model

## Amaç

Kaynak, kolon, çözünürlük, scale ve filtreleri preset olarak sakla.

## Wave ve bağımlılık

TASK-027.41

## Kapsam kuralları

- Discovery ve SRS tenant, permission ve Metnex kararlarına uy.
- Mevcut modül sınırlarını koru; yeni framework oluşturma.
- Tenant scope, audit, güvenlik ve idempotency etkilerini ele al.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.

## Kabul kriterleri

- Amaç ve bağımlılıklar kanıtla karşılanmış olmalı.
- Tenant/permission/security etkileri test veya dokümanla doğrulanmalı.
- Hata, empty state, audit ve tekrar çalıştırma davranışı tanımlı olmalı.
- İlgili domain/runbook/decision dokümanları güncellenmeli.
- ./scripts/check.sh --skip-docker sonucu raporlanmalı.
- Gerçek secret, parola veya connection string rapora yazılmamalı.
- Git commit/push yapılmamalı.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.

