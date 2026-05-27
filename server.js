/**
 * server.js
 * --------------------------------------------------------------------------
 * Entry point utama Yamada API Core.
 *
 * Tanggung jawab file ini:
 * 1) Memuat konfigurasi environment dan hardening security baseline.
 * 2) Menyiapkan middleware global (logger, CORS, parser, rate limiter, auth).
 * 3) Mendaftarkan semua route module scraper.
 * 4) Menangani error parser, error runtime, dan fallback 404.
 * 5) Menjalankan mode single-process atau cluster mode untuk skala produksi.
 * --------------------------------------------------------------------------
 */
import express from 'express';
import dotenv from 'dotenv';
import cluster from 'cluster';
import os from 'os';
import compression from 'compression';
import { otentikasiKunciApi } from './src/middleware/auth.js';
import { pembatasBawaan } from './src/middleware/rateLimit.js';
import { logger, loggerHttp, pasangBridgeConsole } from './src/utils/logger.js';

import ruteOtakudesu from './src/routes/otakudesu/index.js';
import ruteDonghua from './src/routes/donghua/index.js';
import ruteAnoboy from './src/routes/anoboy/index.js';
import ruteKomiku from './src/routes/komiku/index.js';
import rutePencarian from './src/routes/search/index.js';
import ruteProxy from './src/routes/proxy/index.js';
import rutePlayground from './src/routes/playground/index.js';

dotenv.config();
pasangBridgeConsole();

// Nilai PORT default dipakai untuk local development saat variabel env belum disetel.
const PORT = process.env.PORT || 5000;
// Jumlah CPU dipakai sebagai batas atas worker ketika cluster aktif.
const JUMLAH_CPU = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
// Worker dibatasi maksimum 4 agar overhead context-switching tetap terkendali.
const PEKERJA = Math.max(1, Number(process.env.WORKERS || Math.min(4, JUMLAH_CPU)));
// Cluster otomatis aktif di production jika worker > 1, atau bisa dipaksa via env.
const CLUSTER_AKTIF = process.env.CLUSTER_ENABLED === 'true' || (process.env.NODE_ENV === 'production' && PEKERJA > 1);
const IZINKAN_SEMUA_ASAL = process.env.ALLOW_ALL_ORIGINS === 'true';
const PERCAYAI_PROXY = Number(process.env.TRUST_PROXY || 1);
const UKURAN_MAKS_JSON = process.env.MAX_JSON_SIZE || '100kb';
const PLAYGROUND_ENABLED = process.env.PLAYGROUND_ENABLED === 'true';
const kunciApiValid = (process.env.API_KEYS || process.env.BROMANAPI_KEY || '')
    .split(',')
    .map((kunci) => kunci.trim())
    .filter(Boolean);
const asalDiizinkan = new Set([
    'http://localhost:3000',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((asal) => asal.trim()).filter(Boolean) : [])
]);

