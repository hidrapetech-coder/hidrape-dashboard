const validTimeZone = value => { try { if (typeof value !== 'string' || value.length > 80) return false; new Intl.DateTimeFormat('en', { timeZone:value }); return true; } catch { return false; } };
// Sem configuração válida, usamos o horário de Brasília em todas as consultas.
const timeZoneFor = user => validTimeZone(user?.timeZone) ? user.timeZone : 'America/Sao_Paulo';
const localDate = (time, zone) => new Intl.DateTimeFormat('en-CA', { timeZone:zone, year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(time));
module.exports = { validTimeZone, timeZoneFor, localDate };
