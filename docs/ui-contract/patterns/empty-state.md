# metnex — Empty State Kalıbı

---

## Kullanım Bağlamı

| Bağlam | Bileşen |
|---|---|
| Tablo içi (veri yok) | `<TableCell colSpan={n}><EmptyState /></TableCell>` |
| Tam sayfa (modül henüz kurulmamış) | `<EmptyState>` sayfanın ortasında |
| Sekme içi | Sekme content alanında ortalanmış |

---

## Canonical Yapı

```tsx
<div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle">
    <Icon size={24} className="text-ink-subtle" />
  </div>
  <div>
    <p className="text-sm font-medium text-ink">{title}</p>
    <p className="mt-1 text-sm text-ink-muted">{description}</p>
  </div>
  {action && (
    <Button size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  )}
</div>
```

---

## Metin Kuralları

| Alan | Kural |
|---|---|
| `title` | Kısa, gerçekçi durum: "Bütçe bulunamadı", "Henüz veri yok" |
| `description` | Ne yapılabileceğini açıklar — teknik değil operasyonel dil |
| `action` | Tek eylem, primary; "Yeni Bütçe Oluştur", "Filtre Temizle" |

### Yasaklar

- "Ops! Bir şeyler ters gitti" — bu hata state'idir, empty state değildir
- İllüstrasyon, emoji, karmaşık grafik — yasak
- Birden fazla aksiyon butonu

---

## Senaryolar

### 1. Liste boş — hiç kayıt yok

```tsx
<EmptyState
  icon={<Wallet size={24} />}
  title="Henüz bütçe oluşturulmadı"
  description="Yeni bir bütçe ekleyerek başlayın."
  action={{ label: 'Yeni Bütçe', onClick: handleCreate }}
/>
```

### 2. Filtre sonucu boş

```tsx
<EmptyState
  icon={<SearchX size={24} />}
  title="Arama kriterlerine uyan sonuç yok"
  description="Farklı bir filtre deneyin veya tüm filtreleri temizleyin."
  action={{ label: 'Filtreleri Temizle', onClick: clearFilters }}
/>
```

### 3. İzin yok (tab/section gizli değil ama içerik erişilemez)

```tsx
<EmptyState
  icon={<Lock size={24} />}
  title="Bu içeriği görüntüleme yetkiniz yok"
  description="Erişim için yöneticinizle iletişime geçin."
/>
```

### 4. Sekme içi — ilgili kayıt henüz eklenmemiş

```tsx
<EmptyState
  icon={<FileText size={24} />}
  title="Sözleşme eklenmemiş"
  description="Bu bütçeye henüz sözleşme bağlanmamış."
  action={{ label: 'Sözleşme Ekle', onClick: handleAddContract }}
/>
```

---

## Boyut Varyantları

```tsx
// Tablo içi (kompakt)
<div className="py-8">...</div>

// Tam sayfa / büyük alan
<div className="py-20">...</div>

// Sekme içi (orta)
<div className="py-12">...</div>  // canonical varsayılan
```

---

## Erişilebilirlik

- Icon container `aria-hidden="true"` — dekoratif
- Başlık `<p>` değil, `role="status"` ile sarılabilir: `<div role="status">`
- Aksiyon butonu standart focus ring ile erişilebilir
