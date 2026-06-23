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

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
};

// ==========================================
// FONCTIONS DE RECHERCHE DE LIENS (Scraping)
// ==========================================

// Fonction générique pour extraire un lien MP4 d'une page HTML
function extractMp4FromHtml(html) {
    const $ = cheerio.load(html);
    // Cherche les balises vidéo, liens de téléchargement, ou métadonnées
    const videoSrc = $('video source').attr('src') || $('video').attr('src') || $('a[download]').attr('href') || $('a.btn-primary').attr('href');
    if (videoSrc) return videoSrc.startsWith('http') ? videoSrc : 'https:' + videoSrc;
    
    // Cherche dans les scripts JSON si pas trouvé dans le HTML
    const jsonMatch = html.match(/"video_url"\s*:\s*"(https?:[^"]+)"/) || 
                      html.match(/"downloadLink"\s*:\s*"(https?:[^"]+)"/) ||
                      html.match(/"(https?:[^"]*\.mp4[^"]*)"/);
    if (jsonMatch) return jsonMatch[1].replace(/\\u002F/g, '/');
    
    return null;
}

// 1. SaveFrom / SSYoutube (Youtube, Facebook, Instagram)
async function trySaveFrom(url, format, quality) {
    const api = 'https://sfdownload.com/get';
    const res = await axios.post(api, new URLSearchParams({ sf_url: url, sf_submit: '' }).toString(), { headers });
    if (res.data && res.data.url) {
        // Savefrom renvoie un JSON avec les liens
        const $ = cheerio.load(res.data.url);
        const link = $('a.download_link').attr('href');
        if (link) return { url: link, title: 'Média via SaveFrom', author: 'SlimeSc Network' };
    }
    throw new Error('SaveFrom échec');
}

// 2. FastDL (Instagram)
async function tryFastDL(url) {
    const res = await axios.post('https://fastdl.app/api/ajaxSearch', new URLSearchParams({ url, lang: 'en' }).toString(), { headers });
    if (res.data && res.data.status === 'ok' && res.data.data) {
        const link = extractMp4FromHtml(res.data.data);
        if (link) return { url: link, title: 'Instagram via FastDL', author: 'SlimeSc' };
    }
    throw new Error('FastDL échec');
}

// 3. FDown (Facebook)
async function tryFDown(url) {
    const res = await axios.post('https://fdown.net/download.php', new URLSearchParams({ URLz: url }).toString(), { headers });
    const link = extractMp4FromHtml(res.data);
    if (link) return { url: link, title: 'Facebook via FDown', author: 'SlimeSc' };
    throw new Error('FDown échec');
}

// 4. Vdfr (Snapchat)
async function tryVdfr(url) {
    const res = await axios.post('https://vdfr.app/api/ajaxSearch', new URLSearchParams({ url, lang: 'en' }).toString(), { headers });
    if (res.data && res.data.data) {
        const link = extractMp4FromHtml(res.data.data);
        if (link) return { url: link, title: 'Snapchat via Vdfr', author: 'SlimeSc' };
    }
    throw new Error('Vdfr échec');
}

// 5. Cobalt (Multi-plateformes universel)
async function tryCobalt(url, format, quality) {
    const payload = { url, vQuality: quality.replace('p', ''), vFormat: format === 'mp3' ? 'mp3' : 'mp4', aFormat: 'mp3' };
    const res = await axios.post('https://api.cobalt.tools/api/json', payload, { headers: { ...headers, 'Content-Type': 'application/json' } });
    if (res.data && (res.data.status === 'redirect' || res.data.status === 'stream') && res.data.url) {
        return { url: res.data.url, title: 'Média via Cobalt', author: 'SlimeSc Network' };
    }
    throw new Error('Cobalt échec');
}

// 6. TikWM (TikTok/Insta)
async function tryTikWM(url, format) {
    const res = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({ url, hd: 1 }).toString(), { headers });
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
// CONFIGURATION DES FALLBACKS (Ordre de priorité)
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
                lastError = err;
            }
        }
        throw new Error('Tous les services ont échoué. Lien privé, invalide ou API surchargée.');

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
