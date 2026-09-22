# metnex SDLC Checklist ve Mevcut Durum

Tarih: 2026-03-05
Sorumlu Rol: SDLC Owner

Referans:

- `docs/AI_Governance/SDLC.md`
- `docs/AI_Governance/AGENT-OPERATING-MODEL.md`

## 1) Hızlı Mevcut Durum (As-Is)

Bu durum, repo içi görünen kanıtlara göre çıkarılmıştır.

| Alan | Durum | Kanıt |
|---|---|---|
| SDLC standard dokümanı | Var | `docs/AI_Governance/SDLC.md` |
| CI pipeline | Var | `.github/workflows/pipeline.yml` |
| Secret scanning | Var | `gitleaks` job |
| Dependency scanning (SCA) | Var | `pnpm audit --audit-level=high` |
| SAST | Var | `typecheck + lint` |
| Container image scanning | Var | `trivy` job |
| Risk analizi kaydı (risk register) | Eksik | Repo içinde ayrı risk register dosyası yok |
| Threat model çıktısı | Eksik | Repo içinde threat model artefaktı yok |
| Risk acceptance kayıtları | Eksik | Yazılı risk acceptance artefaktı yok |
| DAST raporu | Eksik | Pipeline veya docs altında DAST kanıtı yok |
| Pentest raporu | Eksik | Repo içinde pentest raporu yok |
| Otomasyon test kapsamı | Çok düşük | API tarafında 2 adet boilerplate test dosyası |

Not: Test altyapısı komut olarak tanımlı, ancak mevcut test içeriği işlevsel kapsam için yetersiz görünüyor.

## 2) Geliştirici İçin Zorunlu SDLC Checklist (PR Öncesi)

Her PR açıklamasına aşağıdaki blok eklenmeli ve doldurulmalı:

### A) Risk ve Tasarım
- [ ] Değişiklik için mini threat model çıkarıldı (entry point, trust boundary, abuse case).
- [ ] En az 1 güvenlik gereksinimi yazıldı (örn: authz, input validation, rate limit).
- [ ] Açık kalan risk varsa risk acceptance kaydı eklendi (sahip, süre, azaltım planı).

### B) Kod ve Güvenlik
- [ ] Secret/credential hardcoded değil.
- [ ] Tenant isolation etkisi değerlendirildi (varsa test veya kanıt eklendi).
- [ ] Yetkilendirme kontrolleri değiştiyse negatif test yazıldı.
- [ ] Loglara PII/secret sızmadığı kontrol edildi.

### C) Test Kanıtı
- [ ] Birim testi eklendi/güncellendi.
- [ ] Kritik akış için en az 1 entegrasyon veya e2e testi eklendi.
- [ ] CI test çıktısı PR’a eklendi (başarılı pipeline linki).

### D) Pipeline ve Deploy
- [ ] CI (secret-scan, SCA, SAST, test, build) yeşil.
- [ ] Container scan (Trivy) High/Critical temiz veya risk acceptance mevcut.
- [ ] Migration varsa rollback notu yazıldı.
- [ ] Environment/secret değişikliği varsa `docs/runbooks/deployment.md` güncellendi.

## 3) Merge Gate (SDLC)

Bu 4 madde sağlanmadan merge yapılmamalı:

1. CI ve security scan jobs tamamen yeşil.
2. PR’da test kanıtı ve değişiklik kapsamına uygun test ekleri var.
3. Threat model notu ve gerekirse risk acceptance kaydı var.
4. Kritik/High bulgular için kapatma veya yazılı kabul mevcut.

## 3.1) Commit Gate (Codex Review)

Commit öncesi aşağıdaki kapı geçilmeden commit atılmamalı:

1. Codex review sonucu: `SDLC Durumu = Uygun` veya `Koşullu Uygun`.
2. `Code Review Durumu = Uygun` değilse commit ertelenir.
3. Kritik ve yüksek bulgular kapanmadan commit yapılmaz.

## 4) En Kritik Açıklar (Şu An)

1. Risk register yok (kurumsal izlenebilirlik eksik).
2. Threat modeling artefaktı yok (tasarım güvenlik izi eksik).
3. DAST/pentest kanıtı yok (release öncesi dinamik güvenlik doğrulaması eksik).
4. Test kapsamı çok düşük (özellikle auth, tenant isolation, permission boundary).

## 5) 7 Günlük SDLC Toparlama Planı

1. `docs/security/risk-register.md` oluştur ve ilk 10 riski gir.
2. `docs/security/threat-model-<feature>.md` şablonu oluştur, yeni PR’larda zorunlu kıl.
3. API için minimum test hedefi koy: auth + tenant + critical CRUD senaryoları.
4. Basit bir DAST çalıştır (staging URL) ve raporunu `docs/security/dast/` altına koy.
5. PR template içine SDLC checklist maddelerini ekle.

## 6) PR İçine Kopyala-Yapıştır Bloku

```md
### SDLC Checklist
- [ ] Threat model notu eklendi
- [ ] Risk acceptance gerekiyorsa eklendi
- [ ] Secret leak kontrolü yapıldı
- [ ] Auth/AuthZ etkisi test edildi
- [ ] Tenant isolation etkisi doğrulandı (varsa)
- [ ] Unit/integration/e2e test kanıtı eklendi
- [ ] CI + Scan çıktıları yeşil
```
