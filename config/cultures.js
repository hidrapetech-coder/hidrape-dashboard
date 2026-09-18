/**
 * Fonte única de verdade para os limites e configurações de cada cultura.
 */
const CULTURES_CONFIG = {
    'cana-de-açúcar': { minIdeal: 35, maxIdeal: 60, center: 47.5, kc: 1.05 },
    'hortaliças': { minIdeal: 50, maxIdeal: 80, center: 65, kc: 0.95 },
    'milho': { minIdeal: 40, maxIdeal: 70, center: 55, kc: 1.15 },
    'feijão': { minIdeal: 40, maxIdeal: 60, center: 50, kc: 1.05 },
    'default': { minIdeal: 40, maxIdeal: 60, center: 50, kc: 1.00 }
};

const getCropConfig = (tipoPlantacao) => {
    if (!tipoPlantacao) return CULTURES_CONFIG['default'];
    const normalized = tipoPlantacao.toLowerCase();
    return CULTURES_CONFIG[normalized] || CULTURES_CONFIG['default'];
};

module.exports = {
    CULTURES_CONFIG,
    getCropConfig
};
