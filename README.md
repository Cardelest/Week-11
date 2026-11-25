# Haftanın 11'i

Süper Lig haftanın 11'ini tahmin oyunu. Kullanıcılar 4-4-2 kadro ve kaptan seçer; Veri 11'ine ve Taraftar 11'ine giren her oyuncu 1 puan, kaptan tutarsa 2 puan.

## Dosyalar
- `index.html`, `style.css`, `app.js` — uygulamanın kendisi (derleme gerekmez)
- `supabase/01_schema.sql` — tablolar, güvenlik kuralları, puan hesapları
- `supabase/02_players.sql` — 18 takım, 524 oyuncu

## Kurulum (bir kez)
1. Supabase > SQL Editor > New query: `01_schema.sql` içeriğini yapıştır, Run.
2. Aynı şekilde `02_players.sql` içeriğini yapıştır, Run.
3. Supabase > Authentication > Sign In / Providers: **Allow anonymous sign-ins** aç.
4. Uygulamayı yayına al (Vercel: GitHub ile giriş > Import > bu depo > Deploy).
5. Uygulamada kullanıcı adını aç, sonra Supabase > Table Editor > `profiles` tablosunda kendi satırında `is_admin` = true yap. Uygulamada "Yönetim" sekmesi açılır.

## Her hafta
- Yönetim > Hafta aç: hafta numarası ve ilk maçın saati (tahminler o an kilitlenir).
- Hafta bitince Yönetim > Haftanın 11'ini gir: Veri 11'i ve Taraftar 11'i ayrı ayrı. Puanlar ve sıralama kendiliğinden güncellenir.

## Kurallar (veritabanında zorunlu)
- Kapanıştan sonra kadro değiştirilemez.
- Başka kullanıcıların kadroları ve "çoğunluk ne dedi" sadece kapanıştan sonra görünür.
- Kullanıcılar kendilerini yönetici yapamaz.
