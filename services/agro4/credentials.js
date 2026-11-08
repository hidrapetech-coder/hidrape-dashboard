const crypto = require('node:crypto');
const key = secret => crypto.hkdfSync('sha256',Buffer.from(secret),Buffer.from('hidrape-agro4'),Buffer.from('device-credentials'),32);
const seal = (value, secret) => {
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(secret),iv);
    const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.');
};
const open = (value, secret) => {
    try {
        const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64url'));
        const cipher=crypto.createDecipheriv('aes-256-gcm',key(secret),iv);cipher.setAuthTag(tag);
        return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'));
    } catch { throw new Error('AGRO_CREDENTIAL_UNAVAILABLE'); }
};
module.exports={seal,open};
