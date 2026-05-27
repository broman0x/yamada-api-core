/**
 * Util request HTTP utama untuk semua scraper.
 *
 * Fitur inti:
 * - Retry dengan backoff bertahap.
 * - Keep-alive agent untuk efisiensi koneksi.
 * - Cache memori (fresh + stale fallback) untuk ketahanan saat upstream error.
 * - Header browser-like agar kompatibilitas scraping lebih tinggi.
 */
import axios from 'axios';
import http from 'http';
import https from 'https';

const UA_TETAP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const WAKTU_HABIS_PERMINTAAN_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const BATAS_WAKTU_CACHE_MS = Number(process.env.REQUEST_CACHE_TTL_MS || 120000);
const WAKTU_BASI_CACHE_MS = Number(process.env.REQUEST_CACHE_STALE_MS || 600000);
const MAKSIMAL_PENGALIHAN = Number(process.env.REQUEST_MAX_REDIRECTS || 5);
const IZINKAN_TLS_TIDAK_AMAN = process.env.ALLOW_INSECURE_TLS === 'true';
const penyimpananCache = new Map();

// Keep-alive mengurangi overhead TCP/TLS handshake untuk request berulang.
const agenHttp = new http.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10
});

const agenHttps = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    rejectUnauthorized: !IZINKAN_TLS_TIDAK_AMAN
});

const ambilCache = (kunci) => {
    // TTL <= 0 berarti mode cache dinonaktifkan.
    if (BATAS_WAKTU_CACHE_MS <= 0) return { segar: null, basi: null };

    const diCache = penyimpananCache.get(kunci);
    if (!diCache) return { segar: null, basi: null };

    const usia = Date.now() - diCache.waktu;
    if (usia <= BATAS_WAKTU_CACHE_MS) {
        // Data fresh: aman dipakai langsung.
        return { segar: diCache.data, basi: diCache.data };
    }

    if (usia <= WAKTU_BASI_CACHE_MS) {
        // Data stale: hanya dipakai sebagai fallback saat upstream gagal.
        return { segar: null, basi: diCache.data };
    }

    penyimpananCache.delete(kunci);
    return { segar: null, basi: null };
};

export const permintaan = async (url, opsi = {}, percobaan = 3) => {
    // Normalisasi URL mencegah duplikasi slash yang sering bikin mismatch endpoint.
    const urlBersih = url.replace(/([^:]\/)\/+/g, '$1');
    const metode = (opsi.method || 'GET').toUpperCase();
    const header = opsi.headers || {};
    const bodi = opsi.body || null;
    const adalahGet = metode === 'GET';
    const { segar, basi } = ambilCache(urlBersih);

    if (segar) {
        return segar;
    }

    // Loop retry: gagal sekali tidak langsung error permanen.
    for (let i = 0; i < percobaan; i++) {
        try {
            const asalTarget = new URL(urlBersih).origin;
            const perujuk = asalTarget + '/';

            // Referer dikirim hanya jika target bukan homepage origin persis.
            const perujukAkhir = urlBersih === perujuk ? undefined : perujuk;

            const konfigurasiAxios = {
                method: metode.toLowerCase(),
                url: urlBersih,
                timeout: WAKTU_HABIS_PERMINTAAN_MS,
                httpAgent: agenHttp,
                httpsAgent: agenHttps,
                headers: {
                    'User-Agent': UA_TETAP,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Upgrade-Insecure-Requests': '1',
                    ...(perujukAkhir ? { 'Referer': perujukAkhir } : {}),
                    ...header
                },
                validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
                maxRedirects: MAKSIMAL_PENGALIHAN
            };

            if (bodi && metode !== 'GET') {
                konfigurasiAxios.data = bodi;
            }

            const respons = await axios(konfigurasiAxios);

            if (respons.data) {
                // Hanya tipe data yang masuk akal untuk scraper yang diterima.
                const adalahHtml = typeof respons.data === 'string' && respons.data.includes('<html');
                const adalahJson = typeof respons.data === 'string' && (respons.data.startsWith('{') || respons.data.startsWith('['));
                const adalahObjek = typeof respons.data === 'object';

                if (adalahHtml || adalahJson || adalahObjek) {
                    if (adalahGet && BATAS_WAKTU_CACHE_MS > 0) {
                        // Cache hanya untuk GET agar tidak menyimpan hasil request mutasi.
                        penyimpananCache.set(urlBersih, {
                            data: respons.data,
                            waktu: Date.now()
                        });
                    }
                    return respons.data;
                }
            }

            if (respons.status === 404) {
                // 404 dipetakan ke string kosong agar caller bisa handle "not found" tanpa throw.
                return "";
            }

            throw new Error(`Format respons tidak valid. Status: ${respons.status}`);
        } catch (kesalahan) {
            if (i === percobaan - 1) {
                if (basi) {
                    // Fallback stale cache menjaga layanan tetap responsif saat upstream bermasalah.
                    console.warn(`Menggunakan cache basi setelah error upstream: ${urlBersih}`);
                    return basi;
                }
                return null;
            }
            // Backoff linear sederhana untuk menghindari spam retry agresif.
            await new Promise(selesai => setTimeout(selesai, 500 * (i + 1)));
        }
    }
    return null;
};
