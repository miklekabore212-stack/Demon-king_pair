const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

// 1. COBALT API (Service Principal)
async function tryCobalt(url, format, quality) {
    const cobaltApi = 'https://api.cobalt.tools/api/json';
    const payload = {
        url: url,
        vQuality: quality.replace('p', ''),
        vFormat: format === 'mp3' ? 'mp3' : 'mp4',
        aFormat: 'mp3'
    };
    const res = await axios.post(cobaltApi, payload, { headers: { ...headers, 'Content-Type': 'application/json' } });
    if (res.data && (res.data.status === 'redirect' || res.data.status === 'stream') && res.data.url) {
        return { url: res.data.url, title: 'Média via Cobalt', author: 'SlimeSc Network' };
    }
    throw new Error('Cobalt n\'a pas pu traiter ce lien');
}

// 2. TIKWM API (Fallback TikTok/Insta)
async function tryTikWM(url, format) {
    const tikwmApi = 'https://www.tikwm.com/api/';
    const res = await axios.post(tikwmApi, new URLSearchParams({ url: url, hd: 1 }).toString(), { headers });
    if (res.data && res.data.code === 0 && res.data.data) {
        const data = res.data.data;
        if (format === 'mp3' && data.music) {
            return { url: data.music, title: data.title || 'Audio TikTok', author: data.author?.nickname || 'Inconnu' };
        }
        const videoUrl = data.hdplay || data.play;
        if (videoUrl) {
            return { url: videoUrl.startsWith('//') ? 'https:' + videoUrl : videoUrl, title: data.title || 'Vidéo TikTok', author: data.author?.nickname || 'Inconnu' };
        }
    }
    throw new Error('TikWM n\'a pas pu traiter ce lien');
}

// 3. GITHUB (Réécriture d'URL directe)
function handleGitHub(url) {
    if (url.match(/github\.com\/[^\/]+\/[^\/]+$/)) {
        const repoUrl = url.replace(/\/$/, '');
        return { url: `${repoUrl}/archive/refs/heads/main.zip`, title: 'Dépôt GitHub (ZIP)', author: 'GitHub Archive' };
    }
    if (url.includes('/blob/')) {
        const rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        return { url: rawUrl, title: 'Fichier GitHub', author: 'GitHub Raw' };
    }
    if (url.includes('/releases/download/')) {
        return { url: url, title: 'Release GitHub', author: 'GitHub Releases' };
    }
    return null;
}

// ROUTE PRINCIPALE
app.post('/api/analyze', async (req, res) => {
    const { url, platform, format, quality } = req.body;
    if (!url) return res.status(400).json({ error: 'URL manquante' });

    try {
        if (platform === 'github') {
            const ghResult = handleGitHub(url);
            if (ghResult) return res.json(ghResult);
            throw new Error('Lien GitHub non reconnu');
        }

        try {
            const result = await tryCobalt(url, format, quality);
            return res.json(result);
        } catch (cobaltErr) {
            if (platform === 'tiktok' || platform === 'instagram') {
                const result = await tryTikWM(url, format);
                return res.json(result);
            }
            throw cobaltErr;
        }
    } catch (error) {
        res.status(500).json({ error: `Tous les services ont échoué. Lien invalide ou privé.` });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 SlimeSc API running on port ${PORT}`);
});
