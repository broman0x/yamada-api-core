/**
 * Route scraper Komiku (komikindo.ch).
 *
 * Cakupan endpoint:
 * - home, detail manga, detail chapter
 * - search, pustaka, genre
 * - listing kategori (manga/manhwa/manhua)
 * - listing kurasi (terbaru, berwarna, populer, daftar komik)
 */
import express from 'express';
import * as cheerio from 'cheerio';
import { permintaan } from '../../utils/request.js';
import { middlewareCache } from '../../middleware/cache.js';
import axios from 'axios';

const rute = express.Router();
const URL_DASAR = 'https://komikindo.ch/';

const responsSukses = (data) => ({
    status: "success",
    creator: "Yamadaverse",
    statusCode: 200,
    statusMessage: "OK",
    ok: true,
    data
});

// Request direct via axios dipakai khusus Komiku agar header/referer bisa dikontrol penuh.
const ambilLangsung = async (url) => {
    try {
        const respons = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://komikindo.ch/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
            timeout: 10000
        });
        return respons.data;
    } catch (kesalahan) {
        console.error(`Kesalahan Ambil Langsung (${url}):`, kesalahan.message);
        return null;
    }
};

const ekstrakSlug = (url) => {
    if (!url) return "";
    try {
        const bagian = url.split('/').filter(p => p !== "");
        return bagian[bagian.length - 1];
    } catch (e) {
        return "";
    }
};

/**
 * GET /komiku/home
 * Mengambil daftar komik terbaru + populer.
 */
