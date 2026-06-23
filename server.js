const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Headers de base pour simuler un vrai navigateur
const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
    'Connection': 'keep-alive'
};

// ==========================================
// FONCTIONS DE TÉLÉCHARGEMENT (Scraping Bypass)
// ==========================================

function extractMp4FromHtml(html) {
    const $ = cheerio.load(html);
    let videoSrc = $('video source').attr('src') || $('video').attr('src') || $('a[download]').attr('href') || $('a.btn-primary').attr('href');
    if (videoSrc) return videoSrc.startsWith('http') ? videoSrc : 'https:' + videoSrc;
    
    const jsonMatch = html.match(/"video_url"\s*:\s*"(https?:[^"]+)"/) || 
                      html.match(/"downloadLink"\s*:\s*"(https?:[^"]+)"/) ||
                      html.match(/"url"\s*:\s*"(https?:[^"]*\.mp4[^"]*)"/);
    if (jsonMatch) return jsonMatch[1].replace(/\\u002F/g, '/');
    
    return null;
}

// 1. SaveFrom / SSYoutube (Youtube, Facebook, Instagram)
async function trySaveFrom(url) {
    const res = await axios.post('https://sfdownload.com/get', 
        new URLSearchParams({ sf_url: url, sf_submit: '' }).toString(), 
        { 
            headers: { 
                ...baseHeaders,
                'Origin': 'https://en.savefrom.net',
                'Referer': 'https://en.savefrom.net/',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded'
            } 
        }
    );
    if (res.data && res.data.url) {
        const $ = cheerio.load(res.data.url);
        const link = $('a.download_link').attr('href') || $('a.link').attr('href');
        if (link) return { url: link, title: 'Média via SaveFrom', author: 'SlimeSc Network' };
    }
    throw new Error('SaveFrom échec');
}

// 2. FastDL (Instagram)
async function tryFastDL(url) {
    const res = await axios.post('https://fastdl.app/api/ajaxSearch', 
        new URLSearchParams({ url, lang: 'en' }).toString(), 
        { 
            headers: { 
                ...baseHeaders,
                'Origin': 'https://fastdl.app',
                'Referer': 'https://fastdl.app/',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded'
            } 
        }
    );
    if (res.data && res.data.status === 'ok' && res.data.data) {
        const link = extractMp4FromHtml(res.data.data);
        if (link) return { url: link, title: 'Instagram via FastDL', author: 'SlimeSc' };
    }
    throw new Error('FastDL échec');
}

// 3. FDown (Facebook)
async function tryFDown(url) {
    const res = await axios.post('https://fdown.net/download.php', 
        new URLSearchParams({ URLz: url }).toString(), 
        { 
            headers: { 
                ...baseHeaders,
                'Origin': 'https://fdown.net',
                'Referer': 'https://fdown.net/',
                'Content-Type': 'application/x-www-form-urlencoded'
            } 
        }
    );
    const link = extractMp4FromHtml(res.data);
    if (link) return { url: link, title: 'Facebook via FDown', author: 'SlimeSc' };
    throw new Error('FDown échec');
}

// 4. Vdfr (Snapchat)
async function tryVdfr(url) {
    const res = await axios.post('https://vdfr.app/api/ajaxSearch', 
        new URLSearchParams({ url, lang: 'en' }).toString(), 
        { 
            headers: { 
                ...baseHeaders,
                'Origin': 'https://vdfr.app',
                'Referer': 'https://vdfr.app/',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded'
            } 
        }
    );
    if (res.data && res.data.data) {
        const link = extractMp4FromHtml(res.data.data);
        if (link) return { url: link, title: 'Snapchat via Vdfr', author: 'SlimeSc' };
    }
    throw new Error('Vdfr échec');
}

// 5. Cobalt (Multi-plateformes)
async function tryCobalt(url, format, quality) {
    const payload = { url, vQuality: quality.replace('p', ''), vFormat: format === 'mp3' ? 'mp3' : 'mp4', aFormat: 'mp3' };
    const res = await axios.post('https://api.cobalt.tools/api/json', payload, { 
        headers: { ...baseHeaders, 'Content-Type': 'application/json', 'Accept': 'application/json' } 
    });
    if (res.data && (res.data.status === 'redirect' || res.data.status === 'stream') && res.data.url) {
        return { url: res.data.url, title: 'Média via Cobalt', author: 'SlimeSc Network' };
    }
    throw new Error('Cobalt échec');
}

// 6. TikWM (TikTok/Insta)
async function tryTikWM(url, format) {
    const res = await axios.post('https://www.tikwm.com/api/', 
        new URLSearchParams({ url, hd: 1 }).toString(), 
        { headers: { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (res.data && res.data.code === 0 && res.data.data) {
        const data = res.data.data;
        if (format === 'mp3' && data.music) return { url: data.music, title: data.title, author: data.author?.nickname };
        const videoUrl = data.hdplay || data.play;
        if (videoUrl) return { url: videoUrl.startsWith('//') ? 'https:' + videoUrl : videoUrl, title: data.title, author: data.author?.nickname };
    }
    throw new Error('TikWM échec');
}

// 7. GitHub (Réécriture d'URL)
function handleGitHub(url) {
    if (url.match(/github\.com\/[^\/]+\/[^\/]+$/)) {
        return { url: `${url.replace(/\/$/, '')}/archive/refs/heads/main.zip`, title: 'Dépôt GitHub (ZIP)', author: 'GitHub Archive' };
    }
    if (url.includes('/blob/')) {
        return { url: url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/'), title: 'Fichier GitHub', author: 'GitHub Raw' };
    }
    if (url.includes('/releases/download/')) return { url, title: 'Release GitHub', author: 'GitHub Releases' };
    return null;
}

// ==========================================
// CONFIGURATION DES FALLBACKS
// ==========================================
const services = {
    youtube: [trySaveFrom, tryCobalt],
    tiktok: [tryTikWM, tryCobalt],
    instagram: [tryFastDL, tryTikWM, tryCobalt],
    snapchat: [tryVdfr, tryCobalt],
    facebook: [tryFDown, trySaveFrom, tryCobalt]
};

// ==========================================
// ROUTE PRINCIPALE
// ==========================================
app.post('/api/analyze', async (req, res) => {
    const { url, platform, format, quality } = req.body;
    if (!url) return res.status(400).json({ error: 'URL manquante' });

    try {
        if (platform === 'github') {
            const ghResult = handleGitHub(url);
            if (ghResult) return res.json(ghResult);
            throw new Error('Lien GitHub non reconnu');
        }

        const serviceList = services[platform] || [];
        let lastError = null;

        for (const serviceFn of serviceList) {
            try {
                const result = await serviceFn(url, format, quality);
                return res.json(result);
            } catch (err) {
                console.log(`[${platform}] Échec avec ${serviceFn.name}: ${err.message}`);
                lastError = err;
            }
        }
        throw new Error('Tous les services ont échoué. La plateforme bloque peut-être les serveurs cloud (Render).');

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 SlimeSc API running on port ${PORT}`);
});
