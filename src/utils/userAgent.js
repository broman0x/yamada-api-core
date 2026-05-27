/**
 * Pool User-Agent untuk randomisasi request scraping.
 * Randomisasi ini membantu mengurangi blokir sederhana berbasis fingerprint UA tunggal.
 */
const daftarUserAgent = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
];

export const dapatkanUserAgentAcak = () => {
    // Pilih satu UA secara acak pada setiap pemanggilan.
    return daftarUserAgent[Math.floor(Math.random() * daftarUserAgent.length)];
};
