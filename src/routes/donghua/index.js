/**
 * Route scraper Donghua (sumber: anichin.cafe).
 *
 * Cakupan:
 * - home release
 * - detail seri + episode list
 * - search by keyword
 * - detail episode + daftar server/tautan unduhan
 */
import express from 'express';
import * as cheerio from 'cheerio';
import { permintaan } from '../../utils/request.js';
import { middlewareCache } from '../../middleware/cache.js';
import { pembatasPencarian } from '../../middleware/rateLimit.js';

const rute = express.Router();
const URL_DASAR = 'https://anichin.cafe/';

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
        const bagian = url.replace(/\/$/, "").split('/');
        return bagian[bagian.length - 1];
    } catch (e) {
        return "";
    }
};

// Deteksi resolusi berdasarkan label server/teks kualitas.
const deteksiResolusi = (teks) => {
    if (!teks) return "HD";
    const t = teks.toLowerCase();
    if (t.includes('4k') || t.includes('2160p')) return "4K";
    if (t.includes('1080p') || t.includes('fhd')) return "1080p";
    if (t.includes('720p') || t.includes('hd')) return "720p";
    if (t.includes('480p') || t.includes('sd')) return "480p";
    if (t.includes('360p')) return "360p";
    return "HD";
};

const bersihkanTeksInfo = (teks) => teks ? teks.replace(/\s+/g, ' ').trim() : "";

// Helper alternatif untuk parsing detail seri jika diperlukan oleh route lain.
const ambilDanUraiDetailDonghua = async (slug) => {
    let url = `${URL_DASAR}${slug}/`;

    const html = await permintaan(url);
    if (!html) return null;

    const $$ = cheerio.load(html);

    const petaInfo = {};
    const areaInfo = $$('.infox .spe');

    areaInfo.find('span').each((i, el) => {
        const teks = $$(el).text();
        const [kunci, ...nilai] = teks.split(':');
        if (kunci && nilai.length > 0) {
            petaInfo[kunci.trim()] = nilai.join(':').trim();
        }
    });

    const detail = {
        title: $$('.entry-title').text().trim(),
        slug: slug,
        url: url,
        poster: $$('.thumb img').attr('src') || "",
        type: petaInfo['Type'] || petaInfo['Tipe'] || "Donghua",
        released: petaInfo['Released'] || petaInfo['Tayang'] || "",
        uploader: petaInfo['Uploader'] || ""
    };

    const daftar_episode = [];
    const pemilihEpisode = [
        '#content .eplister ul li',
        '.bixbox.epcheck .eplister ul li',
        '.bxcl.epcheck ul li',
        '.inepcx ul li',
        '.bxcl ul li',
        '.eplister ul li',
        '#chapterlist ul li',
        '.lstepsiode ul li'
    ];

    let elemenTerpilih = null;
    for (const pemilih of pemilihEpisode) {
        const elemen = $$(pemilih);
        if (elemen.length > 0) {
            elemenTerpilih = elemen;
            break;
        }
    }

    if (elemenTerpilih) {
        elemenTerpilih.each((i, el) => {
            const tautan = $$(el).find('a');
            daftar_episode.push({
                episode: tautan.find('.epl-num').text().trim() || tautan.text().trim(),
                slug: ekstrakSlug(tautan.attr('href')),
                url: tautan.attr('href')
            });
        });
    }

    detail.episodes_list = daftar_episode;

    return detail;
};

