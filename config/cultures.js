// Percentuais do sensor calibrado: faixas de referência, não teor volumétrico de água.
const CULTURES_CONFIG = Object.freeze({
    'cana-de-açúcar': { minIdeal: 35, maxIdeal: 60, center: 47.5, kc: 1.05 },
    'hortaliças': { minIdeal: 50, maxIdeal: 80, center: 65, kc: 0.95 },
    'milho': { minIdeal: 40, maxIdeal: 70, center: 55, kc: 1.15 },
    'feijão': { minIdeal: 40, maxIdeal: 60, center: 50, kc: 1.05 }
});
const getCropConfig = (tipo) => {
    const user = typeof tipo === "object" && tipo !== null ? tipo : null;
    tipo = user ? user.tipoPlantacao : tipo;
    const key = typeof tipo === 'string' ? tipo.normalize('NFC').trim().toLowerCase() : '';
    if (key === 'personalizado' && Number.isFinite(user?.minIdeal) && Number.isFinite(user?.maxIdeal) && user.minIdeal >= 0 && user.maxIdeal <= 100 && user.minIdeal < user.maxIdeal) {
        return { minIdeal:user.minIdeal, maxIdeal:user.maxIdeal, center:(user.minIdeal+user.maxIdeal)/2, kc:null, supported:true, basis:'USER_SENSOR_PERCENT' };
    }
    const config = CULTURES_CONFIG[key];
    return config ? { ...config, supported: true, basis: 'REFERENCE_SENSOR_PERCENT' }
        : { minIdeal: null, maxIdeal: null, center: null, kc: null, supported: false, basis: 'UNCONFIGURED' };
};
module.exports = { CULTURES_CONFIG, getCropConfig };
