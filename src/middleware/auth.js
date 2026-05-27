/**
 * Middleware autentikasi API key.
 *
 * Tujuan:
 * - Memastikan hanya klien dengan x-api-key valid yang bisa akses endpoint.
 * - Menggunakan perbandingan timing-safe untuk mencegah timing attack sederhana.
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// Mendukung banyak key sekaligus: dipisahkan dengan koma di API_KEYS.
const kunciValid = (process.env.API_KEYS || process.env.BROMANAPI_KEY || '')
    .split(',')
    .map((kunci) => kunci.trim())
    .filter(Boolean);

const bandingkanAman = (a, b) => {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
};

export const otentikasiKunciApi = (req, res, next) => {
    // Header dipaksa string lalu trim agar konsisten walau input tidak ideal.
    const kunciApi = String(req.headers['x-api-key'] || '').trim();

    // Jika tidak ada key, atau daftar key server kosong, akses langsung ditolak.
    if (!kunciApi || kunciValid.length === 0) {
        return res.status(401).json({
            sukses: false,
            error: 'Tidak Terotorisasi: Kunci API tidak valid atau hilang'
        });
    }

    // Validasi menggunakan timingSafeEqual untuk meminimalkan kebocoran waktu komparasi.
    const adalahValid = kunciValid.some((kunci) => bandingkanAman(kunciApi, kunci));
    if (!adalahValid) {
        return res.status(401).json({
            sukses: false,
            error: 'Tidak Terotorisasi: Kunci API tidak valid atau hilang'
        });
    }

    // Lolos validasi -> request diteruskan ke middleware/route berikutnya.
    next();
};
