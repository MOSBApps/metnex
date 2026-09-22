# metnex — Renk Sistemi

> Bu dosya bağlayıcıdır. Renk kararları burada tanımlanır; bileşen bazında keyfi renk seçimi yapılamaz.

---

## Temel Yaklaşım: Semantic Token'lar

Hardcoded Tailwind class'ı (`bg-blue-600`, `text-red-500`) **kullanılmaz**.
Bunun yerine her renk bir anlam taşıyan token adıyla çağrılır.

Tailwind `tailwind.config.ts` içinde semantic token'lar tanımlanır:

```ts
// tailwind.config.ts
colors: {
  brand: {
    DEFAULT: '#2563EB',  // blue-600
    light:   '#DBEAFE',  // blue-100
    dark:    '#1D4ED8',  // blue-700
    fg:      '#FFFFFF',  // brand üzeri metin
  },
  surface: {
    DEFAULT:  '#FFFFFF',
    muted:    '#F8FAFC',  // slate-50
    subtle:   '#F1F5F9',  // slate-100
    border:   '#E2E8F0',  // slate-200
    overlay:  'rgba(0,0,0,0.5)',
  },
  ink: {
    DEFAULT:  '#0F172A',  // slate-900
    muted:    '#475569',  // slate-600
    subtle:   '#94A3B8',  // slate-400
    disabled: '#CBD5E1',  // slate-300
    inverse:  '#FFFFFF',
  },
  status: {
    success:    '#16A34A',  // green-600
    success_bg: '#DCFCE7',  // green-100
    warning:    '#D97706',  // amber-600
    warning_bg: '#FEF3C7',  // amber-100
    danger:     '#DC2626',  // red-600
    danger_bg:  '#FEE2E2',  // red-100
    info:       '#2563EB',  // blue-600
    info_bg:    '#DBEAFE',  // blue-100
  },
  financial: {
    positive:    '#16A34A',  // gelir, fazla, uyumlu
    negative:    '#DC2626',  // gider, açık, aşım
    neutral:     '#475569',  // tarafsız tutarlar
    released:    '#7C3AED',  // serbest bırakılmış (mor — bütçe ≠ release)
    released_bg: '#EDE9FE',
  }
}
```

---

## Durum Renkleri — Kullanım Kuralı

| Durum | Token | Kullanım |
|---|---|---|
| Başarı / Uyumlu | `status.success` | WITHIN_RELEASE, aktif, tamamlandı |
| Uyarı | `status.warning` | eşiğe yakın, beklemede, taslak |
| Tehlike / Aşım | `status.danger` | EXCEEDS_RELEASE, hata, kritik |
| Bilgi | `status.info` | açıklama, rehber mesajı |

**Renk + ikon birlikte kullanılır** — renk tek başına anlam taşımaz (erişilebilirlik kuralı).

```tsx
// ✅ Doğru
<Badge className="bg-status-success_bg text-status-success">
  <CheckCircle size={12} /> Uyumlu
</Badge>

// ❌ Yanlış — renk tek başına
<span className="text-green-600">Uyumlu</span>
```

---

## Finansal Renk Kuralı

Bütçe, serbest bırakma ve gerçekleşme üç ayrı kavramdır — renkleri karıştırılamaz.

| Kavram | Token | Açıklama |
|---|---|---|
| Bütçe tutarı | `ink.muted` | Plan miktarı — nötr |
| Serbest bırakılan | `financial.released` | Release authority — mor |
| Gerçekleşme ≤ release | `financial.positive` | Uyumlu harcama |
| Gerçekleşme > release | `financial.negative` | Aşım — tehlike |

---

## Yüzey Hiyerarşisi

```
surface.muted     ← sayfa arka planı (en dış katman)
surface.DEFAULT   ← card, panel arka planı
surface.subtle    ← tablo satır hover, input arka planı
surface.border    ← tüm border'lar
```

---

## Karanlık Mod

Şu aşamada **karanlık mod desteklenmez**. Tek tema (aydınlık). İleride eklenirse bu dosya güncellenir.
Karanlık mod varsayımıyla `dark:` class'ları yazılmaz.

---

## Yasaklar

- `bg-blue-600`, `text-red-500` gibi doğrudan Tailwind renk class'ları bileşen katmanında yasaktır
- Inline `style={{ color: '#...' }}` kullanımı yasaktır
- Semantic token olmayan bir renk için önce bu dosyayı güncelle, sonra kullan
