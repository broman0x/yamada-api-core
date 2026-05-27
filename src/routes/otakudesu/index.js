/**
 * Route scraper Otakudesu.
 *
 * Modul ini menjadi sumber utama data anime:
 * - home, complete, ongoing, genre, schedule
 * - detail anime & detail episode
 * - search judul
 * - resolver server stream berbasis payload terenkripsi data-content
 */
import express from 'express';
import * as cheerio from 'cheerio';
import { permintaan } from '../../utils/request.js';
import { middlewareCache } from '../../middleware/cache.js';
import { pembatasPencarian, pembatasStreaming } from '../../middleware/rateLimit.js';

const rute = express.Router();
const URL_DASAR = 'https://otakudesu.blog/';

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

// Validasi sederhana untuk mendeteksi URL media playable langsung (mp4/m3u8/webm/ogg).
const apakahUrlMediaLangsung = (url) =>
    typeof url === 'string' &&
    /^https?:\/\//i.test(url) &&
    /\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(url);

// Fallback parser untuk mengekstrak direct media URL dari HTML embed player.
const ekstrakMediaLangsungDariHtml = (html) => {
    if (!html || typeof html !== 'string') return null;
    const $ = cheerio.load(html);

    const sumberVideo =
        $('video source').attr('src') ||
        $('video').attr('src') ||
        $('source').attr('src');
    if (sumberVideo && /^https?:\/\//i.test(sumberVideo)) {
        if (sumberVideo.includes('videoplayback') || sumberVideo.includes('expire=')) {
            return null;
        }
        return sumberVideo;
    }

    const teksScript = $('script')
        .map((_, el) => $(el).html() || '')
        .get()
        .join('\n')
        .replace(/\\\//g, '/');

    const regexMedia = /(https?:\/\/[^"'\\\s]+?\.(?:mp4|m3u8|webm|ogg)(?:\?[^"'\\\s]*)?)/ig;
    const kecocokan = regexMedia.exec(teksScript);
    if (kecocokan && kecocokan[1]) {
        if (kecocokan[1].includes('videoplayback') || kecocokan[1].includes('expire=')) {
            return null;
        }
        return kecocokan[1];
    }

    return null;
};

// Util pencarian elemen list dengan daftar selector fallback.
const cariItemDaftar = ($, daftarPemilih) => {
    let daftarItem = [];
    for (const pemilih of daftarPemilih) {
        const elemen = $(pemilih);
        if (elemen.length > 0) {
            elemen.each((i, el) => {
                const tautan = $(el).find('a').first();
                if (tautan.length > 0) {
                    daftarItem.push({
                        title: $(el).text().trim(),
                        link_text: tautan.text().trim(),
                        url: tautan.attr('href'),
                        thumb: $(el).find('img').attr('src'),
                        episode: $(el).find('.epz').text().trim(),
                        date: $(el).find('.newnime').text().trim(),
                    });
                }
            });
            if (daftarItem.length > 0) return daftarItem;
        }
    }
    return [];
};

/**
 * GET /anime/home
 * Mengambil blok ongoing + complete dari beranda Otakudesu.
 */
rute.get('/home', middlewareCache(300), async (req, res) => {
    try {
        const html = await permintaan(URL_DASAR);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const sedang_tayang = [];
        const tamat = [];

        const bagianSedangTayang = $('.venz').first();
        if (bagianSedangTayang.length > 0) {
            bagianSedangTayang.find('ul > li').each((i, el) => {
                sedang_tayang.push({
                    title: $(el).find('.jdlflm').text().trim() || $(el).find('a').text().trim(),
                    slug: ekstrakSlug($(el).find('a').attr('href')),
                    episode: $(el).find('.epz').text().trim(),
                    date: $(el).find('.newnime').text().trim(),
                    url: $(el).find('a').attr('href'),
                    thumb: $(el).find('img').attr('src')
                });
            });
        }

        let bagianTamat = $('.venz').eq(1);
        $('.venz').each((i, el) => {
            if ($(el).find('.rseries, h3').text().toLowerCase().includes('complete')) {
                bagianTamat = $(el);
            }
        });

        if (bagianTamat.length > 0) {
            bagianTamat.find('ul > li').each((i, el) => {
                tamat.push({
                    title: $(el).find('.jdlflm').text().trim() || $(el).find('a').text().trim(),
                    slug: ekstrakSlug($(el).find('a').attr('href')),
                    total_episodes: $(el).find('.epz').text().trim(),
                    rating: $(el).find('.epztipe').text().trim(),
                    date: $(el).find('.newnime').text().trim(),
                    url: $(el).find('a').attr('href'),
                    thumb: $(el).find('img').attr('src')
                });
            });
        }

        res.json(responsSukses({ ongoing: sedang_tayang, complete: tamat }));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/complete-anime/:page
 * Daftar anime tamat berdasarkan halaman.
 */
rute.get('/complete-anime/:page', middlewareCache(300), async (req, res) => {
    try {
        const html = await permintaan(`${URL_DASAR}/complete-anime/page/${req.params.page}/`);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });
        const $ = cheerio.load(html);
        const daftar = [];

        const daftarPemilih = ['.venz > ul > li', '.chivsrc > li', '.detpost'];

        let ditemukan = false;
        for (let pemilih of daftarPemilih) {
            const item = $(pemilih);
            if (item.length > 0) {
                ditemukan = true;
                item.each((i, el) => {
                    daftar.push({
                        title: $(el).find('.jdlflm').text().trim() || $(el).find('h2').text().trim(),
                        slug: ekstrakSlug($(el).find('a').attr('href')),
                        episode: $(el).find('.epz').text().trim(),
                        url: $(el).find('a').attr('href'),
                        thumb: $(el).find('img').attr('src')
                    });
                });
                if (daftar.length > 0) break;
            }
        }

        res.json(responsSukses(daftar));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/ongoing-anime?page=1
 * Daftar anime ongoing berdasarkan pagination query.
 */
rute.get('/ongoing-anime', middlewareCache(180), async (req, res) => {
    const halaman = req.query.page || 1;
    try {
        const html = await permintaan(`${URL_DASAR}/ongoing-anime/page/${halaman}/`);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });
        const $ = cheerio.load(html);
        const daftar = [];

        const daftarPemilih = ['.venz > ul > li', '.chivsrc > li', '.detpost'];

        for (let pemilih of daftarPemilih) {
            const item = $(pemilih);
            if (item.length > 0) {
                item.each((i, el) => {
                    daftar.push({
                        title: $(el).find('.jdlflm').text().trim() || $(el).find('h2').text().trim(),
                        slug: ekstrakSlug($(el).find('a').attr('href')),
                        episode: $(el).find('.epz').text().trim(),
                        url: $(el).find('a').attr('href'),
                        thumb: $(el).find('img').attr('src')
                    });
                });
                if (daftar.length > 0) break;
            }
        }
        res.json(responsSukses(daftar));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/genre
 * Mengambil daftar genre yang tersedia di Otakudesu.
 */
rute.get('/genre', middlewareCache(600), async (req, res) => {
    try {
        const html = await permintaan(`${URL_DASAR}/genre-list/`);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });
        const $ = cheerio.load(html);
        const daftarGenre = [];

        const terlihat = new Set();

        $('a[href*="/genres/"]').each((i, el) => {
            const nama = $(el).text().trim();
            const url = $(el).attr('href');
            if (nama && url && !terlihat.has(url)) {
                terlihat.add(url);
                daftarGenre.push({ name: nama, slug: ekstrakSlug(url), url });
            }
        });

        res.json(responsSukses(daftarGenre));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/genre/:slug?page=1
 * Daftar anime berdasarkan genre tertentu.
 */
rute.get('/genre/:slug', middlewareCache(300), async (req, res) => {
    const halaman = req.query.page || 1;
    try {
        const html = await permintaan(`${URL_DASAR}/genres/${req.params.slug}/page/${halaman}/`);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });
        const $ = cheerio.load(html);
        const daftar = [];

        if ($('.col-anime-con').length > 0) {
            $('.col-anime-con').each((i, el) => {
                daftar.push({
                    title: $(el).find('.col-anime-title a').text().trim(),
                    slug: ekstrakSlug($(el).find('.col-anime-title a').attr('href')),
                    url: $(el).find('.col-anime-title a').attr('href'),
                    thumb: $(el).find('.col-anime-cover img').attr('src'),
                    rating: $(el).find('.col-anime-rating').text().trim()
                });
            });
        } else {
            $('.venz > ul > li, .chivsrc > li').each((i, el) => {
                daftar.push({
                    title: $(el).find('.jdlflm').text().trim() || $(el).find('h2').text().trim(),
                    slug: ekstrakSlug($(el).find('a').attr('href')),
                    url: $(el).find('a').attr('href'),
                    thumb: $(el).find('img').attr('src'),
                    rating: $(el).find('.epztipe').text().trim()
                });
            });
        }
        res.json(responsSukses(daftar));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/schedule
 * Mengambil jadwal rilis mingguan anime.
 */
rute.get('/schedule', middlewareCache(300), async (req, res) => {
    try {
        const html = await permintaan(`${URL_DASAR}/jadwal-rilis/`);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia: Gagal mengambil konten." });
        const $ = cheerio.load(html);
        const dataJadwal = [];

        const hariPotensial = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

        $('h2').each((i, el) => {
            const teksHari = $(el).text().trim();
            if (hariPotensial.some(d => teksHari.includes(d))) {
                const daftar_anime = [];

                let ulBerikutnya = $(el).next('ul');
                if (ulBerikutnya.length === 0) {
                    ulBerikutnya = $(el).next('div').find('ul');
                }
                if (ulBerikutnya.length === 0) {
                    ulBerikutnya = $(el).parent().find('ul');
                }

                ulBerikutnya.find('li').each((j, item) => {
                    const tautan = $(item).find('a');
                    if (tautan.length > 0) {
                        daftar_anime.push({
                            anime_name: tautan.text().trim(),
                            url: tautan.attr('href'),
                            slug: ekstrakSlug(tautan.attr('href')),
                            poster: ""
                        });
                    }
                });

                if (daftar_anime.length > 0) {
                    dataJadwal.push({
                        day: teksHari,
                        anime_list: daftar_anime
                    });
                }
            }
        });

        res.json(responsSukses(dataJadwal));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/unlimited
 * Daftar alfabetis/all-anime (cache panjang karena berubah relatif lambat).
 */
rute.get('/unlimited', middlewareCache(86400), async (req, res) => {
    try {
        const html = await permintaan(`${URL_DASAR}/anime-list/`);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const hasil = [];
        const grup = {};

        const wadah = $('#abtext, .venz, .post-content').first();

        wadah.find('a').each((i, el) => {
            const url = $(el).attr('href');
            if (!url || !url.includes('/anime/')) return;

            const judul = $(el).text().trim();
            if (!judul) return;

            if (judul.length <= 1) return;

            const karakter = judul.charAt(0).toUpperCase();

            const karakterGrup = /[A-Z]/.test(karakter) ? karakter : '#';

            if (!grup[karakterGrup]) {
                grup[karakterGrup] = [];
            }

            if (!grup[karakterGrup].some(item => item.url === url)) {
                grup[karakterGrup].push({
                    title: judul,
                    url: url,
                    slug: ekstrakSlug(url)
                });
            }
        });

        const kunciTerurut = Object.keys(grup).sort();

        for (const kunci of kunciTerurut) {
            hasil.push({
                char: kunci,
                items: grup[kunci]
            });
        }

        res.json(responsSukses(hasil));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/anime/:slug
 * Detail metadata anime + daftar episode.
 */
rute.get('/anime/:slug', middlewareCache(600), async (req, res) => {
    try {
        const html = await permintaan(`${URL_DASAR}/anime/${req.params.slug}/`);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia: Gagal mengambil konten." });

        const $ = cheerio.load(html);
        const info = {};
        $('.infozingle p').each((i, el) => {
            const teks = $(el).text();
            const [k, ...v] = teks.split(':');
            if (k && v.length > 0) info[k.trim().toLowerCase().replace(/\s/g, '_')] = v.join(':').trim();
        });

        const daftar_episode = [];
        $('.episodelist ul li').each((i, el) => {
            const tautan = $(el).find('a');
            daftar_episode.push({
                title: tautan.text().trim(),
                slug: ekstrakSlug(tautan.attr('href')),
                url: tautan.attr('href'),
                date: $(el).find('.zeebr').text().trim()
            });
        });

        const dataDetail = {
            title: $('.jdlrx h1').text().trim(),
            thumb: $('.fotoanime img').attr('src'),
            synopsis: $('.sinopc').text().trim(),
            info,
            episodes: daftar_episode
        };
        res.json(responsSukses(dataDetail));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/episode/:slug
 * Detail episode dan kandidat server stream/download.
 */
rute.get('/episode/:slug', middlewareCache(180), async (req, res) => {
    try {
        const urlEpisode = `${URL_DASAR}/episode/${req.params.slug}/`;
        console.log(`[Episode OtakuDesu] Mengambil: ${urlEpisode}`);

        const htmlEpisode = await permintaan(urlEpisode);
        if (!htmlEpisode) return res.status(503).json({ error: "Layanan Tidak Tersedia: Gagal mengambil konten episode." });

        const $ = cheerio.load(htmlEpisode);
        const judul = $('.venutama h1').text().trim();
        console.log(`[Episode OtakuDesu] Judul: ${judul}`);

        const urlStreamUtama = $('.responsive-embed-stream iframe').attr('src');

        const server_berdasarkan_kualitas = {};

        const dekodeKontenData = (base64) => {
            try {
                const didekode = Buffer.from(base64, 'base64').toString('utf-8');
                return JSON.parse(didekode);
            } catch (e) {
                return null;
            }
        };

        const daftarKualitas = ['360p', '480p', '720p', '1080p'];
        const divMirrorStream = $('.mirrorstream');

        if (divMirrorStream.length > 0) {
            daftarKualitas.forEach(kualitas => {
                const kelasKualitas = `m${kualitas}`;
                const listKualitas = divMirrorStream.find(`ul.${kelasKualitas}`);

                if (listKualitas.length > 0) {
                    server_berdasarkan_kualitas[kualitas] = [];

                    listKualitas.find('li a').each((i, el) => {
                        const namaServer = $(el).text().trim();
                        const kontenData = $(el).attr('data-content');
                        const adalahBawaan = $(el).attr('data-default') === 'true';

                        const SERVER_DIBLOKIR = ['filedon', 'mega'];
                        if (SERVER_DIBLOKIR.includes(namaServer.toLowerCase())) {
                            return;
                        }

                        if (kontenData && namaServer) {
                            const didekode = dekodeKontenData(kontenData);

                            server_berdasarkan_kualitas[kualitas].push({
                                name: namaServer,
                                data_content: kontenData,
                                is_default: adalahBawaan,
                                decoded_info: didekode
                            });
                        }
                    });

                    if (server_berdasarkan_kualitas[kualitas].length === 0) {
                        delete server_berdasarkan_kualitas[kualitas];
                    }
                }
            });
        }

        if (Object.keys(server_berdasarkan_kualitas).length === 0 && !urlStreamUtama) {
            console.log('[Episode OtakuDesu] Tidak ada server ditemukan via .mirrorstream, mencoba cadangan iframe...');

            const pemilihCadangan = [
                '.responsive-embed-stream iframe',
                '#pembed iframe',
                '.player-embed iframe',
                '.video-content iframe',
                'iframe[src*="stream"]',
                'iframe[src*="player"]'
            ];

            for (const pemilih of pemilihCadangan) {
                const iframe = $(pemilih).attr('src');
                if (iframe && iframe.startsWith('http')) {
                    console.log(`[Episode OtakuDesu] Menemukan iframe dari ${pemilih}: ${iframe}`);
                    server_berdasarkan_kualitas['HD'] = [{
                        name: 'Main Player',
                        data_content: iframe,
                        is_default: true,
                        decoded_info: null
                    }];
                    break;
                }
            }

            if (Object.keys(server_berdasarkan_kualitas).length === 0) {
                $('iframe').each((i, el) => {
                    const src = $(el).attr('src');
                    if (src && src.startsWith('http')) {
                        console.log(`[Episode OtakuDesu] Menemukan iframe umum ${i}: ${src}`);
                        if (!server_berdasarkan_kualitas['HD']) server_berdasarkan_kualitas['HD'] = [];
                        server_berdasarkan_kualitas['HD'].push({
                            name: `Server ${i + 1}`,
                            data_content: src,
                            is_default: i === 0,
                            decoded_info: null
                        });
                    }
                });
            }
        }

        if (Object.keys(server_berdasarkan_kualitas).length === 0 && urlStreamUtama) {
            server_berdasarkan_kualitas['HD'] = [{
                name: 'Default Server',
                data_content: urlStreamUtama,
                is_default: true,
                decoded_info: null
            }];
        }

        console.log(`[Episode OtakuDesu] Server akhir ditemukan: ${Object.keys(server_berdasarkan_kualitas).length} kualitas`);

        const tautanSebelumnya = $('.flir a[href*="/episode/"]').filter((i, el) => $(el).text().toLowerCase().includes('prev')).attr('href');
        const tautanBerikutnya = $('.flir a[href*="/episode/"]').filter((i, el) => $(el).text().toLowerCase().includes('next')).attr('href');

        const navigasi = {
            prev: ekstrakSlug(tautanSebelumnya),
            next: ekstrakSlug(tautanBerikutnya)
        };

        const tautanDetail = $('.prevnext .flir a[href*="/anime/"]').attr('href');
        const animeId = ekstrakSlug(tautanDetail);

        const dataUnduhan = { formats: [] };
        $('.download ul li').each((i, el) => {
            const namaKualitas = $(el).find('strong').text().trim();
            const daftarTautan = [];
            $(el).find('a').each((j, link) => {
                daftarTautan.push({ title: $(link).text().trim(), url: $(link).attr('href') });
            });
            dataUnduhan.formats.push({ title: namaKualitas, qualities: [{ urls: daftarTautan }] });
        });

        let urlStream = urlStreamUtama;
        if (!urlStream && Object.keys(server_berdasarkan_kualitas).length > 0) {
            for (const kualitas of Object.keys(server_berdasarkan_kualitas)) {
                const serverBawaan = server_berdasarkan_kualitas[kualitas].find(s => s.is_default);
                if (serverBawaan) {
                    urlStream = serverBawaan.data_content;
                    break;
                }
            }
            if (!urlStream) {
                const kualitasPertama = Object.keys(server_berdasarkan_kualitas)[0];
                urlStream = server_berdasarkan_kualitas[kualitasPertama][0]?.data_content || "";
            }
        }

        const dataRespons = {
            title: judul,
            animeId,
            episodeSlug: req.params.slug,
            streamUrl: urlStream,
            servers_by_quality: server_berdasarkan_kualitas,
            downloadUrl: dataUnduhan,
            navigation: navigasi
        };

        res.json(responsSukses(dataRespons));

    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/search/:keyword
 * Pencarian anime berdasarkan kata kunci.
 */
rute.get('/search/:keyword', pembatasPencarian, middlewareCache(120), async (req, res) => {
    try {
        const url = `${URL_DASAR}?s=${encodeURIComponent(req.params.keyword)}&post_type=anime`;
        const html = await permintaan(url);
        if (!html) return res.status(503).json({ error: "Layanan Tidak Tersedia" });

        const $ = cheerio.load(html);
        const daftarHasil = [];
        $('ul.chivsrc > li').each((i, el) => {
            daftarHasil.push({
                title: $(el).find('h2 a').text().trim(),
                slug: ekstrakSlug($(el).find('h2 a').attr('href')),
                url: $(el).find('h2 a').attr('href'),
                thumb: $(el).find('img').attr('src'),
                status: $(el).find('.set').text().match(/Status\s*:\s*([A-Za-z]+)/)?.[1]
            });
        });
        res.json(responsSukses(daftarHasil));
    } catch (kesalahan) { res.status(500).json({ error: kesalahan.message }); }
});

/**
 * GET /anime/server/:dataContent
 * Resolver data-content dari daftar server menjadi URL stream final.
 */
rute.get('/server/:dataContent', pembatasStreaming, async (req, res) => {
    try {
        const kontenData = req.params.dataContent;

        let dataDidekode;
        try {
            const didekode = Buffer.from(kontenData, 'base64').toString('utf-8');
            dataDidekode = JSON.parse(didekode);
        } catch (e) {
            return res.status(400).json({
                status: "error",
                error: "Format data-content tidak valid"
            });
        }

        const urlAjax = `${URL_DASAR}wp-admin/admin-ajax.php`;

        const bodiFormNonce = new URLSearchParams({
            action: 'aa1208d27f29ca340c92c66d1926f13f'
        }).toString();

        const responsNonce = await permintaan(urlAjax, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: bodiFormNonce
        });

        if (!responsNonce) {
            return res.status(503).json({
                status: "error",
                error: "Gagal mengambil nonce dari Otakudesu"
            });
        }

        let nonce;
        try {
            const dataNonce = typeof responsNonce === 'string' ? JSON.parse(responsNonce) : responsNonce;
            nonce = dataNonce.data;
        } catch (e) {
            return res.status(503).json({
                status: "error",
                error: "Gagal mengurai respons nonce",
                details: e.message
            });
        }

        if (!nonce) {
            return res.status(503).json({
                status: "error",
                error: "Nonce tidak ditemukan dalam respons"
            });
        }

        const bodiFormPemutar = new URLSearchParams({
            action: '2a3505c93b0035d3f455df82bf976b84',
            nonce: nonce,
            id: dataDidekode.id.toString(),
            i: dataDidekode.i.toString(),
            q: dataDidekode.q
        }).toString();

        const responsPemutar = await permintaan(urlAjax, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: bodiFormPemutar
        });

        if (!responsPemutar) {
            return res.status(503).json({
                status: "error",
                error: "Gagal mengambil iframe pemutar dari Otakudesu"
            });
        }

        let sumberIframe;
        try {
            const dataPemutar = typeof responsPemutar === 'string' ? JSON.parse(responsPemutar) : responsPemutar;

            const htmlIframe = Buffer.from(dataPemutar.data, 'base64').toString('utf-8');

            const $ = cheerio.load(htmlIframe);
            sumberIframe = $('iframe').attr('src');
        } catch (e) {
            return res.status(503).json({
                status: "error",
                error: "Gagal mengurai respons pemutar",
                details: e.message
            });
        }

        if (sumberIframe) {
            let urlTerurai = sumberIframe;

            if (!apakahUrlMediaLangsung(sumberIframe)) {
                try {
                    const htmlIframe = await permintaan(sumberIframe, {
                        headers: {
                            'Referer': URL_DASAR
                        }
                    });
                    const urlLangsung = ekstrakMediaLangsungDariHtml(htmlIframe);
                    if (urlLangsung) {
                        urlTerurai = urlLangsung;
                    }
                } catch (err) {
                    // Simpan URL iframe sebagai cadangan
                }
            }

            res.json({
                status: "success",
                creator: "Yamadaverse",
                url: urlTerurai,
                original_iframe_url: sumberIframe,
                quality: dataDidekode.q,
                server_info: {
                    id: dataDidekode.id,
                    index: dataDidekode.i,
                    quality: dataDidekode.q
                }
            });
        } else {
            res.status(404).json({
                status: "error",
                error: "URL Iframe tidak ditemukan dalam respons yang didekode"
            });
        }
    } catch (kesalahan) {
        res.status(500).json({
            status: "error",
            error: kesalahan.message
        });
    }
});

export default rute;
