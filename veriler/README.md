# veriler/ — SCADA Data Snapshots Directory

Bu dizin, Metnex platformunun yalnızca **geliştirme ve test (development/test)** ortamlarında SCADA analiz, grafik, tablo ve export ekranlarını gerçek dünya verileriyle doğrulaması için kullanılan SCADA CSV snapshot dosyalarını barındırır.

## Dizilim ve Gizlilik Sözleşmesi

```text
veriler/
├── raw/                      # Gerçek CSV snapshot dosyaları (Git kapsamı DIŞINDA)
│   ├── endeksler.csv
│   ├── gt_endeksler.csv
│   ├── komur_endeksler.csv
│   └── sg_endeksler.csv
├── normalized/               # Geliştirme zamanı normalize edilmiş veri önbelleği (Git dışı)
├── manifest/                 # Güvenli manifest sözleşmesi (Git kapsamında)
│   └── scada-fixtures.manifest.json
└── README.md
```

> **ÖNEMLİ GÜVENLİK VE UYGULAMA POLİTİKASI:**
> 1. `raw/` ve `normalized/` klasörleri asla Git'e eklenmez (`.gitignore`).
> 2. Bu veriler yalnızca `NODE_ENV=development` ve `REPORTING_DEV_FIXTURES=true` ortam değişkenleri aktifken çalışır.
> 3. Production ortamında, staging ve CI/CD pipeline'larında bu provider kesinlikle devreye girmez ve dosyaları okumaz.
> 4. Fiziksel kaynak adları (örn. `MOSEDAS`) tenant anlamına gelmez; `MOSEDAS` tenant olarak oluşturulmaz.
> 5. Fixture verisi hiçbir koşulda production yetkilendirme veya SQL Server adapter portu üzerinden sunulmaz.