rute.get('/home', middlewareCache(300), async (req, res) => {
    try {
        const url = `${URL_DASAR}komik-terbaru/`;
        console.log(`Mengambil home langsung: ${url}`);
        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia: Gagal mengambil konten." });

        const $ = cheerio.load(html);
        const terbaru = [];
        const populer = [];

        $('.listupd .bs, .listupd .animepost').each((i, el) => {
            if (i >= 20) return false;

            const tautan = $(el).find('.bsx a, .animposx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4').text().trim();

            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';

            const tautanBab = $(el).find('.epxs, .datech').first();
            const bab = tautanBab.text().trim();

            if (judul && urlManga) {
                terbaru.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    chapter: bab,
                    chapterSlug: '',
                    thumb: gambarKecil,
                    url: urlManga
                });
            }
        });

        const urlPopuler = `${URL_DASAR}manga/?order=popular`;
        const htmlPopuler = await ambilLangsung(urlPopuler);
        if (htmlPopuler) {
            const $pop = cheerio.load(htmlPopuler);
            $pop('.listupd .bs').each((i, el) => {
                if (i >= 10) return false;

                const tautan = $pop(el).find('.bsx a').first();
                const judul = tautan.attr('title') || '';
                const urlManga = tautan.attr('href');
                const gambar = $pop(el).find('img').first();
                const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';

                if (judul && urlManga) {
                    populer.push({
                        title: judul,
                        slug: ekstrakSlug(urlManga),
                        thumb: gambarKecil,
                        url: urlManga
                    });
                }
            });
        }

        res.json(responsSukses({ latest: terbaru, popular: populer }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/manga/:slug
 * Detail komik: metadata, sinopsis, genre, dan daftar chapter.
 */
rute.get('/manga/:slug', middlewareCache(600), async (req, res) => {
    try {
        const url = `${URL_DASAR}manga/${req.params.slug}/`;
        console.log(`Mengambil detail langsung: ${url}`);
        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia: Gagal mengambil detail manga." });

        const $ = cheerio.load(html);

        const judul = $('.entry-title, h1.entry-title').first().text().replace('Komik', '').trim();
        const gambarKecil = $('.infox .thumb img, .thumb img, .img-desc img').attr('src') || '';
        
        let sinopsis = '';
        const wadahSinopsis = $('.entry-content[itemprop="description"], .entry-content, .desc').first();

        console.log("DEBUG: Wadah Sinopsis Ditemukan?", wadahSinopsis.length > 0);
        if (wadahSinopsis.length > 0) {
            console.log("DEBUG: Pratinjau HTML Wadah:", wadahSinopsis.html() ? wadahSinopsis.html().substring(0, 200) : "NULL");

            const paragraf = new Set();

            wadahSinopsis.find('p').each((i, el) => {
                let teks = $(el).text().trim();
                console.log(`DEBUG: P[${i}] Teks:`, teks.substring(0, 50));

                if (!teks) return;

                if (teks.includes('Bahasa Indonesia') && teks.includes('Manhwa') && teks.length < 100) {
                    console.log("DEBUG: Difilter (Bahasa Indonesia - Pendek)");
                    return;
                }

                teks = teks.replace(/^Manhwa\s+.*?\s+yang\s+dibuat\s+oleh\s+komikus.*?(bercerita\s+tentang|menceritakan|adalah)\s*/i, '');
                teks = teks.replace(/^Manhwa\s+.*?\s+bercerita\s+tentang\s*/i, '');
                teks = teks.replace(/^Komik\s+.*?\s+adalah\s*/i, '');
                teks = teks.replace(/Judul\s+Asli\s+.*$/i, '');

                if (teks.length > 15) {
                    paragraf.add(teks);
                }
            });

            sinopsis = Array.from(paragraf).join('\n\n');
        }

        if (!sinopsis) {
            console.log("DEBUG: Menggunakan Cadangan");
            sinopsis = wadahSinopsis.text()
                .replace(/Manhwa\s+.*?Bahasa Indonesia/gi, '')
                .replace(/Manhwa\s+.*?bercerita tentang/gi, '')
                .replace(/.*?dibuat oleh komikus.*?bercerita tentang/gi, '')
                .replace(/\n+/g, '\n')
                .trim();
        }

        const daftarGenre = [];
        $('.genre-info a, .mgen a').each((i, el) => {
            daftarGenre.push($(el).text().trim());
        });

        const infoDetail = {};
        $('.infox .spe span, .spe span').each((i, span) => {
            const teks = $(span).text();
            if (teks.includes(':')) {
                const [kunci, ...bagianNilai] = teks.split(':');
                infoDetail[kunci.trim()] = bagianNilai.join(':').trim();
            }
        });
        if (daftarGenre.length > 0) infoDetail.genres = daftarGenre;

        const daftarBab = [];
        const elemenDaftarBab = $('#chapterlist ul li, .lcp_catlist li, .bxcl ul li');

        elemenDaftarBab.each((i, el) => {
            const tautan = $(el).find('a').first();
            const urlBab = tautan.attr('href');
            const namaBab = tautan.text().trim().replace(judul, '').trim();

            if (namaBab && urlBab) {
                daftarBab.push({
                    name: namaBab,
                    slug: ekstrakSlug(urlBab),
                    url: urlBab
                });
            }
        });

        const dataDetail = {
            title: judul,
            slug: req.params.slug,
            thumb: gambarKecil,
            synopsis: sinopsis,
            info: infoDetail,
            chapters: daftarBab,
            total_chapters: daftarBab.length
        };

        res.json(responsSukses(dataDetail));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/chapter/:slug
 * Detail chapter: daftar image panel dan metadata navigasi.
 */
rute.get('/chapter/:slug', middlewareCache(900), async (req, res) => {
    try {
        const url = `${URL_DASAR}${req.params.slug}/`;
        console.log(`Mengambil bab langsung: ${url}`);
        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia: Gagal mengambil bab." });

        const $ = cheerio.load(html);

        const judul = $('.entry-title, h1.entry-title').first().text().trim();

        const gambarBab = [];
        $('#chimg-auh img, #readerarea img, .rdminimal img').each((i, img) => {
            const src = $(img).attr('src') || $(img).attr('data-src');
            if (src && !src.includes('data:image')) {
                gambarBab.push(src);
            }
        });

        const dataDetail = {
            title: judul,
            slug: req.params.slug,
            images: gambarBab,
            total_images: gambarBab.length
        };

        res.json(responsSukses(dataDetail));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/search?q=keyword
 * Pencarian judul komik.
 */
rute.get('/search', middlewareCache(180), async (req, res) => {
    try {
        const kataKunci = req.query.q || req.query.keyword || '';
        if (!kataKunci) {
            return res.status(400).json({ error: 'Parameter keyword diperlukan (q atau keyword)' });
        }

        const url = `${URL_DASAR}?s=${encodeURIComponent(kataKunci)}`;
        console.log(`Mengambil pencarian langsung: ${url}`);
        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia: Gagal mengambil hasil pencarian." });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs').each((i, el) => {
            const tautan = $(el).find('.bsx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';
            const bab = $(el).find('.epxs').text().trim();

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    chapter: bab,
                    url: urlManga
                });
            }
        });

        if (daftarHasil.length === 0) {
            return res.json(responsSukses([]));
        }

        res.json(responsSukses(daftarHasil));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/pustaka
 * Listing pustaka lengkap dengan dukungan filter query.
 */
rute.get('/pustaka', middlewareCache(300), async (req, res) => {
    try {
        const { page = 1, title = '', type = '', status = '', order = 'update' } = req.query;
        const nomorHalaman = parseInt(page);

        let url = nomorHalaman === 1
            ? `${URL_DASAR}manga/?title=${encodeURIComponent(title)}&type=${type}&status=${status}&order=${order}`
            : `${URL_DASAR}manga/page/${nomorHalaman}/?title=${encodeURIComponent(title)}&type=${type}&status=${status}&order=${order}`;

        console.log(`Mengambil pustaka langsung: ${url}`);
        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs').each((i, el) => {
            const tautan = $(el).find('.bsx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';
            const tipe = $(el).find('.type').text().trim();
            const penilaian = $(el).find('.numscore').text().trim();

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    type: tipe,
                    rating: penilaian,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(page),
            total: 1,
            hasNext: false,
            hasPrev: parseInt(page) > 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                const halamanNum = parseInt(teks);
                navigasi.total = Math.max(navigasi.total, halamanNum);
            }
        });

        navigasi.hasNext = navigasi.current < navigasi.total;

        res.json(responsSukses({ results: daftarHasil, pagination: navigasi, page: parseInt(page), filters: { title, type, status, order } }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/daftar-genre
 * Daftar seluruh genre komik.
 */
rute.get('/daftar-genre', middlewareCache(3600), async (req, res) => {
    try {
        const url = `${URL_DASAR}daftar-genre/`;
        console.log(`Mengambil daftar-genre langsung: ${url}`);
        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarGenre = [];

        $('a[href*="/genres/"]').each((i, el) => {
            const elemen = $(el);
            const nama = elemen.text().trim();
            const tautanHref = elemen.attr('href');
            const slug = ekstrakSlug(tautanHref);

            if (nama && tautanHref && slug && !daftarGenre.find(g => g.slug === slug)) {
                daftarGenre.push({ name: nama, slug, url: tautanHref });
            }
        });

        res.json(responsSukses(daftarGenre));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/genre/:slug
 * Listing komik berdasarkan genre tertentu.
 */
rute.get('/genre/:slug', middlewareCache(300), async (req, res) => {
    try {
        const { slug } = req.params;
        const halaman = parseInt(req.query.page) || 1;

        const url = halaman === 1 ? `${URL_DASAR}genres/${slug}/` : `${URL_DASAR}genres/${slug}/page/${halaman}/`;
        console.log(`Mengambil genre langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs, .listupd .animepost').each((i, el) => {
            const tautan = $(el).find('.bsx a, .animposx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';
            const tipe = $(el).find('.type, .typeflag').text().trim();
            const bab = $(el).find('.epxs, .datech').text().trim();

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    type: tipe,
                    latestChapter: bab,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(halaman),
            total: 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                navigasi.total = Math.max(navigasi.total, parseInt(teks));
            }
        });

        res.json(responsSukses({
            results: daftarHasil,
            pagination: navigasi,
            page: parseInt(halaman),
            genre: slug
        }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/manga-list
 * Listing khusus kategori manga.
 */
rute.get('/manga-list', middlewareCache(300), async (req, res) => {
    try {
        const halaman = req.query.page || 1;
        const url = `${URL_DASAR}manga/?type=manga&order=update&page=${halaman}`;
        console.log(`Mengambil manga-list langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs, .listupd .animepost').each((i, el) => {
            const tautan = $(el).find('.bsx a, .animposx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    url: urlManga
                });
            }
        });

        res.json(responsSukses({ results: daftarHasil, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/manhwa-list
 * Listing khusus kategori manhwa.
 */
rute.get('/manhwa-list', middlewareCache(300), async (req, res) => {
    try {
        const halaman = req.query.page || 1;
        const url = `${URL_DASAR}manga/?type=manhwa&order=update&page=${halaman}`;
        console.log(`Mengambil manhwa-list langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs').each((i, el) => {
            const tautan = $(el).find('.bsx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    url: urlManga
                });
            }
        });

        res.json(responsSukses({ results: daftarHasil, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/manhua-list
 * Listing khusus kategori manhua.
 */
rute.get('/manhua-list', middlewareCache(300), async (req, res) => {
    try {
        const halaman = req.query.page || 1;
        const url = `${URL_DASAR}manga/?type=manhua&order=update&page=${halaman}`;
        console.log(`Mengambil manhua-list langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs').each((i, el) => {
            const tautan = $(el).find('.bsx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    url: urlManga
                });
            }
        });

        res.json(responsSukses({ results: daftarHasil, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/baca-manga
 * Endpoint kurasi baca manga.
 */
rute.get('/baca-manga', middlewareCache(300), async (req, res) => {
    try {
        const halaman = parseInt(req.query.page) || 1;
        const url = halaman === 1 ? `${URL_DASAR}manga/` : `${URL_DASAR}manga/page/${halaman}/`;
        console.log(`Mengambil manga langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs, .listupd .animepost').each((i, el) => {
            const tautan = $(el).find('.bsx a, .animposx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';
            const bab = $(el).find('.epxs, .datech').text().trim();

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    chapter: bab,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(halaman),
            total: 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                navigasi.total = Math.max(navigasi.total, parseInt(teks));
            }
        });

        res.json(responsSukses({ results: daftarHasil, pagination: navigasi, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/baca-manhwa
 * Endpoint kurasi baca manhwa.
 */
rute.get('/baca-manhwa', middlewareCache(300), async (req, res) => {
    try {
        const halaman = parseInt(req.query.page) || 1;
        const url = halaman === 1 ? `${URL_DASAR}manhwa/` : `${URL_DASAR}manhwa/page/${halaman}/`;
        console.log(`Mengambil manhwa langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.film-list .animepost, .listupd .bs, .listupd .animepost').each((i, el) => {
            let tautan = $(el).find('a[itemprop="url"]').first();
            if (!tautan.length) tautan = $(el).find('a').first();

            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4, .tt h3').text().trim();

            let gambar = $(el).find('img[itemprop="image"]').first();
            if (!gambar.length) gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';

            const bab = $(el).find('.epxs, .datech').text().trim();

            if (judul && urlManga && urlManga.includes('komik')) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    chapter: bab,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(halaman),
            total: 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                navigasi.total = Math.max(navigasi.total, parseInt(teks));
            }
        });

        res.json(responsSukses({ results: daftarHasil, pagination: navigasi, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/baca-manhua
 * Endpoint kurasi baca manhua.
 */
rute.get('/baca-manhua', middlewareCache(300), async (req, res) => {
    try {
        const halaman = parseInt(req.query.page) || 1;
        const url = halaman === 1 ? `${URL_DASAR}manhua/` : `${URL_DASAR}manhua/page/${halaman}/`;
        console.log(`Mengambil manhua langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.film-list .animepost, .listupd .bs, .listupd .animepost').each((i, el) => {
            let tautan = $(el).find('a[itemprop="url"]').first();
            if (!tautan.length) tautan = $(el).find('a').first();

            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4, .tt h3').text().trim();

            let gambar = $(el).find('img[itemprop="image"]').first();
            if (!gambar.length) gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';

            const bab = $(el).find('.epxs, .datech').text().trim();

            if (judul && urlManga && urlManga.includes('komik')) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    chapter: bab,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(halaman),
            total: 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                navigasi.total = Math.max(navigasi.total, parseInt(teks));
            }
        });

        res.json(responsSukses({ results: daftarHasil, pagination: navigasi, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/komik-terbaru
 * Listing komik terbaru.
 */
rute.get('/komik-terbaru', middlewareCache(300), async (req, res) => {
    try {
        const halaman = parseInt(req.query.page) || 1;
        const url = halaman === 1 ? `${URL_DASAR}komik-terbaru/` : `${URL_DASAR}komik-terbaru/page/${halaman}/`;
        console.log(`Mengambil terbaru langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs, .listupd .animepost').each((i, el) => {
            const tautan = $(el).find('.bsx a, .animposx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';
            const bab = $(el).find('.epxs, .datech').text().trim();

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    chapter: bab,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(halaman),
            total: 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                navigasi.total = Math.max(navigasi.total, parseInt(teks));
            }
        });

        res.json(responsSukses({ results: daftarHasil, pagination: navigasi, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/komik-berwarna
 * Listing komik berwarna.
 */
rute.get('/komik-berwarna', middlewareCache(300), async (req, res) => {
    try {
        const halaman = parseInt(req.query.page) || 1;
        const url = halaman === 1 ? `${URL_DASAR}komik-berwarna/` : `${URL_DASAR}komik-berwarna/page/${halaman}/`;
        console.log(`Mengambil berwarna langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs, .listupd .animepost').each((i, el) => {
            const tautan = $(el).find('.bsx a, .animposx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';
            const bab = $(el).find('.epxs, .datech').text().trim();

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    chapter: bab,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(halaman),
            total: 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                navigasi.total = Math.max(navigasi.total, parseInt(teks));
            }
        });

        res.json(responsSukses({ results: daftarHasil, pagination: navigasi, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/komik-populer
 * Listing komik populer.
 */
rute.get('/komik-populer', middlewareCache(300), async (req, res) => {
    try {
        const halaman = parseInt(req.query.page) || 1;
        const url = halaman === 1 ? `${URL_DASAR}komik-populer/` : `${URL_DASAR}komik-populer/page/${halaman}/`;
        console.log(`Mengambil populer langsung: ${url}`);

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.listupd .bs, .listupd .animepost').each((i, el) => {
            const tautan = $(el).find('.bsx a, .animposx a').first();
            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4').text().trim();
            const gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';
            const bab = $(el).find('.epxs, .datech').text().trim();

            if (judul && urlManga) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    chapter: bab,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(halaman),
            total: 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                navigasi.total = Math.max(navigasi.total, parseInt(teks));
            }
        });

        res.json(responsSukses({ results: daftarHasil, pagination: navigasi, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /komiku/daftar-komik
 * Direktori komik umum (all listing fallback).
 */
rute.get('/daftar-komik', middlewareCache(300), async (req, res) => {
    try {
        const halaman = parseInt(req.query.page) || 1;
        const url = halaman === 1 ? `${URL_DASAR}daftar-manga/` : `${URL_DASAR}daftar-manga/page/${halaman}/`;

        const html = await ambilLangsung(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];

        $('.film-list .animepost, .listupd .bs, .listupd .animepost').each((i, el) => {
            let tautan = $(el).find('a[itemprop="url"]').first();
            if (!tautan.length) tautan = $(el).find('a').first();

            const urlManga = tautan.attr('href');
            const judul = tautan.attr('title') || $(el).find('.tt, h4, .tt h3').text().trim();

            let gambar = $(el).find('img[itemprop="image"]').first();
            if (!gambar.length) gambar = $(el).find('img').first();
            const gambarKecil = gambar.attr('src') || gambar.attr('data-src') || '';

            const tipe = $(el).find('.type, .typeflag').text().trim();
            const bab = $(el).find('.epxs, .datech').text().trim();

            if (judul && urlManga && urlManga.includes('komik')) {
                daftarHasil.push({
                    title: judul,
                    slug: ekstrakSlug(urlManga),
                    thumb: gambarKecil,
                    type: tipe,
                    chapter: bab,
                    url: urlManga
                });
            }
        });

        const navigasi = {
            current: parseInt(halaman),
            total: 1
        };

        $('.pagination .page-numbers').each((i, el) => {
            const teks = $(el).text().trim();
            if (!isNaN(teks)) {
                navigasi.total = Math.max(navigasi.total, parseInt(teks));
            }
        });

        res.json(responsSukses({ results: daftarHasil, pagination: navigasi, page: parseInt(halaman) }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

export default rute;
