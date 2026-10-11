const https = require('node:https');
// Chamadores usam apenas hosts fixos. Prazo total inclui DNS, conexão e corpo.
const getJson = (url, { timeout = 8000, maxBytes = 1024 * 1024, headers = {} } = {}) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, data) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(data); };
    const request = https.get(url, { headers }, response => {
        if (response.statusCode !== 200) { response.resume(); return finish(new Error('EXTERNAL_HTTP_ERROR')); }
        const chunks = []; let bytes = 0;
        response.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > maxBytes) { finish(new Error('EXTERNAL_BODY_LIMIT')); request.destroy(); return; }
            chunks.push(Buffer.from(chunk));
        });
        response.on('error', () => finish(new Error('EXTERNAL_RESPONSE_ERROR')));
        response.on('aborted', () => finish(new Error('EXTERNAL_ABORTED')));
        response.on('end', () => { try { finish(null, JSON.parse(Buffer.concat(chunks).toString())); } catch { finish(new Error('EXTERNAL_INVALID_JSON')); } });
    });
    const timer = setTimeout(() => { finish(new Error('EXTERNAL_TIMEOUT')); request.destroy(); }, timeout);
    request.on('error', () => finish(new Error('EXTERNAL_CONNECTION_ERROR')));
});
const validCoordinates = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
module.exports = { getJson, validCoordinates };
