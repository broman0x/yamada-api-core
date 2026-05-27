/**
 * Route scraper Anoboy.
 *
 * Modul ini menyediakan:
 * - daftar home/update
 * - detail anime
 * - detail episode (stream candidate)
 *
 * Catatan: endpoint placeholder di bagian bawah adalah fallback sederhana
 * yang bisa diganti implementasi real jika struktur sumber berubah.
 */
import express from 'express';
import * as cheerio from 'cheerio';
import { permintaan } from '../../utils/request.js';

const rute = express.Router();
const URL_DASAR = 'https://anoboy.be/';

const responsSukses = (data) => ({
    status: "success",
    creator: "Yamadaverse",
    source: "Anoboy",
    ...data
});

const dapatkanSlugDariUrl = (url) => {
    if (!url) return "";
    const bagian = url.split('/').filter(Boolean);
    return bagian.pop();
};

/**
 * GET /anime/anoboy/home
 * Mengambil daftar update anime dari halaman utama/pagination Anoboy.
 */
rute.get('/home', async (req, res) => {
    const halaman = req.query.page || 1;
    const url = halaman > 1 ? `${URL_DASAR}page/${halaman}` : URL_DASAR;

    try {
        const html = await permintaan(url);
        if (!html || html.includes('404')) {
            return res.status(503).json(responsSukses({ anime_list: [], pagination: { hasNext: false, hasPrev: false, currentPage: halaman }, message: "Gagal mengambil konten." }));
        }

        const $ = cheerio.load(html);
        const daftarAnime = [];

        $('.anime-list .col-md-4, .row.iz > div').each((i, el) => {
            const elemen = $(el);
            const elemenTautan = elemen.find('a').first();
            const urlAnime = elemenTautan.attr('href');
            const poster = elemenTautan.find('img').attr('src');
            const judul = elemenTautan.attr('title') || elemen.find('.judul-anime').text().trim();

            const teksInfo = elemen.find('.col-md-8 .judul-anime').text().trim();
            const kecocokanEpisode = teksInfo.match(/(Ep\s*\d+)/i);
            const kecocokanTipe = teksInfo.match(/(TV|ONA|OVA|Movie)/i);

            if (judul && urlAnime) {
                daftarAnime.push({
                    title: judul,
                    slug: dapatkanSlugDariUrl(urlAnime),
                    poster: poster || "",
                    episode: kecocokanEpisode ? kecocokanEpisode[0] : elemen.find('.btn-success').text().trim(),
                    type: kecocokanTipe ? kecocokanTipe[0] : (elemen.find('.type-anime').text().trim() || "TV"),
                    url: urlAnime
                });
            }
        });

        const tautanBerikutnya = $('.pagination .next a').attr('href');
        const tautanSebelumnya = $('.pagination .prev a').attr('href');

        const navigasiHalaman = {
            hasNext: !!tautanBerikutnya,
            hasPrev: !!tautanSebelumnya,
            currentPage: parseInt(halaman)
        };

        res.json(responsSukses({
            anime_list: daftarAnime,
            pagination: navigasiHalaman
        }));

    } catch (kesalahan) {
        console.error(`Kesalahan pada scraping home Anoboy: ${kesalahan.message}`);
        res.status(500).json({ status: "error", creator: "Yamadaverse", source: "Anoboy", message: kesalahan.message });
    }
});

/**
 * GET /anime/anoboy/anime/:slug
 * Mengambil metadata anime, genre, dan daftar episode.
 */