const catatPenggunaanMemori = () => {
    const penggunaan = process.memoryUsage();
    logger.info({
        memory: {
            rssMb: Math.round(penggunaan.rss / 1024 / 1024),
            heapUsedMb: Math.round(penggunaan.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(penggunaan.heapTotal / 1024 / 1024)
        }
    }, 'Snapshot memori proses');
};

const jalankanServer = () => {
    const aplikasi = express();

    // trust proxy penting agar IP klien asli terbaca benar di balik reverse proxy (Nginx/Cloudflare).
    aplikasi.set('trust proxy', PERCAYAI_PROXY);
    // Header ini dimatikan supaya detail framework tidak bocor ke klien.
    aplikasi.disable('x-powered-by');
    // Logging HTTP ditempatkan paling awal agar semua request (termasuk error) tercatat.
    aplikasi.use(loggerHttp);

    // Security headers baseline untuk mitigasi clickjacking, MIME sniffing, dan policy sensitif.
    aplikasi.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
        if (process.env.NODE_ENV === 'production') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }
        next();
    });

    aplikasi.use(compression());
    // Batas ukuran payload melindungi server dari request body terlalu besar.
    aplikasi.use(express.json({ limit: UKURAN_MAKS_JSON }));
    aplikasi.use(express.urlencoded({ extended: false, limit: UKURAN_MAKS_JSON }));
    // Rate limit global dipasang sebelum route agar membatasi semua endpoint.
    aplikasi.use(pembatasBawaan);

    // Middleware CORS:
    // - Same-origin diizinkan otomatis.
    // - Origin whitelist dari env diizinkan.
    // - Origin lain ditolak 403 kecuali ALLOW_ALL_ORIGINS=true.
    aplikasi.use((req, res, next) => {
        const asal = req.headers.origin;
        const protokol = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
        const asalSaatIni = `${protokol}://${req.headers.host}`;
        const asalSamaDomain = asal && asal === asalSaatIni;

        if (asal && (asalDiizinkan.has(asal) || asalSamaDomain)) {
            res.header('Access-Control-Allow-Origin', asal);
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Vary', 'Origin');
        } else if (IZINKAN_SEMUA_ASAL) {
            res.header('Access-Control-Allow-Origin', '*');
        } else if (asal) {
            return res.status(403).json({ sukses: false, error: 'Asal CORS tidak diizinkan' });
        }

        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, User-Agent, Authorization, Accept, Origin');
        res.header('Access-Control-Max-Age', '86400'); // 24 jam

        // Tangani preflight
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        next();
    });

    // Playground bisa dibuka/tutup via env tanpa ubah kode.
    if (PLAYGROUND_ENABLED) {
        aplikasi.use('/playground', rutePlayground);
        logger.info('Playground aktif di /playground');
    } else {
        aplikasi.use('/playground', (req, res) =>
            res.status(404).json({ sukses: false, error: 'Playground dinonaktifkan' })
        );
    }

    // Semua endpoint API utama harus lewat autentikasi API key.
    aplikasi.use(otentikasiKunciApi);

    aplikasi.use('/anime', ruteOtakudesu);
    aplikasi.use('/donghua', ruteDonghua);
    aplikasi.use('/anime/anoboy', ruteAnoboy);
    aplikasi.use('/komiku', ruteKomiku);
    aplikasi.use('/search', rutePencarian);
    aplikasi.use('/proxy', ruteProxy);

    // Error parser JSON (malformed payload) dibalas 400 agar klien tahu payload invalid.
    aplikasi.use((kesalahan, req, res, next) => {
        if (kesalahan instanceof SyntaxError && 'body' in kesalahan) {
            return res.status(400).json({ sukses: false, error: 'Payload JSON tidak valid' });
        }
        return next(kesalahan);
    });

    // Fallback route: endpoint tidak ditemukan.
    aplikasi.use((req, res) => res.status(404).json({ sukses: false, error: 'Titik akhir tidak ditemukan' }));

    // Global error handler: menangani error tak tertangkap dari middleware/route mana pun.
    aplikasi.use((kesalahan, req, res, next) => {
        req.log?.error({
            err: kesalahan,
            requestId: req.id,
            method: req.method,
            path: req.originalUrl
        }, 'Kesalahan tidak tertangani');
        if (res.headersSent) {
            return next(kesalahan);
        }
        return res.status(500).json({ sukses: false, error: 'Kesalahan internal server' });
    });

    aplikasi.listen(PORT, () => {
        logger.info({
            pid: process.pid,
            port: Number(PORT),
            clusterAktif: CLUSTER_AKTIF,
            workers: PEKERJA,
            keamanan: {
                apiKey: true,
                rateLimitPerMenit: 60,
                corsAllowAll: IZINKAN_SEMUA_ASAL
            },
            fitur: {
                playground: PLAYGROUND_ENABLED
            }
        }, 'Server aktif');
        catatPenggunaanMemori();
    });

    // Telemetri memory periodik berguna untuk deteksi memory leak dini.
    setInterval(catatPenggunaanMemori, 300000);
};

// Validasi mandatory API key saat startup agar server tidak berjalan dalam mode tidak aman.
if (kunciApiValid.length === 0) {
    throw new Error('Kesalahan konfigurasi keamanan: BROMANAPI_KEY atau API_KEYS harus diatur.');
}

if (process.env.NODE_ENV === 'production') {
    const punyaKunciLemah = kunciApiValid.some((kunci) => kunci.length < 24 || kunci.toLowerCase().includes('koecingobod'));
    if (punyaKunciLemah) {
        throw new Error('Kesalahan konfigurasi keamanan: gunakan kunci API yang kuat dengan minimal 24 karakter di produksi.');
    }
}

if (CLUSTER_AKTIF && cluster.isPrimary) {
    logger.info({
        pid: process.pid,
        cpu: JUMLAH_CPU,
        workers: PEKERJA
    }, 'Master menyiapkan worker cluster');

    for (let i = 0; i < PEKERJA; i++) {
        cluster.fork();
    }

    // Jika worker mati, master langsung spawn worker pengganti agar availability tetap stabil.
    cluster.on('exit', (pekerja, kode, sinyal) => {
        logger.warn({
            pidWorker: pekerja.process.pid,
            kode,
            sinyal
        }, 'Worker mati, memulai worker baru');
        cluster.fork();
    });

    // Shutdown hooks untuk graceful termination saat deploy/stop service.
    process.on('SIGINT', async () => {
        logger.info('Menerima SIGINT, mematikan dengan anggun');
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Menerima SIGTERM, mematikan dengan anggun');
        process.exit(0);
    });
} else {
    if (CLUSTER_AKTIF) {
        logger.info({ pid: process.pid }, 'Worker cluster dimulai');
    } else {
        logger.info('Mode proses tunggal diaktifkan (cluster nonaktif)');
    }
    jalankanServer();
}
