# BerkasSiap

**Siapkan lampiran sesuai persyaratan, tanpa bolak-balik mengecek satu per satu.**

BerkasSiap membantu menyusun PDF, JPG, dan PNG menjadi paket dokumen: tentukan apa yang diminta, tambahkan berkas, lalu periksa dan unduh hasilnya. Cocok untuk mencoba alur persiapan lamaran, pendaftaran, atau lampiran administrasi.

Status: prototipe `0.1.0` untuk uji terbatas. Kode dapat dijalankan secara lokal; layanan web publik belum tersedia. Hasil pengujian dicatat di [QA](docs/QA.md), bukan disimpulkan dari status build saja.

## Cara pakai

1. **Pilih kebutuhan.** Mulai dari contoh atau susun daftar sendiri. Sesuaikan format, batas ukuran, nama hasil, status wajib, dan batas halaman dengan persyaratan penerima.
2. **Tambahkan berkas.** Pilih PDF/JPG/PNG untuk setiap lampiran. Jika membutuhkan satu PDF, gabungkan berkas sesuai urutan yang Anda tentukan.
3. **Periksa dan unduh.** Baca masalah yang ditampilkan, lihat pratinjau, lalu unduh lampiran satu per satu atau sebagai ZIP dengan daftar pemeriksaan.

Contoh persyaratan hanya titik awal, **bukan ketentuan resmi** instansi, sekolah, perusahaan, atau portal tertentu. ZIP memudahkan penyimpanan dan pemindahan; penerima mungkin tetap meminta setiap berkas diunggah terpisah.

## Yang diperiksa

- Lampiran wajib yang belum diisi.
- Format berkas yang dapat dibaca, bukan hanya ekstensi namanya.
- Ukuran dan jumlah halaman hasil terhadap batas yang Anda masukkan.
- Nama hasil yang tidak valid atau bentrok dengan lampiran lain.
- Hasil ekspor yang sebenarnya, termasuk setelah penggabungan atau konversi gambar ke PDF.

Pemeriksaan ini bersifat teknis. BerkasSiap tidak menilai keaslian dokumen, kebenaran isi, kelayakan pendaftar, atau menjamin penerimaan.

## Privasi dan batasan

Pemrosesan dokumen berlangsung di browser. Aplikasi tidak memerlukan akun, kunci API, backend, analitik, atau CDN runtime eksternal. Berkas asli tidak ditimpa; unduhan dibuat sebagai salinan. Saat aplikasi disajikan melalui hosting, browser tetap meminta aset aplikasi kepada hosting tersebut.

**Unduh sebelum menutup atau memuat ulang halaman:** pekerjaan tidak disimpan permanen. BerkasSiap bukan pemindai malware; pemrosesan lokal tidak membuat semua PDF aman.

- Batas awal: 20 MB per berkas, 50 MB total sumber maupun hasil, 20 berkas, 100 halaman per hasil, dan 10 jenis lampiran. Batas tersebut bukan jaminan kapasitas semua perangkat.
- PDF terenkripsi atau berpassword tidak didukung.
- PDF dengan tanda tangan digital atau kolom tanda tangan yang terdeteksi ditolak, termasuk mode asli. Deteksi ini bukan validasi keaslian tanda tangan dan tidak menjamin menemukan semua variasi tanda tangan.
- PDF formulir interaktif/XFA tidak digabungkan agar isiannya tidak hilang. Satu PDF tanpa transformasi tetap disalin apa adanya.
- Mode format asli mempertahankan isi satu berkas; tidak menggabungkannya.
- Konversi JPEG/PNG mengikuti metadata orientasi EXIF 1–8, termasuk rotasi foto HP. Ini bukan koreksi otomatis foto yang memang diambil miring.
- Belum ada kompresi, OCR, pengiriman ke portal, arsip permanen, atau API AI.
- Jika ukuran hasil masih melebihi batas, aplikasi tidak boleh menandainya lulus. Siapkan berkas pengganti atau ubah batas hanya jika persyaratan penerima memang berbeda.

## Jalankan lokal

Gunakan Node.js 26 atau lebih baru dan npm. Tidak perlu `.env` atau kredensial.

```bash
cd berkassiap
npm install
npm run dev
```

Buka alamat lokal yang dicetak Vite di terminal. Jangan membuka `index.html` langsung melalui `file://`.

```bash
npm test
npm run smoke
npm run build
npm run preview
```

`build` menjalankan pemeriksaan TypeScript dan membuat aset statis di `dist/`. Sesudah lockfile tersedia, gunakan `npm ci` untuk instalasi yang dapat diulang. Petunjuk di atas untuk pengembangan lokal, bukan bukti deployment publik.

## Mengapa proyek ini dibuat?

Sebagian layanan meminta beberapa lampiran dengan batas format dan ukuran masing-masing. Usulan BerkasSiap adalah mengumpulkan persyaratan tersebut dalam satu alur dan memeriksa paket hasilnya. Manfaat dan kemudahan pemakaian masih perlu diuji bersama pengguna; popularitas, kebutuhan pasar yang luas, dan keunggulan terhadap editor PDF lain belum terbukti.

Lihat [arah produk dan dasar riset](docs/PRODUCT.md), [panduan kontribusi](CONTRIBUTING.md), dan [rencana serta bukti pengujian](docs/QA.md).

## Lisensi

Kode BerkasSiap memakai [MIT](LICENSE). Dependensi utama memiliki lisensi sendiri: [React — MIT](https://github.com/facebook/react/blob/main/LICENSE), [Vite — MIT](https://github.com/vitejs/vite/blob/main/LICENSE), [pdf-lib — MIT](https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md), [fflate — MIT](https://github.com/101arrowz/fflate/blob/master/LICENSE), dan [PDF.js — Apache-2.0](https://github.com/mozilla/pdf.js/blob/master/LICENSE). Pertahankan pemberitahuan lisensi yang diwajibkan saat mendistribusikan ulang dependensi atau hasil build.