rute.get('/anime/:slug', async (req, res) => {
    const slug = req.params.slug;
    const urlDetail = `${URL_DASAR}series/${slug}`;

    try {
        const html = await permintaan(urlDetail);
        if (!html || html.includes('404')) {
            return res.status(503).json(responsSukses({ detail: null, message: "Detail tidak ditemukan." }));
        }

        const $ = cheerio.load(html);

        const info = {};
        $('.series-info ul li').each((i, el) => {
            const teks = $(el).text().trim();
            const [k, v] = teks.split(':');
            if (k && v) {
                info[k.trim().toLowerCase()] = v.trim();
            }
        });

        const daftarGenre = [];
        $('.series-info .genre a').each((i, el) => {
            const urlGenre = $(el).attr('href');
            daftarGenre.push({
                name: $(el).text().trim(),
                slug: dapatkanSlugDariUrl(urlGenre),
                url: urlGenre
            });
        });

        const daftarEpisode = [];
        $('.list-episode ul li').each((i, el) => {
            const elemenTautan = $(el).find('a').first();
            const urlEpisode = elemenTautan.attr('href');
            const judul = elemenTautan.text().trim();
            const tanggalRilis = $(el).find('span').text().trim();

            const kecocokanEpisode = judul.match(/episode\s*(\d+)/i);
            const nomorEpisode = kecocokanEpisode ? kecocokanEpisode[1] : dapatkanSlugDariUrl(urlEpisode);

            if (urlEpisode) {
                daftarEpisode.push({
                    slug: dapatkanSlugDariUrl(urlEpisode),
                    title: judul,
                    episode: nomorEpisode,
                    release_date: tanggalRilis,
                    url: urlEpisode
                });
            }
        });

        const detailData = {
            title: $('.entry-title').text().trim(),
            poster: $('.series-info img').attr('src') || '',
            synopsis: $('.series-info .series-desc').text().trim() || $('.entry-content p').first().text().trim(),
            info: {
                status: info['status'] || "",
                studio: info['studio'] || "",
                released: info['dirilis'] || info['released'] || "",
                duration: info['durasi'] || info['duration'] || "",
                season: info['musim'] || info['season'] || "",
                type: info['tipe'] || info['type'] || "",
                episodes: info['total episode'] || info['episodes'] || ""
            },
            genres: daftarGenre,
            episode_list: daftarEpisode.reverse()
        };

        res.json(responsSukses({ detail: detailData }));

    } catch (kesalahan) {
        console.error(`Kesalahan pada scraping detail Anoboy: ${kesalahan.message}`);
        res.status(500).json({ status: "error", creator: "Yamadaverse", source: "Anoboy", message: kesalahan.message });
    }
});

/**
 * GET /anime/anoboy/episode/:slug
 * Mengambil detail episode serta kandidat link stream/iframe.
 */
rute.get('/episode/:slug', async (req, res) => {
    const slug = req.params.slug;
    const urlEpisode = `${URL_DASAR}${slug}`;

    try {
        const html = await permintaan(urlEpisode);
        if (!html || html.includes('404')) {
            return res.status(503).json(responsSukses({
                title: "Episode Tidak Ditemukan",
                streams: [],
                downloads: []
            }));
        }

        const $ = cheerio.load(html);

        const judul = $('.entry-title').text().trim() ||
            $('h1.entry-title').text().trim() ||
            slug.replace(/-/g, ' ');

        const daftarStream = [];
        const sumberIframeUtama = $('#mediaplayer iframe').attr('src') ||
            $('.player-area iframe').attr('src') ||
            $('#embed_holder iframe').attr('src');

        if (sumberIframeUtama) {
            daftarStream.push({
                name: "Stream Utama",
                url: sumberIframeUtama
            });
        }

        const daftarUnduhan = [];

        const dataRespons = {
            title: judul,
            streams: daftarStream,
            downloads: daftarUnduhan
        };

        res.json(responsSukses(dataRespons));

    } catch (kesalahan) {
        console.error(`Kesalahan pada scraping episode Anoboy: ${kesalahan.message}`);
        res.status(500).json({ status: "error", creator: "Yamadaverse", source: "Anoboy", message: kesalahan.message });
    }
});

// Placeholder endpoint pencarian ketika implementasi sumber belum diaktifkan penuh.
rute.get('/search/:keyword', (req, res) => res.json(responsSukses({ msg: `Placeholder Pencarian Anoboy untuk ${req.params.keyword}` })));
// Placeholder endpoint detail fallback.
rute.get('/anime/:slug', (req, res) => res.json(responsSukses({ msg: `Placeholder Detail Anoboy untuk ${req.params.slug}` })));

export default rute;
