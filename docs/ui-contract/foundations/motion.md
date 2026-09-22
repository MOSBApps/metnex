# metnex — Hareket ve Animasyon Sistemi

---

## Felsefe

metnex bir **kurumsal finansal uygulama**dır. Animasyon bilgi iletimini destekler; dekor değildir.

Temel kural: **kullanıcı beklemez, uygulama bekler.**
- Hız > görsellik
- Abartılı geçişler yasak
- `prefers-reduced-motion` her zaman desteklenir

---

## Süre Değerleri

| Token | ms | Kullanım |
|---|---|---|
| `duration-75` | 75ms | tooltip göster/gizle |
| `duration-150` | 150ms | button hover, focus ring, badge |
| `duration-200` | 200ms | **varsayılan** — dropdown aç, input focus |
| `duration-300` | 300ms | modal/drawer giriş/çıkış |
| `duration-500+` | — | **yasak** (loading skeleton hariç) |

---

## Easing

| Kullanım | Tailwind |
|---|---|
| Giriş (beliriyor) | `ease-out` |
| Çıkış (kayboluyor) | `ease-in` |
| State geçişi | `ease-in-out` |

---

## Standart Geçişler

```tsx
// Button, badge, input state geçişi
className="transition-colors duration-150 ease-in-out"

// Dropdown, popover giriş
className="transition-all duration-200 ease-out"

// Modal, drawer giriş
className="transition-all duration-300 ease-out"

// Skeleton pulse
className="animate-pulse"
```

---

## Azaltılmış Hareket

```tsx
// Tailwind motion-safe / motion-reduce
className="motion-safe:transition-all motion-safe:duration-200"
```

`prefers-reduced-motion: reduce` aktifse tüm geçişler anında gerçekleşir. Animasyon hiçbir zaman fonksiyonel bilgi taşımaz.

---

## Yasak Animasyonlar

- `animate-bounce` — dikkat dağıtır, yasak
- `animate-spin` (loading spinner hariç) — yasak
- Sonsuz döngülü süsleme animasyonları — yasak
- Sayfa geçişleri için karmaşık slide/fade sekansları — yasak (Next.js route transition varsayılan)
