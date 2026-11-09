const https = require('node:https');
// Chamadores usam apenas hosts fixos. Prazo total inclui DNS, conexão e corpo.
const getJson = (url, { timeout = 8000, maxBytes = 1024 * 1024, headers = {}, signal } = {}) => new Promise((resolve, reject) => {
    let settled = false,request,timer;
    const onAbort=()=>{finish(new Error('EXTERNAL_ABORTED'));request?.destroy();};
    const finish = (error, data) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort',onAbort);error ? reject(error) : resolve(data); };
    if(signal?.aborted)return finish(new Error('EXTERNAL_ABORTED'));
    request = https.get(url, { headers }, response => {
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
    timer = setTimeout(() => { finish(new Error('EXTERNAL_TIMEOUT')); request.destroy(); }, timeout);
    request.on('error', () => finish(new Error('EXTERNAL_CONNECTION_ERROR')));
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted)onAbort();
});
const validCoordinates = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
module.exports = { getJson, validCoordinates };
