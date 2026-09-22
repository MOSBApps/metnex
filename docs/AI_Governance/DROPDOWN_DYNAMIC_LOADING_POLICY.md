# Dropdown & Combobox Dynamic Loading Policy

**Policy ID:** GOV-POLICY-DROPDOWN-DYNAMIC-LOADING-V3
**Geçerlilik Tarihi:** 2026-03-12
**Önceki Versiyon:** V2 (min-2-char, tek sayfa modeli — geçersiz kılındı)
**Kapsam:** `apps/web` — tüm form sayfaları ve liste ekranları

---

## Amaç

Bu politika, form sayfalarındaki kullanıcı seçim bileşenlerinin (dropdown, combobox, checkbox listesi) veri yükleme davranışını standartlaştırır. Hedef:

* Büyük koleksiyonlarda gereksiz toplu veri yükünü önlemek
* Kullanıcıya hızlı, dinamik arama deneyimi sunmak
* Tutarsız ve güvensiz API çağrı desenlerini engellemek

---

## 1. Temel Model: Server-Side Dinamik Arama

### Ana Kural — Dropdown/Combobox = Server-Side Search

Form bileşenlerinde kullanıcı seçimi için **varsayılan model** sunucu tarafı dinamik aramadır.
Kullanıcı karakter girdikçe API çağrısı yapılır; tüm koleksiyon istemciye çekilmez.

```typescript
// ✅ DOĞRU — server-side search
const [query, setQuery] = useState('')
const [options, setOptions] = useState<SelectOption[]>([])

// debounce ile:
useEffect(() => {
  if (query.length < 2) { setOptions([]); return }
  const id = setTimeout(() => {
    api.users.search({ q: query, limit: 20 }, token).then(setOptions)
  }, 300)
  return () => clearTimeout(id)
}, [query])
```

**Zorunlu gereksinimler:**

| Parametre | Değer |
| --------- | ----- |
| Debounce | 250–400ms |
| Minimum karakter | 2 (varsayılan; konfigüre edilebilir) |
| Response boyutu | ≤ 50 kayıt |
| Race-condition koruması | `AbortController` veya `requestId` pattern |

---

### Kural 2 — State Standartları

Her server-side search bileşeninde şu durumlar ele alınmalıdır:

```typescript
// Zorunlu state'ler
const [query, setQuery]       = useState('')   // kullanıcı girişi
const [options, setOptions]   = useState([])   // sonuç listesi
const [loading, setLoading]   = useState(false) // yükleniyor
const [searchError, setSearchError] = useState<string | null>(null) // hata

// UX gereksinimleri:
// - loading → spinner veya "Aranıyor..."
// - options.length === 0 && query.length >= 2 && !loading → "Sonuç bulunamadı"
// - searchError → "Arama sırasında hata oluştu"
// - query.length < 2 → hint mesajı ("En az 2 karakter girin")
```

---

### Kural 3 — Tablo/Liste Ekranları İçin Sayfalama

Yalnızca sayfalanmış liste/tablo ekranları `page` ve `limit` parametresi kullanır.
Form bileşenleri asla `page` parametresi kullanmaz.

```typescript
// ✅ DOĞRU — tablo ekranı
api.risks.list({ page: currentPage, limit: pageSize }, token)

// ❌ YANLIŞ — form combobox'ta sayfalama
api.risks.list({ page: 1, limit: 20 }, token) // kullanıcı scroll etmeden 21. kaydı göremez
```

---

### Kural 4 — Standart Bileşenler

| Kullanım Senaryosu | Bileşen |
|-------------------|---------|
| Tekli seçim — dinamik arama | `SearchableSelect` (server-side search prop ile) |
| Çoklu seçim — dinamik arama | `FilteredCheckboxList` (server-side search prop ile) |
| Sabit/enum listeler | Native `<select>` veya hardcoded options |

Native `<select>` yalnızca değeri **kod içinde sabit** olan listeler için kullanılabilir
(örn: `['OPEN', 'CLOSED']` gibi enum seçenekleri).

---

## 2. İstisna: limit:500 Toplu Yükleme

Toplu yükleme (`limit: 500`) yalnızca aşağıdaki koşulların **tamamı** sağlandığında kullanılabilir:

1. **Kanıtlanmış düşük cardinality**: Kayıt sayısı üretimde kalıcı olarak < 200 olacak
2. **Sınırlı büyüme**: Koleksiyon zamanla önemli ölçüde büyümeyecek
3. **Belgelenmiş**: Kaynak dosyada açıklayıcı yorum zorunlu

```typescript
// DROPDOWN-POLICY-EXCEPTION: ISO standards — fixed 6-item enum list, no search needed
const ISO_STANDARDS = [...]

// DROPDOWN-POLICY-EXCEPTION: departments — bounded cardinality (~30 max), bulk load acceptable
api.departments.list({ limit: 500 }, token)
```

**Belgelenmemiş `limit: 500` kullanımı policy ihlalidir.**

---

## 3. Yasak Anti-Patternler

| Anti-Pattern | Neden Yanlış | Doğru Alternatif |
| ------------ | ------------ | ---------------- |
| `api.users.list({}, token)` form'da | Varsayılan ~20 limit; kayıtların çoğu gizli | Server-side search, `q` parametreli |
| `api.users.list({ limit: 500 }, token)` (belgesiz) | Cardinality kanıtlanmamış; yükleme yavaş | `DROPDOWN-POLICY-EXCEPTION` yorumuyla veya dinamik arama |
| Native `<select>` API verisiyle | Arama yok; büyük listede UX kötü | `SearchableSelect` |
| `page` parametresi form bileşeninde | Sadece ilk sayfa görünür | Server-side search |
| Debounce olmadan anlık arama | Her tuş vuruşunda API çağrısı | 250–400ms debounce zorunlu |
| Race-condition korumasız arama | Geç gelen yanıt eski sonucu ezer | `AbortController` veya `requestId` |
| `limit: 9999` veya `limit: 100000` | Backend aşırı yük | Server-side search, `limit: 20–50` |

