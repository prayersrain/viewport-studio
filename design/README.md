# Viewport — rancangan awal

Nama kerja: Viewport. Buka `mobile-studio.html` di browser untuk review mockup interaktif.

## Keputusan desain

- Bingkai HP realistis, latar netral dengan titik halus, panel putih dan aksen hijau zaitun.
- Rekaman tanpa suara, target MP4. Dukungan encoder dan konversi lokal belum diuji.
- Screenshot area layar dengan/tanpa bingkai; halaman penuh selalu tanpa bingkai.
- Codex dan Claude Code desktop: satu pengendali aktif per tab, tombol putus koneksi.
- Status bar/notch berada di luar area konten website pada mockup.

## Interaksi yang tersedia

Preset perangkat, edit ukuran, rotasi, zoom, bingkai/konten saja, pilihan area screenshot, dialog simulasi ekspor, timer simulasi rekaman, simulasi koneksi dan putus koneksi agen.

Ukuran CSS px adalah metadata rancangan, bukan emulasi viewport sebenarnya. Website contoh berbasis HTML/SVG lokal. Tidak ada navigasi URL, screenshot, perekaman, file unduhan, akses tab, atau koneksi MCP nyata. Font Google opsional menggunakan fallback sans-serif jika offline.

## Rencana implementasi setelah review desain

1. Validasi emulasi Chrome, viewport, touch, dan perilaku debugger sebelum mengunci arsitektur preview.
2. Bangun screenshot dan perekaman, uji output untuk memastikan bingkai, cropping, ukuran, dan video tanpa audio benar.
3. Validasi encoding MP4 dan biaya konversi lokal; sediakan status error yang jelas.
4. Buat penghubung agen dengan autentikasi lokal, pembatasan tab, satu pemegang kendali dan pemutusan koneksi.
5. Uji klien Codex dan Claude Code desktop secara nyata. Dukungan protokol tidak sama dengan integrasi yang sudah berhasil.

Preview multi-perangkat, scroll sinkron, anotasi, dan perbandingan hasil berada di luar versi pertama.
