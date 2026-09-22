# DEC-0014 — MOSEDAŞ Üretim Planlama ve Metnex Operasyon Sınırı

**Date:** 2026-09-22
**Status:** Accepted — Product Owner kararlarıyla
**Deciders:** Product Owner, AI1 (Product Governance Agent)

## Context

Önceki Discovery ve SRS sürümlerinde üretim planlamasının System of Record'u
Metnex olarak tanımlanmıştı. Ürün vizyonu değerlendirmesiyle üretim planlamasının
ayrı MOSEDAŞ uygulamasında yürütüldüğü, Metnex'in ise operasyon yürütme,
gerçekleşme, kapasite ve saha olayları tarafında konumlandığı kesinleştirildi.

Bu karar aynı zamanda tenant ile varlık sahipliğini ayırır. BEAM ve ERP varlık
ana verisi ile sahiplik bilgisinin sahibi olmaya devam eder; Metnex operasyonel
referans ve kapasite görünümü sağlar.

## Decisions

1. **System of Record:** MOSEDAŞ üretim planı ve üretim emrinin SoR'udur.
   Metnex üretim emrini alır, doğrular, kabul/ret eder, yürütür ve operasyonel
   durum/gerçekleşme/olay bilgilerini MOSEDAŞ'a geri bildirir.
2. **Tenant sınırı:** Metnex'te MOSEDAŞ veya MOSB operasyon tenantı yoktur.
   MİP root altında MOSB Enerji ve MOSBIO ayrı operasyon tenantlarıdır.
   Kömür Kazanı MOSB Enerji altında tesis/ünite olarak ele alınır.
3. **Varlık sahipliği:** BEAM/ERP ana veri ve sahiplik SoR'udur. Metnex sınırlı
   tesis/makine referansları ve operasyonel snapshot tutabilir; varlık sahibi
   veya ana veri yöneticisi değildir.
4. **Kapasite:** Operasyonel kapasite ve kullanılabilirlik modeli Metnex'e aittir.
   Nominal dış referanslar kullanılabilir; bakım, duruş, vardiya, arıza ve
   operasyon etkisi Metnex'te hesaplanır ve audit'lenir.
5. **Order lifecycle:** MOSEDAŞ plan/order durumlarının, Metnex operasyon
   yürütme durumlarının sahibidir. Emir versiyonlu, idempotent ve çoklu vardiyaya
   yayılabilir olmalıdır. Koşullar bozulursa Metnex `PAUSED` veya
   `EXECUTION_BLOCKED` üretir; MOSEDAŞ'a bildirir.
6. **Olay geri bildirimi:** Metnex olayları önce kalıcılaştırır, sonra asenkron
   gönderir. `CRITICAL`, `HIGH`, `NORMAL` öncelik sınıfları ve retry/DLQ
   davranışı bulunur.
7. **B2B security:** Üretimde mTLS ve OAuth2 client credentials birlikte
   kullanılır. Kullanıcı JWT'si, `isSystemAdmin`, `TENANT_ADMIN` veya
   impersonation entegrasyon bypass'ı değildir. Her sistem kendi credential ve
   sertifikasını yönetir.
8. **Allowlist:** MOSEDAŞ hedefleri onaylı external-system allowlist'i ile
   tenant, tesis ve makine düzeyinde eşlenir. Payload tek başına erişim vermez.
9. **Lab:** Laboratuvar parametrik, versiyonlu ve onay/kilit/revizyon yaşam
   döngülüdür. İlk analizler kömür, biyokütle, blend ve su analizleridir; yeni
   parametreler domain yöneticisi onayıyla eklenebilir.
10. **İşletme:** İşletme modülü kontrollü parametrik formlarla çalışır;
    Laboratuvar'dan ayrı altyapı, domain, permission ve audit sınırına sahiptir.
11. **UI sırası:** İlk ekran grubu Operasyon Merkezi özeti, vardiya,
    üretim emri ve olay akışıdır. Laboratuvar ekranları bundan sonra gelir;
    İşletme ekranları daha sonra gelir.
12. **Development order:** Domain/API/veri sözleşmeleri ve test fixture'ları
    ekranlardan önce hazırlanır. Uygulama `planned` task'lar onaylandıktan sonra
    başlar. Wave 2 ve Wave 3 bu kararın kapsamına alınmamıştır.

## Consequences

- Metnex'te üretim planlama optimizasyonu, pazar/fiyat ve tedarikçi planlama
  modülü geliştirilmeyecektir.
- MOSEDAŞ entegrasyonu yeni bir B2B bounded context ve external-system registry
  gerektirir; tenant olarak modellenmez.
- Vardiya Operasyon Merkezi, mevcut vardiya raporu/arşiv kapsamından daha geniş
  bir operasyon alanıdır; üretim emri vardiya kaydının içine gömülmez.
- BEAM bakım kaydı kopyalanmaz; bakımın operasyonel kapasite etkisi Metnex'te
  ayrı referans/snapshot olarak izlenir.
- Laboratuvar ve İşletme modülleri ayrı task/epic sınırlarıyla geliştirilecektir.

## Explicit non-decisions

- Gerçek MOSEDAŞ API payload sözleşmesi ve endpoint adresleri henüz yazılmadı.
- BEAM/ERP entegrasyon sözleşmeleri doğrulanmadı.
- Sayısal retry, timeout, retention ve SLA değerleri belirlenmedi.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.
- Bu karar dosyası production kodu, migration veya seed başlatmaz.