---

## 4. Kabul Kriterleri

Bir form sayfası bu politikaya uygun sayılmak için:

- [ ] Dinamik listeler (kullanıcı, çalışan, departman, vb.) server-side search kullanır
- [ ] Debounce ≥ 250ms ve minimum karakter ≥ 2 uygulanmış
- [ ] Race-condition koruması (`AbortController` veya `requestId`) mevcut
- [ ] Loading / empty / error state'leri ele alınmış
- [ ] `limit: 500` kullanımları `// DROPDOWN-POLICY-EXCEPTION:` yorumuyla belgelenmiş
- [ ] Native `<select>` yalnızca sabit/enum değerler için kullanılmış
- [ ] `pnpm --filter web tsc --noEmit` hatasız geçer

---

## 5. SDLC Kapı Kontrolleri

### PR Checklist (AI1 / Reviewer)

PR'da form sayfası değişikliği varsa:

1. Dropdown kaynak endpointi `q` parametresi destekliyor mu?
2. FE'de debounce uygulanmış mı?
3. `api.*.list({})` anti-pattern var mı?
4. `limit: 500` kullanımı varsa `DROPDOWN-POLICY-EXCEPTION` notu var mı?
5. Loading / empty / error state'leri ele alınmış mı?

### Engineering Executor (AI2) — Yeni Form Sayfası

1. Dinamik liste için backend endpoint'e `q` parametresi eklendiğini doğrula
2. `SearchableSelect` / `FilteredCheckboxList` bileşenlerini server-side search prop ile kullan
3. Debounce + race-condition korumasını implement et
4. `limit: 500` kullanıyorsan yorum ekle; yoksa dinamik aramaya geçir

---

## 6. Genel İstisnalar

Aşağıdaki durumlar bu politikadan tamamen muaftır:

* **Hiyerarşik/ağaç veri**: Process areas, klasör yapısı — client-side hierarchical render
* **Klasör kapsamlı listeler**: Belirli bir klasör/kategorideki belgeler
* **Sabit enum listeleri**: Kod içinde tanımlı, API'dan gelmeyen seçenekler

İstisna uygulanıyorsa kaynak dosyada yorum ekle:

```typescript
// DROPDOWN-POLICY: Hierarchical tree — client-side pagination intentional
```

---

## 7. Policy Compliance Örnekleri

### Uyumlu Örnek

```typescript
// ✅ Uyumlu — server-side search ile kullanıcı seçimi
export default function NewActionPage() {
  const [ownerQuery, setOwnerQuery] = useState('')
  const [ownerOptions, setOwnerOptions] = useState<SelectOption[]>([])
  const [ownerLoading, setOwnerLoading] = useState(false)

  useEffect(() => {
    if (ownerQuery.length < 2) { setOwnerOptions([]); return }
    const ctrl = new AbortController()
    setOwnerLoading(true)
    api.users.search({ q: ownerQuery, limit: 20 }, token, { signal: ctrl.signal })
      .then(res => setOwnerOptions(res.data.map(u => ({ value: u.id, label: u.fullName }))))
      .catch(() => {})
      .finally(() => setOwnerLoading(false))
    return () => ctrl.abort()
  }, [ownerQuery])

  return (
    <SearchableSelect
      options={ownerOptions}
      value={form.owner}
      onChange={v => setForm(p => ({ ...p, owner: v }))}
      onQueryChange={setOwnerQuery}
      loading={ownerLoading}
      placeholder="Sorumlu ara..."
    />
  )
}
```

### Uyumsuz Örnek

```typescript
// ❌ Uyumsuz — toplu yükleme, belgesiz, anti-pattern
useEffect(() => {
  api.users.list({}, token).then(res => setUsers(res.data)) // limit yok = 20 kayıt
}, [])

// ❌ Uyumsuz — limit:500 belgesiz
useEffect(() => {
  api.users.list({ limit: 500 }, token).then(res => setUsers(res.data))
  // DROPDOWN-POLICY-EXCEPTION yorumu yok
}, [])

return <select>{users.map(u => <option key={u.id}>{u.fullName}</option>)}</select>
// Native <select> API verisiyle kullanım da ihlal
```

---

## 8. Before / After Karşılaştırma (V1 → V2)

| Alan | V1 (Geçersiz) | V2 (Geçerli) |
| ---- | ------------- | ------------ |
| Ana kural | `limit: 500` zorunlu | Server-side `q` araması zorunlu |
| `limit: 500` | Zorunlu varsayılan | Yalnızca documented exception |
| Exception | Hiyerarşik ağaç, enum | Hiyerarşik + `DROPDOWN-POLICY-EXCEPTION` yorumlu bounded listeler |
| Debounce | Opsiyonel (Kural 4'te belirtilmiş) | Zorunlu, 250–400ms |
| Race-condition | Belirtilmemiş | Zorunlu (`AbortController` / `requestId`) |
| State standardı | Yok | Loading / empty / error zorunlu |

---

## 9. İlgili Dosyalar

* `apps/web/components/ui/SearchableSelect.tsx`
* `apps/web/components/ui/FilteredCheckboxList.tsx`
* `docs/AI_Governance/ARCHITECTURE_RULES.md`
