# Hasil pengujian 0.1.0

Tanggal: 2 November 2026. Node.js 26.8.1, npm 11.19.0, Chrome desktop melalui browser terhubung. Seluruh dokumen uji sintetis. Ini bukti prototipe lokal, bukan klaim siap produksi untuk semua perangkat.

## Pemeriksaan otomatis

```bash
npm ci
npm test
npm run smoke
npm run build
npm audit --omit=dev
```

| Pemeriksaan | Hasil aktual |
| --- | --- |
| Unit test | 39/39 lulus |
| TypeScript dan build | Lulus; build Vite tanpa peringatan ukuran chunk |
| Aturan dan kelengkapan | Kosong/wajib hilang, konfigurasi salah, ID duplikat, nama bentrok, dan nama terlalu panjang ditolak |
| Isi berkas | Ekstensi/MIME palsu, PDF terpotong/rusak, gambar terpotong atau dimensi berlebihan ditolak |
| Ukuran dan halaman | Batas sumber dan hasil diuji; gambar kecil yang menjadi PDF lebih besar tidak otomatis lulus |
| PDF khusus | Penanda enkripsi, struktur tanda tangan langsung/tidak langsung, AcroForm, dan XFA diuji |
| Enkripsi nyata | Tambahan fixture PDF AES-256 dibuat dengan pypdf; fungsi produksi menolak dengan pesan terenkripsi |
| PDF/foto | Penggabungan dan urutan halaman benar; EXIF JPEG/PNG 1–8 diuji matriks transform serta ukuran halaman |
| Integritas sumber | Satu PDF/mode asli byte-identik; JPEG di dalam PDF tetap identik tanpa re-encode lossy |
| Ekspor ZIP | Dibuka ulang; isi PDF, nama, ukuran, manifest, dan checklist cocok |
| Dependensi produksi | npm audit: 0 kerentanan yang dilaporkan saat pemeriksaan; bukan audit keamanan lengkap |

`npm run smoke` menghasilkan dua PDF sintetis dan ZIP di `output/`, lalu membuka ulang ZIP/PDF. Folder ini diabaikan Git. PDF contoh dirender dengan Poppler dan teks diekstrak; judul, isi, serta label simulasi terlihat tanpa terpotong. Contact sheet delapan orientasi EXIF diperiksa visual.

Review independen menemukan dua masalah sebelum finalisasi: orientasi EXIF hilang dan isian XFA dapat hilang ketika digabung. Keduanya diperbaiki serta memiliki regression test. Penggabungan XFA sekarang ditolak; EXIF diterapkan lewat transform PDF.

## Pemeriksaan browser

| Alur | Hasil aktual |
| --- | --- |
| Contoh → periksa → pratinjau | Lulus pada build produksi lokal; PDF benar-benar ter-render di canvas |
| Unduh ZIP | Unduhan browser ditemukan di folder unduhan; dibuka ulang lewat fflate dan pdf-lib, dua PDF masing-masing satu halaman dan manifest sesuai |
| Ubah aturan | Mengubah nama hasil langsung menghapus status siap dan tombol ZIP lama |
| Nama bentrok | Membuat dua nama sama menghasilkan pesan kesalahan; ZIP tidak tersedia |
| Kebutuhan kosong | Paket sendiri tanpa dokumen tidak lulus dan menjelaskan berkas wajib yang kurang |
| Konfirmasi penggantian | Dialog aplikasi: Batal mempertahankan berkas/hasil; Lanjut mengganti paket. Tidak lagi memakai window.confirm |
| Keyboard | Escape menutup pratinjau; fokus awal dialog berada pada tombol tutup/batal. Belum uji screen reader lengkap |
| Muat ulang | Data sesi hilang sesuai pemberitahuan; tidak ada penyimpanan dokumen permanen |
| Responsif | Ukuran diminta 320, 390, 768, dan desktop 1920 px; lebar konten terukur 305, 375, 753, dan 1905 px akibat scrollbar. Tidak ada scroll horizontal setelah koreksi min-width |
| Teks 200% | Fixture sementara mengatur root 32px, bukan mengubah pengaturan pengguna. Alur contoh/periksa dapat dioperasikan; tidak ada overflow halaman pada lebar konten 1265/1905 px |
| Kontras | Teks muted 5.1056:1, tombol utama 7.8501:1, teks ringkasan 5.3099:1, error 6.5962:1. Border input yang semula 2.9958:1 diperkuat; fokus utama 3.9121:1 |
| Console | Tidak ada error/warning pada alur contoh dan pratinjau yang diperiksa |

Tangkapan layar lokal: `output/screenshots/desktop.jpg`, `mobile.jpg`, `preview.jpg`. Screenshot tidak berisi dokumen pribadi. Lebar viewport simulasi bukan bukti uji perangkat fisik.

## Batas cakupan yang belum diuji

- Pemilihan file OS melalui otomasi browser terhalang izin file URL ekstensi Chrome. Izin pengguna tidak diubah. Jalur demo menggunakan fungsi produksi dan validasi berkas diuji otomatis, tetapi interaksi pemilih file OS dan drag/drop belum diverifikasi end-to-end.
- Unduhan per berkas memakai helper unduh yang sama; unduhan browser yang dibuka ulang pada uji ini adalah ZIP.
- Belum uji Safari/Firefox, HP fisik, screen reader lengkap, perangkat RAM kecil, atau beban maksimum 50 MB.
- Kode aplikasi tidak memiliki jalur upload/analitik/penyimpanan permanen; worker PDF dibundel lokal. Belum ada rekaman paket jaringan menyeluruh untuk semua variasi PDF.
- Belum uji lima pengguna, keaslian tanda tangan digital, pemeriksaan malware, audit keamanan lengkap, atau deployment publik.

## Biaya muat awal

JavaScript awal sekitar 245.4 kB (76.6 kB gzip). Mesin dokumen sekitar 444.0 kB dimuat saat diperlukan; PDF.js dan worker dimuat ketika membuka pratinjau. Ini ukuran hasil build, bukan pengukuran kecepatan pada jaringan HP.
