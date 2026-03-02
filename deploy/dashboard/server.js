const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;
const DIST = path.join(__dirname, 'dist');

// Hashed assets (index-XYZ.js, etc.) — cache for 1 year
app.use('/assets', express.static(path.join(DIST, 'assets'), {
    maxAge: '1y',
    immutable: true,
}));

// index.html — never cache (so browsers always get the latest bundle reference)
app.use(express.static(DIST, {
    maxAge: 0,
    setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    },
}));

// SPA fallback — all routes serve index.html
app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => console.log(`Dashboard serving on port ${PORT}`));
