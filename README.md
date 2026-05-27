<p align="center">
  <img src="./logo.png" alt="Yamada API Core Logo" width="200"/>
</p>

# Yamada API Core
Website Demo: [www.yamadaverse.xyz](https://www.yamadaverse.xyz)

Yamada API Core adalah antarmuka pemrograman aplikasi (API) scraper all-in-one yang mendukung pengambilan data dari berbagai sumber platform hiburan populer seperti Otakudesu, Donghua (Anichin), Komiku, dan Anoboy. 

Sistem ini dirancang menggunakan Node.js dan Express, dengan penekanan pada performa, skalabilitas, serta stabilitas tinggi melalui penggunaan Cluster, In-Memory Caching, dan Rate Limiting.

---

## Daftar Isi
1. [Fitur Utama](#fitur-utama)
2. [Persyaratan Sistem](#persyaratan-sistem)
3. [Instalasi](#instalasi)
4. [Konfigurasi Lingkungan](#konfigurasi-lingkungan)
5. [Menjalankan Server](#menjalankan-server)
6. [Autentikasi](#autentikasi)
7. [Dokumentasi API](#dokumentasi-api)
8. [Pemecahan Masalah](#pemecahan-masalah)
9. [Kontribusi](#kontribusi)

---

## Fitur Utama

- **Multi-Source Scraping**: Menyediakan data terpadu dari Otakudesu, Donghua (Anichin), Komiku, dan Anoboy.
- **Skalabilitas Multi-Worker**: Terintegrasi dengan modul Cluster Node.js untuk mendistribusikan beban kerja di seluruh inti prosesor (CPU) server.
- **In-Memory Caching**: Cache pintar berkinerja tinggi guna mereduksi waktu respons dan mengurangi beban kueri ke sumber data asli.
- **Keamanan & Rate Limiting**: Dilindungi dengan header autentikasi `x-api-key` dan pembatasan beban (60 permintaan per menit/IP) untuk mencegah penyalahgunaan.
- **Proxy M3U8 Cerdas**: Menyertakan endpoint khusus guna meneruskan stream M3U8 sehingga terbebas dari restriksi Cross-Origin Resource Sharing (CORS).
- **Structured Logging**: Logging berbasis `pino` dengan request ID, level log, response-time, dan format JSON siap observability.
- **API Playground**: UI request tester bawaan (mirip Postman ringan) untuk mencoba endpoint scraper secara live.

---

## Persyaratan Sistem

- Node.js versi 18.x atau lebih baru.
- Akses ke command line / terminal.
- Disarankan menggunakan server dengan minimal 2 core CPU untuk memaksimalkan fungsionalitas Cluster.

---

## Instalasi

1. Clone repositori ini atau persiapkan direktori proyek pada komputer Anda.
2. Navigasikan ke dalam direktori root proyek.
3. Jalankan perintah instalasi dependensi berikut:

```bash
npm install
```

---

## Konfigurasi Lingkungan

Sistem menggunakan file environment untuk pengaturan. Buat file `.env` di direktori root (Anda dapat menyalin dari `.env.example` jika tersedia) dan atur konfigurasi berikut:

```ini
PORT=5000
NODE_ENV=development
API_KEYS=kunci_rahasia_sangat_panjang_sekali_12345
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:4321
CLUSTER_ENABLED=false
WORKERS=4
MAX_JSON_SIZE=100kb
TRUST_PROXY=1
LOG_LEVEL=debug
LOG_PRETTY=true
PLAYGROUND_ENABLED=false
```
---

Keterangan logging:
- `LOG_LEVEL`: level log (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).
- `LOG_PRETTY`: `true` untuk output terminal yang mudah dibaca saat development, `false` untuk JSON murni (direkomendasikan di production).
- `PLAYGROUND_ENABLED`: `true` untuk mengaktifkan UI playground di `/playground`, `false` untuk menonaktifkan total.

## Menjalankan Server

Terdapat beberapa opsi untuk menjalankan server tergantung lingkungan pengerjaan.

Untuk pengembangan lokal dengan dukungan live-reload (nodemon):
```bash
npm run dev
```

Untuk menjalankan secara normal:
```bash
npm start
```

Jika `PLAYGROUND_ENABLED=true`, buka:
```text
http://localhost:5000/playground
```

Jika server berhasil dijalankan, log terminal akan menampilkan:
```text
[2026-05-25 22:45:08.410] INFO: Server aktif {"service":"yamada-api-core","env":"development","pid":12345,"port":5000,...}
[2026-05-25 22:45:08.411] INFO: Snapshot memori proses {"memory":{"rssMb":102,"heapUsedMb":18,"heapTotalMb":30}}
```

---

## Autentikasi

Semua rute (endpoint) di dalam Yamada API Core memerlukan autentikasi tingkat header. Kegagalan menyertakan kunci yang valid akan menghasilkan status `401 Unauthorized`.

Pastikan klien yang mengonsumsi API ini menyisipkan header berikut:
- **Kunci**: `x-api-key`
- **Nilai**: Sesuai dengan konfigurasi `API_KEYS` di `.env`

Contoh permintaan menggunakan cURL:
```bash
curl -H "x-api-key: kunci_rahasia_sangat_panjang_sekali_12345" http://localhost:5000/anime/home
```

---

## Dokumentasi API

Base URL untuk seluruh endpoint adalah `http://localhost:5000` (atau sesuaikan dengan port pada `.env`).

### 1. Otakudesu (Anime Sub Indonesia)
Fokus pada rilis anime dengan subtitle bahasa Indonesia.
- `GET /anime/home` - Ikhtisar beranda (Sedang tayang & Tamat)
- `GET /anime/schedule` - Jadwal rilis anime
- `GET /anime/ongoing-anime?page=1` - Daftar anime yang sedang ditayangkan
- `GET /anime/complete-anime/:page` - Daftar anime yang sudah tamat
- `GET /anime/search/:keyword` - Pencarian anime
- `GET /anime/anime/:slug` - Detail informasi anime spesifik
- `GET /anime/episode/:slug` - Tautan stream dan data episode
- `GET /anime/genre` - Indeks genre
- `GET /anime/genre/:slug?page=1` - Daftar anime di bawah genre spesifik
- `GET /anime/unlimited` - Indeks alfabetis seluruh koleksi

### 2. Donghua (Anichin)
Animasi dari Tiongkok (Donghua).
- `GET /donghua/home/:page?` - Rilis donghua terbaru
- `GET /donghua/search/:keyword` - Fungsi pencarian
- `GET /donghua/detail/:slug` - Rangkuman informasi dan daftar episode
- `GET /donghua/episode/:slug` - Resolusi stream dan tautan episode

### 3. Komiku (Manga, Manhwa, Manhua)
Baca komik dan novel grafis asiatik.
- `GET /komiku/home` - Indeks komik terbaru dan populer
- `GET /komiku/manga/:slug` - Info detail komik dan indeks bab
- `GET /komiku/chapter/:slug` - Kumpulan panel gambar untuk satu bab
- `GET /komiku/search?q=keyword` - Pencarian koleksi
- `GET /komiku/pustaka` - Direktori lengkap dengan kapabilitas penyaringan
- `GET /komiku/daftar-genre` - Indeks genre global
- `GET /komiku/genre/:slug` - Katalog berdasarkan genre spesifik
- `GET /komiku/baca-manga`, `/komiku/baca-manhwa`, `/komiku/baca-manhua` - Filter komik tipe khusus

### 4. Anoboy (Anime Alternatif)
Katalog sumber sekunder untuk serial anime.
- `GET /anime/anoboy/home` - Koleksi pembaruan terakhir
- `GET /anime/anoboy/search/:keyword` - Fungsionalitas pencarian
- `GET /anime/anoboy/anime/:slug` - Detail dan indeks episode anime
- `GET /anime/anoboy/episode/:slug` - Tautan penyedia streaming tayangan

### 5. Pencarian Global
Agregator pencarian lintas sumber.
- `GET /search/:keyword` - Mencari secara bersamaan di Otakudesu, Anoboy, Donghua, dan Komiku

### 6. Proxy M3U8
Fasilitas reverse proxy untuk mem-bypass CORS pada pemutar video berbasis web.
- `GET /proxy/m3u8?url={URL_M3U8}&referer={ORIGINAL_REFERER}`

---

## Pemecahan Masalah

**1. Respons 401 Unauthorized**
- *Penyebab:* Header autentikasi salah eja, memiliki nilai tidak valid, atau tidak disertakan sama sekali.
- *Solusi:* Verifikasi keberadaan dan keabsahan `x-api-key` di bagian header request Anda terhadap nilai `API_KEYS` di `.env`.

**2. Respons 429 Too Many Requests**
- *Penyebab:* Klien Anda melebihi batas 60 request per menit.
- *Solusi:* Terapkan logika antrean request pada klien Anda atau gunakan sistem caching tambahan pada sisi klien.

**3. Respons 400 Bad Request**
- *Penyebab:* Format payload data JSON yang dikirim saat request tidak tepat (malformed JSON).
- *Solusi:* Evaluasi dan pastikan payload mematuhi standar JSON yang valid.

---

## Kontribusi

Yamada API Core selalu terbuka terhadap ulasan kode, peningkatan fungsionalitas, serta laporan *bug*.

Apabila Anda tertarik untuk berkontribusi, mohon ikuti alur standar pengembangan berikut:
1. Lakukan *forking* pada repositori ini.
2. Buat *branch* fitur Anda (contoh: `git checkout -b fitur-autentikasi-lanjutan`).
3. Tulis pesan *commit* yang komprehensif dan jelas (`git commit -m 'Memperbarui mekanisme autentikasi'`).
4. Unggah (*push*) perubahan menuju *branch* Anda di repositori *fork* (`git push origin fitur-autentikasi-lanjutan`).
5. Ajukan *Pull Request* baru dengan deskripsi rinci terhadap perubahan yang diimplementasikan.

---
