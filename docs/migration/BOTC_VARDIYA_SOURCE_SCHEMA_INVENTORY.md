# BOTC Vardiya / Arşiv Vardiya — Kaynak Şema Envanteri

> **Durum: Discovery/şema envanteri dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-21-vardiya-srs-ve-migration-mapping.md` (id: `TASK-027.21`,
> EPIC-004, Wave 4, bağımlılık: TASK-027.1/2/3/4/5/10/20 — hepsi done). Bu belge
> `BOTC_SOURCE_SCHEMA_INVENTORY.md`'nin (BOT_APP kimlik şeması) aynı metodolojisini Vardiya/Arşiv
> Vardiya kaynaklarına uygular — **yeniden üretmez**, tamamlar. Wave 2 (Bakım/Arıza) ve Wave 3
> (DÖF) bu belgede hiç ele alınmamıştır (D-007 ile tutarlı).

**Tarih:** 2026-09-18
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak Doğrulama İlkesi (bu belge boyunca geçerli)

Her bulgu `[KOD]` (C# kaynak dosyasından doğrudan okundu) veya `[DOĞRULANAMADI]` (kod dışı bir
kanıt gerektirir — örn. gerçek SQL Server şeması, canlı veri) olarak etiketlenmiştir. `../BOTC`
içindeki ilgili dosyalar doğrudan, satır satır okunarak incelendi; hiçbir alan/davranış
varsayılmadı. Gerçek secret/parola/connection string/kullanıcı verisi bu belgeye yazılmamıştır.

---

## 1. Kaynak Dosyalar (tam liste, `grep -rln "VardiyaRaporuBase\|ArsivVardiyaRaporuBase"` ile doğrulandı)

| Katman | Dosya |
|---|---|
| Domain (temel sınıflar) | `BOT.Domain/VardiyaRaporuBase.cs`, `BOT.Domain/ArsivVardiyaRaporuBase.cs` |
| Domain (somut entity'ler) | `BOT.Domain/{VardiyaMuhendisiRapor,MosbEnerjiRapor,MosbioRapor,KomurKazaniRapor,MosbioKirimDepoRapor}.cs` (canlı) + `BOT.Domain/Arsiv{VardiyaMuhendisiRapor,MosbEnerjiRapor,MosbioRapor,KomurKazaniRapor,MosbioKirimDepoRapor}.cs` (arşiv) |
| Domain (liste DTO'ları) | `BOT.Domain/VardiyaRaporListRow.cs`, `BOT.Domain/ArsivVardiyaRaporListRow.cs` (**tablo değil**, yalnızca DataGrid DTO'su) |
| Data (DbContext) | `BOT.Data/VardiyaDbContext.cs`, `BOT.Data/ArsivVardiyaDbContext.cs` (+ `VardiyaDbContextFactory.cs`/`ArsivVardiyaDbContextFactory.cs`, yalnızca bağlantı fabrikası, şema bilgisi taşımıyor) |
| Servis | `BOT.Services/VardiyaService.cs`, `BOT.Services/ArsivVardiyaService.cs`, `BOT.Services/Interfaces/{IVardiyaService,IArsivVardiyaService}.cs` |
| UI (yalnızca yetki/lifecycle kanıtı için okundu) | `BOT/{VardiyaMenuWindow,VardiyaKayitWindow,VardiyaListWindow,VardiyaDetayWindow}.xaml.cs` + `Arsiv` karşılıkları |

---

## 2. Kritik Bulgu — Hiçbir EF Core Migration Geçmişi Yok

`BOT.Data/Migrations/` dizininde yalnızca 4 migration dosyası + 1 snapshot vardır
(`20251020143559_InitialCreate`, `20251022_AddTickets`, `20251024083250_AddExtraNoteAudit`,
`20251024085243_Sync_ExtraNoteAudit`, `BotDbContextModelSnapshot.cs`) — **hepsi yalnızca
`BotDbContext`'e** (BOT_APP/kimlik şeması) aittir. `VardiyaDbContext` ve `ArsivVardiyaDbContext`
için **tek bir migration dosyası bile yok** (`find . -iname "*Vardiya*Migration*"` → 0 sonuç).

**Sonuç:** Vardiya ve Arşiv Vardiya'nın 5 fiziksel tablosu (`vardiyamuhendisi`, `mosbenerji`,
`mosbio`, `komurkazani`, `mosbiokirimdepo`) EF Core migration sistemi **dışında** oluşturulmuş
olmalı (elle DDL veya `EnsureCreated()`). Bu, TASK-027.2'de BOT_APP için tespit edilen
"kod/migration sapması" bulgusunun Vardiya modülünde **daha da uç bir hâlidir** — burada
karşılaştırılacak bir migration bile yok, **her şey `[KOD]`'dur**. Kolon tipleri/hassasiyeti/
index'ler yalnızca C# Data Annotation'larından çıkarılabilir; gerçek SQL Server şeması
`[DOĞRULANAMADI]` (bu ortamdan erişim yok).

---

## 3. Ortak Temel Sınıflar

### 3.1 `VardiyaRaporuBase` (canlı, `[KOD]`)

| Kolon | Tip | Nullable | Not |
|---|---|---|---|
| `Id` | `int`, Identity | Hayır (PK) | `[Key]` + `[DatabaseGenerated(Identity)]` |
| `Vardiya` | `string`, `[MaxLength(1)]` | Hayır | **Tek karakter** — muhtemelen vardiya kodu (örn. "A"/"B"/"C"), `[DOĞRULANAMADI]` kesin değer kümesi |
| `OperatorBotUserId` | `int` | Hayır | BOT_APP `Users.Id`'ye **mantıksal** referans — **gerçek bir FK constraint değil** (ayrı veritabanı, cross-database) |
| `OperatorTamAdi` | `string`, `[MaxLength(150)]` | Hayır | Kayıt anında **denormalize edilmiş** kullanıcı adı anlık görüntüsü |
| `Operator2TamAdi` | `string`, `[MaxLength(150)]` | Evet | Serbest metin — **gerçek bir kullanıcıya FK değil**, yalnızca isim |
| `KayitTarihi` | `DateTime` | Hayır | Sisteme giriş zamanı (`DateTime.Now`, sunucu saat dilimi — `[DOĞRULANAMADI]` hangi saat dilimi) |
| `RaporNotlari` | `string?` | Evet | Serbest metin |
| `IsCompleted` | `bool`, varsayılan `false` | Hayır | `false` = Taslak (düzenlenebilir), `true` = Tamamlandı (bkz. §5) |

### 3.2 `ArsivVardiyaRaporuBase` (arşiv, `[KOD]`)

Aynı alanlar, **iki fark**: `Vardiya` burada `[MaxLength(50)]` (canlıdaki 1 karakterden **daha
gevşek** — kod yorumunda "Hata yapmasın diye 50 yapmıştık" notu var, `[DOĞRULANAMADI]` neden
farklı), ve **`IsCompleted` alanı yok** (kod yorumu: "IsCompleted buradaydı, TAMAMEN SİLDİK!").
Ayrıca yeni bir zorunlu alan var: `DefterTarihi` (`DateTime`, `Required`) — **defterdeki (kağıt
logbook) tarih**, `KayitTarihi`'nden (sisteme giriş tarihi) **ayrı ve bağımsız**.

---

## 4. Somut Entity'ler — Lokasyon → Tablo Eşlemesi (5 lokasyon, `[KOD]`)

| Lokasyon (`Sirket`/UI string) | Canlı entity | Arşiv entity | Fiziksel tablo (`[Table(...)]`, her iki DbContext'te de aynı ad) |
|---|---|---|---|
| `MOSBİO` | `MosbioRapor` | `ArsivMosbioRapor` | `mosbio` |
| `MOSB ENERJİ` | `MosbEnerjiRapor` | `ArsivMosbEnerjiRapor` | `mosbenerji` |
| `KÖMÜR KAZANI` | `KomurKazaniRapor` | `ArsivKomurKazaniRapor` | `komurkazani` |
| `MOSBİO KIRIM DEPO` | `MosbioKirimDepoRapor` | `ArsivMosbioKirimDepoRapor` | `mosbiokirimdepo` |
| `SANTRAL` | `VardiyaMuhendisiRapor` | `ArsivVardiyaMuhendisiRapor` | `vardiyamuhendisi` |

Tüm 5 entity, ilgili temel sınıftan **hiçbir ek alan eklemeden** türetilir (`{ }` boş gövde) — bu
5 "tablo" aslında **birebir aynı kolon şemasına** sahiptir, yalnızca fiziksel tablo adıyla ayrışır.
`VardiyaService.cs`/`ArsivVardiyaService.cs`'teki `switch (lokasyon)` blokları bu eşlemeyi
**doğrudan kanıtlar** (`VardiyaService.cs:34-83`, `ArsivVardiyaService.cs:27-73`).

**Kritik gözlem — `MOSEDAŞ` bu 5 lokasyonun hiçbirinde yok:** Vardiya modülünün kod tabanında
`MOSEDAŞ` adına **hiçbir referans bulunamadı** (`grep -rn "MOSEDA" BOT.Domain BOT.Services BOT`
sonuçsuz). Görev talimatının §4 listesindeki MOSEDAŞ, Vardiya modülünün **kapsamına
girmiyor** — bu bir eksiklik değil, kaynak kodun gerçek durumudur.

**Kritik gözlem — `GT/SG fiziksel kaynakları` Vardiya raporu değil:** Görev talimatının §4
listesindeki "GT/SG fiziksel kaynakları", `BOTC_ENTITY_DOMAIN_MAPPING.md`/`BOTC_SCADA_DMS_SOURCE_MAPPING.md`'de
zaten belgelenen SCADA endeks tabloları (`GtEndeks`/`SgEndeks`, Wave 5 kapsamı) ile aynı kavramdır
— Vardiya modülünün **kendi entity'si değildir**, bu belgede yeniden ele alınmamıştır (karıştırma
riski açıkça not edilmiştir).

---

## 5. Yaşam Döngüsü — Kod Kanıtı (uydurma yok)

### 5.1 Canlı (`VardiyaRaporuBase.IsCompleted`)

| Durum | `IsCompleted` | UI etiketi (`VardiyaDetayWindow.xaml.cs:149`) | Davranış |
|---|---|---|---|
| Taslak | `false` | "TASLAK" | `VardiyaListWindow.xaml.cs:122`: yalnızca `!IsCompleted` olan kayıtlar düzenleme penceresinde açılabiliyor (**UI-seviyesi** kapı) |
| Tamamlandı | `true` | "ONAYLANDI" | Onay diyaloğu metni ("Bu işlemden sonra rapor üzerinde değişiklik yapılamaz") **yalnızca bir kullanıcı uyarısıdır** |

**Kritik güvenlik bulgusu:** `VardiyaService.SaveReportAsync` (`VardiyaService.cs:25-113`),
`existingId` verildiğinde entity'yi **`IsCompleted` durumuna hiç bakmadan** güncelliyor — yani
"tamamlanmış rapor değiştirilemez" kuralı **yalnızca `VardiyaListWindow`'un UI'da düzenleme
penceresini açmamasıyla** uygulanıyor, **servis/veri katmanında hiçbir sunucu-taraflı kilit
yok**. Bu, Discovery'nin daha önce tespit ettiği "UI kontrol eder, servis katmanı doğrulamaz"
deseniyle (`BOTC_ENTITY_DOMAIN_MAPPING.md` §1.2) tutarlıdır — burada Vardiya modülüne özgü somut
bir örnek olarak kanıtlanmıştır.

### 5.2 Arşiv (`ArsivVardiyaRaporuBase`)

`IArsivVardiyaService`'in yalnızca `SaveArchiveReportAsync` (ekleme), `GetArchiveReportListAsync`
ve `GetArchiveReportByIdAsync` metotları var — **güncelleme veya silme metodu kod tabanında hiç
yok**. Arşiv kayıtları, oluşturulduktan sonra **kod düzeyinde immutable/append-only**'dir (bir
kısıt olarak değil, basitçe bir düzenleme/silme yolunun **hiç var olmamasından** dolayı).

### 5.3 Kaynakta Karşılığı Olmayan Durumlar

`LOCKED`, `ARCHIVED` (ayrı bir durum alanı olarak), `FAILED` — bu üç durumun **hiçbiri** BOTC
kodunda bir alan/enum/sabit olarak **bulunamadı**. "ARCHIVED" kavramsal olarak ayrı bir **fiziksel
veritabanına taşınma** anlamına gelir (`ArsivVardiyaDbContext`), bir durum alanı değildir.
`LOCKED`/`FAILED` **hiç yoktur** — bu belge bunları **uydurmaz**; hedef modelde önerilirse §8'de
"hedef model önerisi" olarak açıkça ayrılacaktır (görev talimatı §5).

---

## 6. Email Dağıtımı — Kod Kanıtı

`VardiyaService.SendEmailNotification` (`VardiyaService.cs:273-297`), yalnızca
`SaveReportAsync`'in `isCompleted: true` dalından çağrılır (`VardiyaService.cs:102-112`) —
**taslak kaydetmede asla tetiklenmez**. Alıcı listesi **statik değildir**: her gönderimde
`IUserService.GetEmailsByPermissionAsync("CanReceiveShiftReportEmail")` ile **o anda** bu
permission'a sahip aktif kullanıcılar sorgulanır. Gönderim hatası `catch (Exception) { /*
Loglama yapılabilir */ }` ile **sessizce yutulur** — yorum satırı loglamanın **henüz
implement edilmediğini** açıkça belirtiyor. `ArsivVardiyaService.SaveArchiveReportAsync`
**hiçbir email göndermez** (kod yorumu: "Arşiv kayıtları için e-posta bildirimi gönderilmez").

---

## 7. Permission Kanıtı

| BOTC permission adı | Kod konumu | Gerçek etkisi |
|---|---|---|
| `CanManageShifts` | `VardiyaMenuWindow.xaml.cs:23`, `MainWindow.xaml.cs:136` | Hem canlı **hem arşiv** "kayıt girme" menü butonlarını (`btnVardiyaKayit` + `btnArsivKayit`) birlikte gösterir — **ayrı bir arşiv-yazma permission'ı yok** |
| `CanViewShiftReports` | `VardiyaMenuWindow.xaml.cs:30`, `MainWindow.xaml.cs:136` | Hem canlı **hem arşiv** "liste" menü butonlarını (`btnVardiyaListesi` + `btnArsivListesi`) birlikte gösterir — **ayrı bir arşiv-okuma permission'ı yok** |
| `CanReceiveShiftReportEmail` | `VardiyaService.cs:276` | UI menü/erişim kapısı **değildir** — yalnızca email alıcı listesi filtresi (§6) |

Üçü de **yalnızca UI-seviyesi** (`_authz.Can(...)`, `IAuthorizationService`) kontrol edilir;
`VardiyaService`/`ArsivVardiyaService`'in kendisinde **hiçbir permission kontrolü yoktur** — bu,
§5.1'deki "UI kontrol eder, servis katmanı doğrulamaz" bulgusuyla aynı desendir.

---

## 8. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 9. Kalan Riskler / Sonraki Bağımlılık

- Gerçek SQL Server şeması (kolon tipleri/index'ler/constraint'ler) `[DOĞRULANAMADI]` — migration
  geçmişi olmadığı için yalnızca C# Data Annotation'larından çıkarım yapılabildi.
- `Vardiya` kolonunun gerçek değer kümesi (`[MaxLength(1)]`) `[DOĞRULANAMADI]` — kod içinde sabit
  bir enum/liste bulunamadı, yalnızca UI ComboBox'ının içeriği (bu belgede incelenmedi, ayrı bir
  doğrulama gerektirir).
- `KayitTarihi`/`DefterTarihi` saat dilimi bilgisi `[DOĞRULANAMADI]` (`DateTime.Now`, sunucu yerel
  saati — UTC dönüşümü kod içinde yok).
- Gerçek secret/parola/connection string/kullanıcı verisi hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

---

## 10. TASK-027.22 Ek Notları (2026-09-18)

Bu belgenin kaynak bulguları **değişmedi**; TASK-027.22 yalnızca ek doğrulama boşluklarını kaydeder:

- Talimatın "performans alanları" ifadesine karşılık gelen **hiçbir alan** `VardiyaRaporuBase`,
  `ArsivVardiyaRaporuBase` veya 5 somut sınıfta yoktur (Q-V13). Gerçek SQL Server DDL'inde ek kolon
  olup olmadığı migration olmadığından `[DOĞRULANAMADI]`.
- Arşivdeki kayıtların canlıdan **silinerek mi kopyalanarak mı** taşındığı kaynak kodda
  doğrulanmadı (mantıksal duplicate riski, Q-V06).
- Kolon kolon hedef mapping ve kanıt: `BOTC_VARDIYA_DOMAIN_MODEL_DECISION_PACKAGE.md` §3.