rute.get('/home/:page?', middlewareCache(180), async (req, res) => {
    /**
     * GET /donghua/home/:page?
     * Mengambil rilisan terbaru donghua pada halaman tertentu.
     */
    const halaman = req.params.page || 1;
    const url = halaman > 1 ? `${URL_DASAR}page/${halaman}/` : URL_DASAR;

    try {
        const html = await permintaan(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia: Gagal mengambil konten." });
        const $ = cheerio.load(html);

        const rilisan_terbaru = [];

        $('.listupd .bs').each((i, el) => {
            const tautan = $(el).find('a');
            const poster = $(el).find('img').attr('src');
            const judul = $(el).find('.tt').text().trim();
            const infoEpisode = $(el).find('.epx').text().trim();

            if (judul && tautan.attr('href')) {
                rilisan_terbaru.push({
                    title: judul,
                    slug: ekstrakSlug(tautan.attr('href')),
                    poster: poster || "",
                    status: "Ongoing",
                    url: tautan.attr('href'),
                    type: "Donghua",
                    current_episode: infoEpisode || "Ep N/A"
                });
            }
        });

        res.json(responsSukses({ latest_release: rilisan_terbaru }));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /donghua/detail/:slug
 * Mengambil metadata seri, genre, dan daftar episode.
 * Endpoint ini memiliki fallback tambahan bila URL yang dibuka ternyata halaman episode.
 */
rute.get('/detail/:slug', middlewareCache(300), async (req, res) => {
    try {
        const url = `${URL_DASAR}${req.params.slug}/`;
        const html = await permintaan(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });
        const $ = cheerio.load(html);

        const info = {};
        $('.infox .spe span').each((i, el) => {
            const teks = $(el).text();
            const [k, ...v] = teks.split(':');
            if (k) info[k.trim()] = bersihkanTeksInfo(v.join(':'));
        });

        const genre_list = [];
        $('.genxed a').each((i, el) => {
            genre_list.push({
                name: $(el).text().trim(),
                slug: ekstrakSlug($(el).attr('href')),
                url: $(el).attr('href')
            });
        });

        const daftar_episode = [];
        const pemilihEpisode = [
            '#content .eplister ul li',
            '.bixbox.epcheck .eplister ul li',
            '.bxcl.epcheck ul li',
            '.inepcx ul li',
            '.bxcl ul li',
            '.eplister ul li',
            '#chapterlist ul li',
            '.lstepsiode ul li'
        ];
        let elemenTerpilih = null;
        for (const pemilih of pemilihEpisode) {
            const elemen = $(pemilih);
            if (elemen.length > 0) {
                elemenTerpilih = elemen;
                break;
            }
        }

        let $aktif = $;
        if (!elemenTerpilih || elemenTerpilih.length === 0) {
            let tautanSeri = null;

            const tautanSeriBreadcrumb = $('.ts-breadcrumb ol li:nth-child(2) a');
            if (tautanSeriBreadcrumb.length > 0) {
                tautanSeri = tautanSeriBreadcrumb.attr('href');
                console.log(`[Detail Donghua] Menemukan tautan seri dari breadcrumb: ${tautanSeri}`);
            }

            if (!tautanSeri) {
                const tautanSemuaEpisode = $('.naveps .nvs.nvsc a, .nvs a:contains("All Episodes")');
                if (tautanSemuaEpisode.length > 0) {
                    tautanSeri = tautanSemuaEpisode.first().attr('href');
                    console.log(`[Detail Donghua] Menemukan tautan seri dari tombol Semua Episode: ${tautanSeri}`);
                }
            }

            if (!tautanSeri) {
                const tautanMeta = $('.item.meta .lm span.year a');
                if (tautanMeta.length > 0) {
                    tautanSeri = tautanMeta.attr('href');
                    console.log(`[Detail Donghua] Menemukan tautan seri dari meta: ${tautanSeri}`);
                }
            }

            if (!tautanSeri) {
                $('a').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.includes('/donghua/') && !href.includes('episode')) {
                        tautanSeri = href;
                        console.log(`[Detail Donghua] Menemukan tautan seri dari fallback: ${tautanSeri}`);
                        return false;
                    }
                });
            }

            if (tautanSeri) {
                console.log(`[Detail Donghua] Halaman episode terdeteksi, mengambil seri dari: ${tautanSeri}`);
                const htmlSeri = await permintaan(tautanSeri);
                if (htmlSeri) {
                    const $seri = cheerio.load(htmlSeri);
                    $aktif = $seri;

                    for (const pemilih of pemilihEpisode) {
                        const elemen = $seri(pemilih);
                        if (elemen.length > 0) {
                            elemenTerpilih = elemen;
                            const infoSeri = {};
                            $seri('.infox .spe span').each((i, el) => {
                                const teks = $seri(el).text();
                                const [k, ...v] = teks.split(':');
                                if (k) infoSeri[k.trim()] = bersihkanTeksInfo(v.join(':'));
                            });

                            Object.assign(info, infoSeri);

                            genre_list.length = 0;
                            $seri('.genxed a').each((i, el) => {
                                genre_list.push({
                                    name: $seri(el).text().trim(),
                                    slug: ekstrakSlug($seri(el).attr('href')),
                                    url: $seri(el).attr('href')
                                });
                            });

                            console.log(`[Detail Donghua] Menemukan ${elemen.length} episode dari halaman seri`);
                            break;
                        }
                    }
                }
            }
        }

        if (elemenTerpilih) {
            elemenTerpilih.each((i, el) => {
                const tautan = $aktif(el).find('a');
                const urlMentah = tautan.attr('href');
                let judulMentah = tautan.find('.epl-num').text().trim() || tautan.text().trim();

                const judulSeri = $aktif('.entry-title').text().trim();
                if (judulSeri) {
                    judulMentah = judulMentah.replace(judulSeri, "").trim();
                }
                judulMentah = judulMentah.replace(/Subtitle Indonesia/gi, "")
                    .replace(/Sub Indo/gi, "")
                    .replace(/Donghua/gi, "")
                    .replace(/-/g, " ")
                    .trim();

                if (/^\d+$/.test(judulMentah)) {
                    judulMentah = `Episode ${judulMentah}`;
                }

                const slug = ekstrakSlug(urlMentah);

                if (urlMentah && slug) {
                    daftar_episode.push({
                        episode: judulMentah,
                        slug: slug,
                        url: urlMentah,
                        date: tautan.find('.epl-date').text().trim()
                    });
                }
            });
        }

        const dataDetail = {
            status: info['Status'] || "",
            title: $('.entry-title').text().trim(),
            alter_title: info['Alternative Titles'] || "",
            poster: $('.thumb img').attr('src') || "",
            rating: info['Rating'] || "",
            studio: info['Studio'] || "",
            released: info['Released'] || info['Tayang'] || "",
            type: info['Type'] || info['Tipe'] || "Donghua",
            episodes_count: info['Total Episodes'] || "",
            genres: genre_list,
            synopsis: bersihkanTeksInfo($('.entry-content p').text()),
            episodes_list: daftar_episode
        };

        res.json(responsSukses(dataDetail));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /donghua/search/:keyword
 * Pencarian judul donghua berdasarkan kata kunci.
 */
rute.get('/search/:keyword', pembatasPencarian, middlewareCache(120), async (req, res) => {
    try {
        const kataKunci = req.params.keyword;
        const url = `${URL_DASAR}?s=${encodeURIComponent(kataKunci)}`;
        const html = await permintaan(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftar_hasil = [];

        $('.listupd .bs').each((i, el) => {
            const tautan = $(el).find('a');
            const poster = $(el).find('img').attr('src');
            const judul = $(el).find('.tt').text().trim();
            const infoEpisode = $(el).find('.epx').text().trim();

            if (judul && tautan.attr('href')) {
                daftar_hasil.push({
                    title: judul,
                    slug: ekstrakSlug(tautan.attr('href')),
                    poster: poster || "",
                    status: "Ongoing",
                    url: tautan.attr('href'),
                    type: "Donghua",
                    current_episode: infoEpisode || "Ep N/A"
                });
            }
        });

        res.json(responsSukses(daftar_hasil));
    } catch (kesalahan) {
        res.status(500).json({ error: kesalahan.message });
    }
});

/**
 * GET /donghua/episode/:slug
 * Mengambil detail episode, daftar server pemutar, dan tautan unduh jika tersedia.
 */
rute.get('/episode/:slug', middlewareCache(180), async (req, res) => {
    try {
        const url = `${URL_DASAR}${req.params.slug}/`;
        console.log(`[Episode Donghua] Mengambil: ${url}`);

        const html = await permintaan(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const judul = $('.entry-title').text().trim();
        console.log(`[Episode Donghua] Judul: ${judul}`);

        const fs = await import('fs');
        const petaResolusi = {};
        try {
            $('.announ').each((i, el) => {
                const teks = $(el).text();

                const penyedia = [
                    { key: 'Ok.ru', names: ['okru', 'ok.ru'] },
                    { key: 'Dailymotion', names: ['dailymotion'] },
                    { key: 'Rumble', names: ['rumble'] },
                    { key: 'Bstation', names: ['bstation', 'bilibili'] },
                    { key: 'Gdrive', names: ['gdrive', 'drive', 'google'] }
                ];

                penyedia.forEach(p => {
                    const regex = new RegExp(`${p.key}.{0,50}?([0-9]{3,4}p)`, 'i');
                    const kecocokan = teks.match(regex);
                    if (kecocokan && kecocokan[1]) {
                        p.names.forEach(n => {
                            petaResolusi[n] = kecocokan[1];
                        });
                        fs.appendFileSync('api_debug.log', `Memetakan ${p.key} ke ${kecocokan[1]} dari Pengumuman ${i}\n`);
                    }
                });
            });
        } catch (kesalahan) {
            fs.appendFileSync('api_debug.log', `Kesalahan: ${kesalahan.message}\n`);
            console.log(`[Episode Donghua] Kesalahan mengurai pengumuman: ${kesalahan.message}`);
        }

        const daftar_server = [];

        $('select.mirror option').each((i, el) => {
            const nilai = $(el).attr('value');
            const nama = $(el).text().trim();
            if (nilai && nilai !== "" && nilai.length > 10) {
                try {
                    const didekode = Buffer.from(nilai, 'base64').toString('utf-8');
                    console.log(`[Episode Donghua] Mendekode opsi ${i}: ${didekode.substring(0, 100)}...`);

                    const kecocokanSrc = didekode.match(/src=["']([^"']+)["']/);
                    if (kecocokanSrc && kecocokanSrc[1] && kecocokanSrc[1].startsWith('http')) {
                        const inputRes = `${nama} ${kecocokanSrc[1]}`;
                        let kualitas = deteksiResolusi(inputRes);

                        if (kualitas === "HD") {
                            const namaKecil = nama.toLowerCase();
                            for (const [kunci, val] of Object.entries(petaResolusi)) {
                                if (namaKecil.includes(kunci)) {
                                    kualitas = val;
                                    break;
                                }
                            }
                        }

                        daftar_server.push({
                            quality: kualitas,
                            title: nama || `Server ${i + 1}`,
                            url: kecocokanSrc[1]
                        });
                        console.log(`[Episode Donghua] Menambahkan server: ${nama} - ${kecocokanSrc[1]} (${kualitas})`);
                    }
                } catch (kesalahan) {
                    console.log(`[Episode Donghua] Gagal mendekode opsi ${i}: ${kesalahan.message}`);
                }
            }
        });
        console.log(`[Episode Donghua] Ditemukan ${daftar_server.length} server dari select.mirror`);

        if (daftar_server.length === 0) {
            $('select option').each((i, el) => {
                const nilai = $(el).attr('value');
                const nama = $(el).text().trim();
                if (nilai && nilai !== "" && nilai.length > 10) {
                    try {
                        let didekode = nilai;
                        if (!nilai.startsWith('http')) {
                            didekode = Buffer.from(nilai, 'base64').toString('utf-8');
                        }

                        if (didekode.includes('<iframe') || didekode.startsWith('http')) {
                            const kecocokanSrc = didekode.match(/src="([^"]+)"/);
                            const urlAkhir = kecocokanSrc ? kecocokanSrc[1] : didekode;
                            if (urlAkhir.startsWith('http')) {
                                const inputRes = `${nama} ${urlAkhir}`;
                                let kualitas = deteksiResolusi(inputRes);

                                if (kualitas === "HD") {
                                    const namaKecil = nama.toLowerCase();
                                    for (const [kunci, val] of Object.entries(petaResolusi)) {
                                        if (namaKecil.includes(kunci)) {
                                            kualitas = val;
                                            break;
                                        }
                                    }
                                }

                                daftar_server.push({
                                    quality: kualitas,
                                    title: nama || `Server ${i + 1}`,
                                    url: urlAkhir
                                });
                            }
                        }
                    } catch (kesalahan) {
                        console.log(`[Episode Donghua] Gagal mendekode opsi: ${kesalahan.message}`);
                    }
                }
            });
            console.log(`[Episode Donghua] Ditemukan ${daftar_server.length} server dari select umum`);
        }

        if (daftar_server.length === 0) {
            $('iframe').each((i, el) => {
                const src = $(el).attr('src');
                if (src && src.startsWith('http')) {
                    daftar_server.push({
                        quality: deteksiResolusi(`Iframe ${src}`),
                        title: `Iframe ${i + 1}`,
                        url: src
                    });
                }
            });
            console.log(`[Episode Donghua] Ditemukan ${daftar_server.length} server dari iframe`);
        }

        if (daftar_server.length === 0) {
            const iframeUtama = $('.player-area iframe').attr('src');
            if (iframeUtama) {
                daftar_server.push({ quality: "HD", title: "Default", url: iframeUtama });
                console.log(`[Episode Donghua] Ditemukan server dari iframe .player-area`);
            }
        }

        if (daftar_server.length === 0) {
            const wadahPemutar = [
                '#pembed iframe',
                '.embed-responsive iframe',
                '.video-container iframe',
                '#player iframe',
                '.pframe iframe'
            ];

            for (const pemilih of wadahPemutar) {
                const iframe = $(pemilih).attr('src');
                if (iframe && iframe.startsWith('http')) {
                    daftar_server.push({ quality: "HD", title: "Main Player", url: iframe });
                    console.log(`[Episode Donghua] Ditemukan server dari ${pemilih}`);
                    break;
                }
            }
        }

        const daftar_unduhan = [];
        $('.mctnx .soraurlx').each((i, el) => {
            const kualitas = $(el).find('strong').text().trim();
            const url = $(el).find('a').attr('href');
            if (kualitas && url) {
                daftar_unduhan.push({
                    quality: kualitas,
                    url: url
                });
            }
        });

        if (daftar_unduhan.length === 0) {
            $('.download-eps a, .soraddl a').each((i, el) => {
                const teks = $(el).text().trim();
                const url = $(el).attr('href');
                if (url && teks) {
                    daftar_unduhan.push({
                        quality: teks.includes('480') ? '480p' : teks.includes('720') ? '720p' : teks.includes('1080') ? '1080p' : 'SD',
                        url: url
                    });
                }
            });
        }

        const navigasi = {
            prev: ekstrakSlug($('div.naveps a[aria-label="prev"]').attr('href')) ||
                ekstrakSlug($('.prev-post a, .naveps a:contains("Prev")').attr('href')) || "",
            next: ekstrakSlug($('div.naveps a[aria-label="next"]').attr('href')) ||
                ekstrakSlug($('.next-post a, .naveps a:contains("Next")').attr('href')) || ""
        };

        console.log(`[Episode Donghua] Hasil akhir: ${daftar_server.length} server, ${daftar_unduhan.length} unduhan`);

        res.json(responsSukses({
            title: judul,
            streamUrl: daftar_server.length > 0 ? daftar_server[0].url : "",
            servers: daftar_server,
            downloads: daftar_unduhan,
            navigation: navigasi
        }));
    } catch (kesalahan) {
        console.error(`[Kesalahan Episode Donghua] ${kesalahan.message}`);
        res.status(500).json({ error: kesalahan.message });
    }
});

export default rute;
