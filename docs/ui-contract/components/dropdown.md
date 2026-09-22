# metnex — Dropdown / Dynamic Loading Contract

Bu dosya, skeleton’daki dropdown davranışını UI açısından bağlar.
Policy detayı:

- `docs/AI_Governance/DROPDOWN_DYNAMIC_LOADING_POLICY.md`

---

## Ana Kural

Dropdown seçimi üçe ayrılır:

1. küçük sabit enum
2. orta sabit liste
3. dinamik büyüyebilir veri

Karar:

- dinamik büyüyebilir veri için server-side arama varsayılandır
- belgesiz toplu yükleme kabul edilmez

---

## Dense Toolbar ve Form Kullanımı

Dropdown’lar dense yüzeyde:

- çevredeki input yüksekliğiyle uyumlu olmalı
- toolbar’ı dikeyde şişirmemeli
- loading / empty / error durumlarını açıkça göstermeli

---

## Dinamik Arama Kuralları

- debounce
- minimum karakter
- sonuç limiti
- race-condition koruması

Kural:

- kullanıcıya “henüz arama başlamadı”, “aranıyor”, “sonuç yok”, “hata” ayrımı açık gösterilir

---

## İstisna Kuralı

Toplu yükleme ancak küçük ve büyümeyecek veri setinde açıklamalı kullanılabilir.

Kural:

- bu istisna kod ve delivery notunda belgelenir

---

## Yasaklar

- dinamik API listesini plain static select gibi kullanmak
- dense toolbar’da aşırı geniş combobox açmak
- loading/hata/sonuç yok durumunu gizlemek
