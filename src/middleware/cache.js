/**
 * Middleware cache in-memory berbasis node-cache.
 *
 * Tujuan:
 * - Mengurangi beban scraping ke situs sumber.
 * - Menurunkan latency untuk request GET yang sama.
 * - Menyediakan util invalidasi cache saat data perlu dipaksa refresh.
 */
import NodeCache from 'node-cache';

const penyimpananCache = new NodeCache({
    stdTTL: 300,
    checkperiod: 60,
    useClones: false,
    deleteOnExpire: true,
    maxKeys: 1000
});

export const middlewareCache = (durasi = 300) => {
    return (req, res, next) => {
        // Hanya GET yang di-cache agar aman terhadap request mutasi data.
        if (req.method !== 'GET') {
            return next();
        }

        // URL request dipakai sebagai cache key agar query/path unik tetap terpisah.
        const kunci = req.originalUrl || req.url;
        const responsDisimpan = penyimpananCache.get(kunci);

        if (responsDisimpan) {
            console.log(`[Cache] TEPAT: ${kunci}`);
            return res.json(responsDisimpan);
        }

        // Monkey-patch res.json: respons pertama kali sukses akan otomatis disimpan.
        const jsonAsli = res.json.bind(res);
        res.json = (bodi) => {
            penyimpananCache.set(kunci, bodi, durasi);
            console.log(`[Cache] SIMPAN: ${kunci} (${durasi}d)`);
            return jsonAsli(bodi);
        };

        next();
    };
};

export const hapusCache = (pola) => {
    // Jika pola diberikan, hanya key yang match pola yang dihapus (invalidasi parsial).
    if (pola) {
        const daftarKunci = penyimpananCache.keys();
        daftarKunci.forEach(kunci => {
            if (kunci.includes(pola)) {
                penyimpananCache.del(kunci);
            }
        });
    } else {
        // Tanpa pola -> flush total.
        penyimpananCache.flushAll();
    }
};

export default penyimpananCache;
