# Kontribusi

Bantu satu alur utama menjadi lebih baik: **persyaratan → berkas → pemeriksaan → unduhan**. Prioritaskan perbaikan yang mengurangi kesalahan pengguna atau membuat langkahnya lebih mudah dipahami.

## Sebelum mengubah

- Jelaskan masalah, contoh langkah, hasil yang diharapkan, dan browser yang digunakan.
- Gunakan dokumen sintetis. Jangan masukkan KTP, alamat, nomor rekening, dokumen klien, kredensial, atau data pribadi ke issue, tangkapan layar, fixture, dan commit.
- Untuk fitur besar, diskusikan manfaatnya terlebih dahulu. Akun, penyimpanan server, OCR, kompresi, dan integrasi portal berada di luar versi awal.

## Menyiapkan perubahan

```bash
npm ci
npm run dev
npm test
npm run build
```

Jika bekerja pada checkout baru yang belum memiliki lockfile, jalankan `npm install` terlebih dahulu. Sertakan pengujian untuk logika baru dan kasus gagal yang relevan. Jangan mengubah berkas sumber pengguna atau memberi status lulus ketika hasil ekspor belum memenuhi pemeriksaan.

Untuk perubahan antarmuka, uji keyboard, fokus yang terlihat, label input, pesan kesalahan, dan layar sempit. Untuk perubahan pemrosesan, periksa kembali byte hasil unduhan, nama, format, ukuran, jumlah halaman, dan urutan. Catat bukti serta pemeriksaan yang dilewati di [QA](docs/QA.md).

Pertahankan seluruh pemrosesan dokumen di browser. Jangan menambahkan permintaan jaringan, telemetri, penyimpanan permanen, atau ketergantungan baru tanpa menjelaskan kebutuhan dan dampaknya.

## Melaporkan masalah keamanan

Jangan memublikasikan dokumen pribadi atau payload yang membahayakan pengguna. Kanal pelaporan privat belum ditetapkan. Jika menemukannya selama pengembangan, sampaikan temuan kepada pengelola melalui kanal privat yang sudah disepakati; bedakan bukti yang direproduksi dari dugaan. Tidak ada program bounty atau janji imbalan yang diumumkan.
