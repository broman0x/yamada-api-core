/**
 * Global search route.
 *
 * Endpoint ini menggabungkan hasil dari beberapa sumber sekaligus:
 * - Otakudesu (anime)
 * - Anichin (donghua)
 * - BacaKomik (manga/manhwa/manhua)
 *
 * Tujuan: klien cukup memanggil satu endpoint untuk mendapatkan agregasi lintas sumber.
 */
import express from 'express';
import * as cheerio from 'cheerio';
import { permintaan } from '../../utils/request.js';
import { middlewareCache } from '../../middleware/cache.js';
import { pembatasPencarian } from '../../middleware/rateLimit.js';

const rute = express.Router();

const URL_DASAR_OTAKUDESU = 'https://otakudesu.blog/';
const URL_DASAR_ANICHIN = 'https://anichin.cafe/';
const URL_DASAR_BACAKOMIK = 'https://bacakomik.my/';

const responsSukses = (data) => ({
    status: "success",
    creator: "Yamadaverse",
    statusCode: 200,
    statusMessage: "OK",
    ok: true,
    data
});

const ekstrakSlug = (url) => {
    if (!url) return "";
    try {
        const bagian = url.split('/').filter(p => p !== "");
        return bagian[bagian.length - 1];
    } catch (e) {
        return "";
    }
};

// Helper pencarian sumber anime (Otakudesu).
const cariAnime = async (kataKunci) => {
    try {
        const url = `${URL_DASAR_OTAKUDESU}?s=${encodeURIComponent(kataKunci)}&post_type=anime`;
        const html = await permintaan(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const hasil = [];
        $('ul.chivsrc > li').each((i, el) => {
            const tautan = $(el).find('h2 a');
            const gambar = $(el).find('img');
            hasil.push({
                title: tautan.text().trim(),
                slug: ekstrakSlug(tautan.attr('href')),
                url: tautan.attr('href'),
                thumb: gambar.attr('src'),
                status: $(el).find('.set').text().match(/Status\s*:\s*([A-Za-z]+)/)?.[1] || 'Unknown',
                type: 'Anime'
            });
        });
        return hasil;
    } catch (kesalahan) {
        console.error("Kesalahan pencarian Anime:", kesalahan.message);
        return [];
    }
};

// Helper pencarian sumber donghua (Anichin).
const cariDonghua = async (kataKunci) => {
    try {
        const url = `${URL_DASAR_ANICHIN}?s=${encodeURIComponent(kataKunci)}`;
        const html = await permintaan(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const hasil = [];

        $('.listupd .bs').each((i, el) => {
            const tautan = $(el).find('a');
            const poster = $(el).find('img').attr('src');
            const judul = $(el).find('.tt').text().trim();
            const infoEpisode = $(el).find('.epx').text().trim();

            if (judul && tautan.attr('href')) {
                hasil.push({
                    title: judul,
                    slug: ekstrakSlug(tautan.attr('href')),
                    thumb: poster || "",
                    status: "Ongoing",
                    url: tautan.attr('href'),
                    type: "Donghua",
                    current_episode: infoEpisode || "Ep N/A"
                });
            }
        });
        return hasil;
    } catch (kesalahan) {
        console.error("Kesalahan pencarian Donghua:", kesalahan.message);
        return [];
    }
};

// Helper pencarian sumber manga/manhwa/manhua (BacaKomik).
const cariManga = async (kataKunci) => {
    try {
        const url = `${URL_DASAR_BACAKOMIK}?s=${encodeURIComponent(kataKunci)}`;
        const html = await permintaan(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const hasil = [];

        $('.animepost').each((i, el) => {
            const tautan = $(el).find('.animposx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.title').text().trim();
            const elemenGambar = $(el).find('img').first();
            const gambar = elemenGambar.attr('data-lazy-src') || elemenGambar.attr('src') || '';

            if (judul && urlManga) {
                hasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambar,
                    url: urlManga,
                    type: 'Manga'
                });
            }
        });
        return hasil;
    } catch (kesalahan) {
        console.error("Kesalahan pencarian Manga:", kesalahan.message);
        return [];
    }
};

/**
 * GET /search?q=<keyword>
 * Menjalankan pencarian paralel ke semua sumber lalu menggabungkan hasil.
 */
rute.get('/', pembatasPencarian, middlewareCache(180), async (req, res) => {
    try {
        const kataKunci = req.query.q || req.query.keyword || '';
        if (!kataKunci) {
            return res.status(400).json({ error: 'Parameter keyword diperlukan (q atau keyword)' });
        }

        // Paralelisasi mengurangi total latency dibandingkan request berurutan.
        const [anime, donghua, manga] = await Promise.all([
            cariAnime(kataKunci),
            cariDonghua(kataKunci),
            cariManga(kataKunci)
        ]);

        res.json(responsSukses({
            anime,
            donghua,
            manga,
            total_results: anime.length + donghua.length + manga.length
        }));

    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

export default rute;
