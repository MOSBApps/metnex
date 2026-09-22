# Security Dizini

Bu klasör, proje güvenlik mimarisi ve SDLC kapsamındaki güvenlik teslimatlarını içerir.

## Kanonik Mimari Belgesi

- [APPLICATION_SECURITY_ARCHITECTURE.md](APPLICATION_SECURITY_ARCHITECTURE.md)
  - Türetilen projelerde auth, permission, row-level boundary ve legacy role yasakları için zorunlu sözleşmedir.


## Durum Özeti

- [ ] `risk-register.md` dolduruldu
- [ ] `threat-models/` altında aktif özellikler için threat model var
- [ ] `risk-acceptance/` altında açık risk kabulleri kayıtlı
- [ ] `dast/` altında son DAST raporu var
- [ ] `pentest/` altında gerekiyorsa pentest raporu var
- [ ] `go-live/` altında imzalı go-live checklist var

## Çalışma Kuralı

1. Yeni özellikte önce threat model notu oluştur.
2. Kapanmayan risk varsa risk acceptance kaydı aç.
3. Release öncesi DAST raporunu ekle.
4. Gerekliyse pentest raporunu ekle.
5. Go-live checklist'i doldurup linkleri bağla.

## TODO

- [ ] Claude agent: Bu klasördeki tüm `TEMPLATE` dosyalarından gerçek teslimat üret.
- [ ] Claude agent: PR açıklamasına ilgili teslimat linklerini ekle.
- [ ] Codex: SDLC uyum onayı öncesi teslimatları doğrula.
