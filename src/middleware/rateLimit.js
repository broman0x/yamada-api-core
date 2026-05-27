/**
 * Kumpulan limiter per kategori endpoint.
 *
 * Strategi:
 * - Limit global untuk semua request.
 * - Limit lebih ketat untuk search/proxy (biaya upstream tinggi).
 * - Limit lebih longgar untuk endpoint streaming.
 */
import rateLimit from 'express-rate-limit';

const pesanBatas = (error) => ({
    sukses: false,
    error
});

// Limit global: menjaga API tetap stabil terhadap burst traffic.
export const pembatasBawaan = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: pesanBatas('Terlalu banyak permintaan. Coba lagi dalam 1 menit.'),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

// Search dibatasi lebih ketat karena bisa memicu banyak scraping lintas sumber.
export const pembatasPencarian = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: pesanBatas('Terlalu banyak pencarian. Coba lagi dalam 1 menit.'),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

// Endpoint streaming diberi kuota lebih tinggi karena pola akses biasanya berurutan.
export const pembatasStreaming = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: pesanBatas('Terlalu banyak permintaan streaming. Coba lagi dalam 1 menit.'),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

// Proxy paling ketat untuk menekan potensi penyalahgunaan (open proxy abuse).
export const pembatasProxy = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: pesanBatas('Terlalu banyak permintaan proxy. Coba lagi dalam 1 menit.'),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});
