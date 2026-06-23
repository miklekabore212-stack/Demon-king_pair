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

const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
    'Connection': 'keep-alive'
};

// ==========================================
// HELPER
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

// ==========================================
// SERVICES
// ==========================================

// TikWM — retourne HD, SD et audio séparément
async function tryTikWM(url) {
    const res = await axios.post('https://www.tikwm.com/api/',
        new URLSearchParams({ url, hd: 1 }).toString(),
        { headers: { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://www.tikwm.com/' } }
    );
    if (res.data && res.data.code === 0 && res.data.data) {
        const d = res.data.data;
        const fix = u => (u && u.startsWith('//') ? 'https:' + u : u) || '';
        return {
            // URLs brutes pour le téléchargement
            url:      fix(d.hdplay || d.play),
            hdUrl:    fix(d.hdplay || d.play),
            sdUrl:    fix(d.play),
            mp3Url:   fix(d.music || d.music_info?.play),
            musicUrl: fix(d.music || d.music_info?.play),
            // Métadonnées
            title:    d.title || 'Vidéo TikTok',
            author:   d.author?.nickname || d.author?.unique_id || 'Auteur',
            uniqueId: d.author?.unique_id || '',
            handle:   d.author?.unique_id ? '@' + d.author.unique_id : '',
            thumb:    d.cover || d.origin_cover || '',
            likes:    d.digg_count    || 0,
            plays:    d.play_count    || 0,
            comments: d.comment_count || 0,
            duration: d.duration      || 0,
        };
    }
    throw new Error('TikWM: ' + (res.data?.msg || 'échec'));
}

async function tryCobalt(url, format, quality) {
    const payload = { url, vQuality: (quality || '720p').replace('p',''), vFormat: format === 'mp3' ? 'mp3' : 'mp4', aFormat: 'mp3' };
    const res = await axios.post('https://api.cobalt.tools/api/json', payload, {
        headers: { ...baseHeaders, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });
    if (res.data && (res.data.status === 'redirect' || res.data.status === 'stream') && res.data.url) {
        return { url: res.data.url, hdUrl: res.data.url, title: 'Vidéo TikTok', author: 'SlimeSc' };
    }
    throw new Error('Cobalt échec');
}

async function trySaveFrom(url) {
    const res = await axios.post('https://sfdownload.com/get',
        new URLSearchParams({ sf_url: url, sf_submit: '' }).toString(),
        { headers: { ...baseHeaders, 'Origin': 'https://en.savefrom.net', 'Referer': 'https://en.savefrom.net/', 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (res.data && res.data.url) {
        const $ = cheerio.load(res.data.url);
        const link = $('a.download_link').attr('href') || $('a.link').attr('href');
        if (link) return { url: link, hdUrl: link, title: 'Média via SaveFrom', author: 'SlimeSc Network' };
    }
    throw new Error('SaveFrom échec');
}

async function tryFastDL(url) {
    const res = await axios.post('https://fastdl.app/api/ajaxSearch',
        new URLSearchParams({ url, lang: 'en' }).toString(),
        { headers: { ...baseHeaders, 'Origin': 'https://fastdl.app', 'Referer': 'https://fastdl.app/', 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (res.data && res.data.status === 'ok' && res.data.data) {
        const link = extractMp4FromHtml(res.data.data);
        if (link) return { url: link, hdUrl: link, title: 'Instagram via FastDL', author: 'SlimeSc' };
    }
    throw new Error('FastDL échec');
}

async function tryFDown(url) {
    const res = await axios.post('https://fdown.net/download.php',
        new URLSearchParams({ URLz: url }).toString(),
        { headers: { ...baseHeaders, 'Origin': 'https://fdown.net', 'Referer': 'https://fdown.net/', 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const link = extractMp4FromHtml(res.data);
    if (link) return { url: link, hdUrl: link, title: 'Facebook via FDown', author: 'SlimeSc' };
    throw new Error('FDown échec');
}

async function tryVdfr(url) {
    const res = await axios.post('https://vdfr.app/api/ajaxSearch',
        new URLSearchParams({ url, lang: 'en' }).toString(),
        { headers: { ...baseHeaders, 'Origin': 'https://vdfr.app', 'Referer': 'https://vdfr.app/', 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (res.data && res.data.data) {
        const link = extractMp4FromHtml(res.data.data);
        if (link) return { url: link, hdUrl: link, title: 'Snapchat via Vdfr', author: 'SlimeSc' };
    }
    throw new Error('Vdfr échec');
}

function handleGitHub(url) {
    if (url.match(/github\.com\/[^\/]+\/[^\/]+$/)) return { url: `${url.replace(/\/$/, '')}/archive/refs/heads/main.zip`, title: 'Dépôt GitHub (ZIP)', author: 'GitHub Archive' };
    if (url.includes('/blob/')) return { url: url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/'), title: 'Fichier GitHub', author: 'GitHub Raw' };
    if (url.includes('/releases/download/')) return { url, title: 'Release GitHub', author: 'GitHub Releases' };
    return null;
}

const services = {
    youtube:   [trySaveFrom, tryCobalt],
    tiktok:    [tryTikWM, tryCobalt],
    instagram: [tryFastDL, tryTikWM, tryCobalt],
    snapchat:  [tryVdfr, tryCobalt],
    facebook:  [tryFDown, trySaveFrom, tryCobalt]
};

// ==========================================
// ROUTE /api/analyze  (inchangée + enrichie TikTok)
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
        throw new Error('Tous les services ont échoué.');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ROUTE /api/tiktok-meta  (métadonnées riches pour l'UI)
// ==========================================
app.post('/api/tiktok-meta', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL manquante' });
    try {
        const data = await tryTikWM(url);
        res.json(data);
    } catch(err) {
        // Pas critique — le frontend affiche des données partielles
        res.status(200).json({});
    }
});

// ==========================================
// ROUTE /api/download  — proxy de téléchargement
// Sert le fichier media depuis le serveur vers le client,
// avec les bons headers Content-Disposition pour forcer le download.
// ==========================================
app.get('/api/download', async (req, res) => {
    const { url, filename } = req.query;
    if (!url) return res.status(400).send('URL manquante');

    try {
        const mediaRes = await axios.get(url, {
            responseType: 'stream',
            headers: {
                ...baseHeaders,
                'Referer': 'https://www.tiktok.com/',
            },
            maxRedirects: 5,
            timeout: 30000,
        });

        // Détermine le Content-Type
        const contentType = mediaRes.headers['content-type'] || 'application/octet-stream';
        const safeFilename = (filename || 'video.mp4').replace(/[^a-z0-9_.\-]/gi, '_');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        if (mediaRes.headers['content-length']) {
            res.setHeader('Content-Length', mediaRes.headers['content-length']);
        }

        // Stream direct vers le client
        mediaRes.data.pipe(res);

    } catch(err) {
        console.error('[download] Erreur:', err.message);
        res.status(500).send('Erreur de téléchargement: ' + err.message);
    }
});

// ==========================================
// FALLBACK SPA
// ==========================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 SlimeSc API running on port ${PORT}`);
});
