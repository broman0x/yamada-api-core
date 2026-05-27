/**
 * Proxy route untuk mengambil resource media eksternal secara aman.
 *
 * Keamanan yang diterapkan:
 * - Validasi skema URL (hanya http/https).
 * - Blok host lokal/private network (mitigasi SSRF).
 * - DNS lookup + cek hasil IP agar tidak mengarah ke jaringan privat.
 * - Host allowlist opsional via PROXY_ALLOWED_HOSTS.
 */
import express from 'express';
import axios from 'axios';
import dns from 'dns/promises';
import net from 'net';
import { pembatasProxy } from '../../middleware/rateLimit.js';

const rute = express.Router();
const MAKS_WAKTU_HABIS_PROXY_MS = Number(process.env.PROXY_TIMEOUT_MS || 15000);
const hostProxyDiizinkan = (process.env.PROXY_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

const apakahIpPrivat = (ip) => {
    const normalisasi = ip.replace('::ffff:', '');
    const versi = net.isIP(normalisasi);

    if (versi === 4) {
        const [a, b] = normalisasi.split('.').map(Number);
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        return false;
    }

    if (versi === 6) {
        const hurufKecil = normalisasi.toLowerCase();
        return hurufKecil === '::1' || hurufKecil.startsWith('fc') || hurufKecil.startsWith('fd') || hurufKecil.startsWith('fe80:');
    }

    return true;
};

const apakahHostDiizinkan = (namaHost) => {
    if (hostProxyDiizinkan.length === 0) return true;
    return hostProxyDiizinkan.some((hostDiizinkan) => namaHost === hostDiizinkan || namaHost.endsWith(`.${hostDiizinkan}`));
};

/**
 * GET /proxy?url=<target>
 * Meneruskan stream dari target URL setelah lolos validasi keamanan.
 */
rute.get('/', pembatasProxy, async (req, res) => {
    try {
        // URL target wajib diberikan oleh klien.
        const parameterUrl = String(req.query.url || '').trim();
        if (!parameterUrl) return res.status(400).json({ success: false, error: 'URL diperlukan' });

        let urlTarget;
        try {
            urlTarget = new URL(parameterUrl);
        } catch {
            return res.status(400).json({ success: false, error: 'Format URL tidak valid' });
        }

        // Batasi hanya http/https untuk mencegah skema berbahaya (file:, gopher:, dll).
        if (!['http:', 'https:'].includes(urlTarget.protocol)) {
            return res.status(400).json({ success: false, error: 'Protokol URL tidak didukung' });
        }

        const namaHost = urlTarget.hostname.toLowerCase();
        // Tolak localhost/local domain secara eksplisit.
        if (namaHost === 'localhost' || namaHost.endsWith('.localhost') || namaHost.endsWith('.local')) {
            return res.status(403).json({ success: false, error: 'Host tidak diizinkan' });
        }

        if (!apakahHostDiizinkan(namaHost)) {
            return res.status(403).json({ success: false, error: 'Host tidak diizinkan' });
        }

        // Resolusi DNS lalu validasi tiap IP hasil resolve agar tidak masuk private range.
        const hasilResolusi = await dns.lookup(namaHost, { all: true, verbatim: true });
        if (!hasilResolusi.length || hasilResolusi.some((item) => apakahIpPrivat(item.address))) {
            return res.status(403).json({ success: false, error: 'Host hasil resolusi tidak diizinkan' });
        }

        // Request upstream dalam mode stream agar memory usage tetap efisien.
        const respons = await axios({
            method: 'GET',
            url: urlTarget.toString(),
            responseType: 'stream',
            timeout: MAKS_WAKTU_HABIS_PROXY_MS,
            maxRedirects: 3,
            headers: {
                Referer: 'https://komikindo.ch/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            validateStatus: (status) => status >= 200 && status < 400
        });

        // Salurkan content-type dari upstream agar klien menerima tipe data yang benar.
        res.set('Content-Type', respons.headers['content-type'] || 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('X-Content-Type-Options', 'nosniff');
        respons.data.pipe(res);
    } catch {
        if (!res.headersSent) {
            res.status(502).json({ success: false, error: 'Pengambilan proxy gagal' });
        }
    }
});

export default rute;
