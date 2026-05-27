import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const playgroundDir = path.resolve(__dirname, '../../playground/public');

const endpoints = [
    { group: 'Anime (Otakudesu)', method: 'GET', path: '/anime/home', name: 'Home Anime' },
    { group: 'Anime (Otakudesu)', method: 'GET', path: '/anime/schedule', name: 'Jadwal Anime' },
    { group: 'Anime (Otakudesu)', method: 'GET', path: '/anime/ongoing-anime?page=1', name: 'Ongoing Anime' },
    { group: 'Anime (Otakudesu)', method: 'GET', path: '/anime/complete-anime/1', name: 'Complete Anime Page' },
    { group: 'Anime (Otakudesu)', method: 'GET', path: '/anime/search/one-piece', name: 'Search Anime' },
    { group: 'Anime (Otakudesu)', method: 'GET', path: '/anime/anime/1piece-sub-indo', name: 'Detail Anime' },
    { group: 'Anime (Otakudesu)', method: 'GET', path: '/anime/episode/wpoiec-episode-1163-sub-indo', name: 'Detail Episode Anime' },
    { group: 'Donghua', method: 'GET', path: '/donghua/home/1', name: 'Home Donghua' },
    { group: 'Donghua', method: 'GET', path: '/donghua/search/battle', name: 'Search Donghua' },
    { group: 'Donghua', method: 'GET', path: '/donghua/detail/btth-season-5', name: 'Detail Donghua' },
    { group: 'Donghua', method: 'GET', path: '/donghua/episode/btth-season-5-episode-1', name: 'Detail Episode Donghua' },
    { group: 'Komiku', method: 'GET', path: '/komiku/home', name: 'Home Komiku' },
    { group: 'Komiku', method: 'GET', path: '/komiku/search?q=romance', name: 'Search Komiku' },
    { group: 'Komiku', method: 'GET', path: '/komiku/manga/one-piece', name: 'Detail Komik' },
    { group: 'Komiku', method: 'GET', path: '/komiku/chapter/one-piece-chapter-1', name: 'Detail Chapter' },
    { group: 'Anoboy', method: 'GET', path: '/anime/anoboy/home', name: 'Home Anoboy' },
    { group: 'Anoboy', method: 'GET', path: '/anime/anoboy/search/naruto', name: 'Search Anoboy' },
    { group: 'Anoboy', method: 'GET', path: '/anime/anoboy/anime/one-piece', name: 'Detail Anime Anoboy' },
    { group: 'Anoboy', method: 'GET', path: '/anime/anoboy/episode/one-piece-episode-1', name: 'Detail Episode Anoboy' },
    { group: 'Global Search', method: 'GET', path: '/search/romance', name: 'Search Global' }
];

router.use('/assets', express.static(playgroundDir, {
    maxAge: 0,
    etag: false,
    index: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
}));

router.get('/endpoints.json', (req, res) => {
    res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        endpoints
    });
});

router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(playgroundDir, 'index.html'));
});

export default router;
