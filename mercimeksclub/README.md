# Mercimek’s Club · Vercel kurulum rehberi

Bu rehber, ZIP’teki siteyi GitHub ve Neon PostgreSQL kullanarak `mercimeksclub.vercel.app` adresinde yayımlamak içindir. İlk kurulumda ürün listesi boştur. Ürünleri `/admin` sayfasından ekleyebilirsiniz.

## 1. Dosyaları hazırlayın

1. ZIP’i çıkarın. Açılan `mercimeksclub` klasöründe `package.json`, `vercel.json`, `schema.sql`, `api/` ve `public/` dosyalarını görmelisiniz.
2. GitHub’da boş, tercihen özel bir depo oluşturun. Klasörün **içeriğini** deponun köküne yükleyin. Kök dizinde `vercel.json` görünmeli. `.gitignore` ve `.env.example` dosyalarını da dahil edin.
3. Bu paketi önceki sürümün üzerine kopyalıyorsanız, eski sürümden kalan `api-support/workbook.js`, `scripts/setup.js`, `public/mark.svg` ve `public/illustration.svg` dosyalarını depodan kaldırın. Mevcut veritabanınızı kullanabilirsiniz.

## 2. PostgreSQL veritabanını hazırlayın

1. [Neon konsolunda](https://console.neon.tech/) kampanya için bir proje oluşturun veya kampanyanın mevcut PostgreSQL veritabanını seçin.
2. Projedeki **SQL Editor** ekranında doğru dalı ve veritabanını seçin. Paketteki `schema.sql` dosyasının tamamını yapıştırıp **Run** düğmesine basın. Tablolar zaten varsa bu dosya mevcut kayıtları korur. [Neon SQL Editor](https://neon.com/docs/get-started/query-with-neon-sql-editor)
3. **Connect** ekranında aynı dalı ve veritabanını seçin. **Connection pooling** açıkken `postgresql://` ile başlayan bağlantı dizesini kopyalayın. Komutun tamamı yerine yalnızca bağlantı dizesini alın ve TLS parametrelerini koruyun. Bu değer `DATABASE_URL` olarak kullanılacak. [Neon bağlantı havuzu](https://neon.com/docs/connect/connection-pooling)

## 3. Yönetici parolasını oluşturun

Bilgisayarınızda Node.js 22 veya 24 ile, ZIP’ten çıkan `mercimeksclub` klasöründe PowerShell açıp şu komutu çalıştırın. Bu adım için npm kurulumu gerekmez.

```powershell
node scripts/password.js
```

Çıktıdaki **yönetici parolasını** parola yöneticinize kaydedin. `/admin` sayfasına bu parolayı yazacaksınız. `ADMIN_PASSWORD_HASH` ve `DEVICE_SECRET` satırlarındaki değerleri Vercel için ayrı ayrı kopyalayın. Parolayı, bağlantı dizesini ve gizli anahtarı GitHub’a yüklemeyin.

Mevcut siteyi güncelliyorsanız Vercel’deki `ADMIN_PASSWORD_HASH` ve `DEVICE_SECRET` değerlerini koruyabilirsiniz. `DEVICE_SECRET` değişirse eski tarayıcı kimlikleriyle eşleştirme kesilir.

## 4. Vercel’e aktarın

1. Vercel’de **Add New → Project** seçin ve GitHub deponuzu **Import** ile açın. Adres zaten hesabınızdaki bir projeye bağlıysa o projeyi kullanın ve güncellenen kodu bağlı depoya yükleyin. [Vercel Git dağıtımı](https://vercel.com/docs/git)
2. **Project Name** alanına `mercimeksclub` yazın. **Root Directory** olarak `vercel.json` dosyasının bulunduğu klasörü seçin. **Framework Preset** alanında **Other** seçili olsun. Proje dosyası, ayrı derleme olmadan `public/` klasörünü sunacak şekilde ayarlıdır. **Install Command** varsayılan kalsın. [Vercel derleme ayarları](https://vercel.com/docs/builds/configure-a-build)
3. İçe aktarma ekranındaki **Environment Variables** bölümüne aşağıdaki değerleri girin. Mevcut bir projede bu bölüm **Settings → Environment Variables** altındadır. Değerleri **Production** ortamına ekleyin. [Vercel ortam değişkenleri](https://vercel.com/docs/environment-variables)

| Ad | Girilecek değer |
| --- | --- |
| `DATABASE_URL` | Neon’dan kopyaladığınız bağlantı dizesi |
| `APP_ORIGIN` | `https://mercimeksclub.vercel.app` · sonda `/` olmadan |
| `ADMIN_PASSWORD_HASH` | Komutun ürettiği parola özeti |
| `DEVICE_SECRET` | Komutun ürettiği 64 karakterlik gizli anahtar |
| `PRIVACY_CONTACT` | Formda görüntülenecek kampanya iletişim adresi |

4. **Deploy** düğmesine basın. Mevcut projede ortam değişkenlerini sonradan düzenlediyseniz **Deployments** ekranından üretim sürümünü yeniden dağıtın. Değişkenler yeni dağıtımda devreye girer. [Vercel ortam değişkenleri](https://vercel.com/docs/environment-variables)
5. Projenin **Domains** ekranında üretim adresini doğrulayın. Vercel farklı bir adres verdiyse `APP_ORIGIN` değerine ziyaretçilerin kullanacağı kesin adresi yazıp yeniden dağıtın. [Vercel proje ayarları](https://vercel.com/docs/project-configuration/project-settings)

## 5. Açılışı doğrulayın

1. Üretim adresini gizli pencerede açın. Ana sayfa bir Vercel hesabı istemeden açılmalı. Giriş ekranı çıkarsa **Settings → Deployment Protection** bölümünde korumanın üretim adresine de uygulanıp uygulanmadığını kontrol edin. [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
2. Aynı adresin sonuna `/admin` ekleyip oluşturduğunuz **parolayla** girin. Ürün adı, açıklama, HTTPS alışveriş bağlantısı ve hedef adedi girin. Ana sayfayı yenileyip ürünün göründüğünü kontrol edin.
3. Uçtan uca test için ayrı bir deneme veritabanı kullanın. Formu gönderince hedef çubuğu ilerlemeli, yönetim tablosunda zaman damgalı satır görünmeli ve **Excel’i indir** düğmesi `.xlsx` dosyası vermeli.

**Form “İstek kaynağı doğrulanamadı” diyorsa** Vercel’in dağıtıma özel adresi yerine `APP_ORIGIN` ile aynı üretim adresini açın. **Liste yüklenmiyorsa** `DATABASE_URL` değerini ve `schema.sql` dosyasının bağlantı dizesindeki veritabanında çalıştırıldığını kontrol edin.

## Dosyalar ve yerel çalıştırma

- `public/` ziyaretçi sayfasını, yönetim ekranını, stilleri ve iki kulüp görselini içerir.
- `api/campaign.js` ürün, bildirim, oturum ve Excel işlemlerini içerir.
- `schema.sql` PostgreSQL tablolarını kurar. `scripts/` klasöründe yerel çalıştırma ve parola üretme komutları bulunur.

Yerelde çalıştırmak için `npm ci` çalıştırın. `.env.example` dosyasını `.env` adıyla kopyalayın. Ayrı bir test veritabanının bilgilerini, ürettiğiniz gizli değerleri ve `APP_ORIGIN=http://localhost:3000` ayarını girin. Tabloları ikinci adımdaki gibi oluşturup şu komutu çalıştırın.

```powershell
node --env-file=.env scripts/dev.js
```

Ardından tarayıcıda `http://localhost:3000` adresini açın. `public/index.html` dosyasına çift tıklamak yalnızca sayfanın görünümünü açar. Ürün listesi, formlar ve yönetim paneli için sunucu ve veritabanı gerekir.

İlerleme kullanıcı bildirimlerine göre hesaplanır. Aynı tarayıcı profili, siteye özel 180 günlük çerez üzerinden eşleştirilir. Gerçek bildirimleri toplamadan önce formdaki iletişim ve aydınlatma bilgilerini kampanya için tamamlayın, kayıtların saklama süresini belirleyin. Bu sürümde bildirimler otomatik silinmez.
