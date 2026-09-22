# metnex — UI Override Kuralları

---

## Override Nedir?

UI Contract'ta tanımlanan bir kuraldan kasıtlı olarak sapma.
Her override **kayıt altına alınmalı** ve **gerekçelendirilmelidir**.

---

## Override Annotation

Kaynak kod dosyasında, sapmanın hemen üstünde:

```tsx
// @ui-override: [kural adı] — [gerekçe]
// Örnek:
// @ui-override: crud-screen.md#row-click — Bu listede satıra tıklama detay sidebar'ı açar (AI1 onaylı, DEC-XXXX)

// @ui-override: dashboard.md#no-modal — Onboarding wizard modal olarak açılıyor; modül embed kullanımı
```

### Format

```
// @ui-override: <dosya>#<kural-id> — <gerekçe>
```

- `dosya`: `patterns/crud-screen.md`, `components/button.md`, vb.
- `kural-id`: Başlık veya kural numarası (`#row-click`, `#duration-300`)
- `gerekçe`: Neden sapıldığı, varsa ilgili karar numarası

---

## Override Seviyeleri

### Seviye 1 — Düşük Risk (Otomatik Geçerli)

AI2 kodu override annotation ile yazabilir, AI1 PR review'da kabul eder.

Örnekler:
- Tablo satır boyutu küçültme (`py-2` → `py-1`)
- Kompakt mod için padding değişikliği
- Ek icon ekleme

### Seviye 2 — Orta Risk (AI1 Onayı)

PR açıklamasında belirtilmeli, AI1 açıkça onaylamalı.

Örnekler:
- Satıra tıklama ile detay açma (`crud-screen.md` saklıyor)
- Dashboard üzerinde modal açma
- Sekme sayısı > 6

### Seviye 3 — Yüksek Risk (AI1 + Deviation Log)

Hem annotation hem `governance/deviation-log.md` kaydı zorunlu.

Örnekler:
- Dashboard→Liste→Detay sırası değişimi
- Form yerine inline edit
- Yeni temel layout kalıbı

---

## Ne Zaman Override Gerekir?

| Durum | Override Gerekiyor mu? |
|---|---|
| Farklı bir shadcn/ui varyantı kullanmak | Hayır — component katmanı |
| Tablo sıralama UI'ı değiştirmek | Evet — Seviye 1 |
| Modal içinde form açmak (create için) | Evet — Seviye 2 |
| Dashboard'u atlamak | Evet — Seviye 3 |
| Animasyon süresini uzatmak (> 300ms) | Evet — Seviye 2 |
| 7. kolon rengi token dışından kullanmak | Evet — Seviye 2 |

---

## Override'ı Geçerli Kılan Şartlar

1. `// @ui-override:` annotation kaynak kodda mevcut
2. Gerekçe açık ve operasyonel (UX gereksinimi veya teknik kısıt)
3. Seviyeye göre: AI1 onayı ve/veya deviation-log.md kaydı
4. Override sonucu `prefers-reduced-motion` ihlal etmiyor
5. Override sonucu `text-status-*` renk çiftleme kuralını ihlal etmiyor

---

## Override Olmaksızın Asla Değiştirilemeyenler

Bu kurallar hiçbir koşulda override edilemez:

- `prefers-reduced-motion` desteği — erişilebilirlik zorunluluğu
- Status renk + ikon çiftleme — renk körü kullanıcılar için
- PageHeader zorunluluğu — navigasyon/breadcrumb tutarlılığı
- Label olmadan form alanı — erişilebilirlik
- Silme confirmation dialog'u — veri güvenliği
- İzin kontrolleri (permission gating) — güvenlik

---

## AI2 İçin Kural

AI2 override yapmadan önce şunu sormalı:

> "Bu kalıptan sapma gerekiyor mu, yoksa kalıbı doğru uygulamadım mı?"

Gerçek override: Gereksinim kalıpla çelişiyor.
Yanlış override: Kalıbı yanlış anlayıp farklı yazmak.

Şüphede kalındığında override annotation yaz, AI1'e sor.
