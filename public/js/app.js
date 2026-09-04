// ==========================================
// CORE: ESTADO, AUTENTICAÇÃO E ROTEAMENTO
// ==========================================
let currentUser = null;
let currentToken = localStorage.getItem('jwt') || null;

// ==========================================
// DEMO MODE ENGINE
// ==========================================
let isDemoMode = false;
let demoIntervalId = null;

const demoData = {
    sensor: {
        umidade: 68,
        temperatura: 24,
        bateria: 95,
        status: 'Online',
        sinal: 'Bom',
        bombaStatus: 'Desligada'
    },
    clima: {
        temp: 24.5,
        desc: "Parcialmente nublado",
        umidade: 62,
        vento: 12.3,
        chuva_1h: 0,
        previsao: [
            { date: "Hoje", temp_min: 18, temp_max: 27, pop: 10, weather_desc: "Ensolarado" },
            { date: "Amanhã", temp_min: 19, temp_max: 28, pop: 20, weather_desc: "Parcialmente nublado" },
            { date: "Depois", temp_min: 20, temp_max: 26, pop: 60, weather_desc: "Chuva leve" }
        ]
    },
    ia: [
        {
            recomendacao: "A umidade do solo apresenta níveis adequados para a cultura monitorada. Manter o monitoramento atual e evitar irrigação adicional nas próximas horas.",
            insights: [
                "Solo retendo água de forma eficiente.",
                "Não há previsão de estresse hídrico para os próximos 3 dias."
            ]
        },
        {
            recomendacao: "Atenção: A umidade está caindo de forma consistente. Recomendado preparar sistema de irrigação para acionamento preventivo na próxima janela.",
            insights: [
                "Queda de 3% na umidade nas últimas 12 horas.",
                "Vento forte pode acelerar evapotranspiração."
            ]
        }
    ],
    iaIndex: 0,
    historico: Array.from({ length: 24 }, (_, i) => ({
        horario: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        umidade: 65 + Math.random() * 5,
        temperatura: 22 + Math.random() * 4,
        status_bomba: i % 12 === 0 ? 'Ligada' : 'Desligada'
    }))
};

const originalFetch = window.fetch;
window.fetch = async function (resource, config) {
    if (isDemoMode) {
        const urlStr = typeof resource === 'string' ? resource : resource.url;

        // Allowed bypasses: views, chartjs, local assets
        if (urlStr.startsWith('/views/') || urlStr.startsWith('http') && !urlStr.includes('/api/')) {
            if (urlStr.includes('api.rainviewer.com')) {
                return Promise.resolve(new Response(JSON.stringify({ radar: { past: [], nowcast: [] } }), { status: 200 }));
            }
            return originalFetch.apply(this, arguments);
        }

        // Network Interception for API Calls
        if (urlStr.includes('/api/auth/me')) {
            return Promise.resolve(new Response(JSON.stringify({ id: 'demo123', nome: 'Visitante (Demo)', empresa: 'Fazenda Hidrape', area_hectares: 42, cultura: 'Milho', data_cadastro: new Date().toISOString() }), { status: 200 }));
        }
        if (urlStr.includes('/api/sensores/umidade')) {
            return Promise.resolve(new Response(JSON.stringify(demoData.sensor), { status: 200 }));
        }
        if (urlStr.includes('/api/agro/clima')) {
            return Promise.resolve(new Response(JSON.stringify(demoData.clima), { status: 200 }));
        }
        if (urlStr.includes('/api/agro/insights-ia')) {
            const iaMock = demoData.ia[demoData.iaIndex % demoData.ia.length];
            return Promise.resolve(new Response(JSON.stringify(iaMock), { status: 200 }));
        }
        if (urlStr.includes('/api/agro/media-semanal')) {
            return Promise.resolve(new Response(JSON.stringify([
                { dia: 'Seg', media: 66 },
                { dia: 'Ter', media: 64 },
                { dia: 'Qua', media: 62 },
                { dia: 'Qui', media: 60 },
                { dia: 'Sex', media: 68 },
                { dia: 'Sáb', media: 69 },
                { dia: 'Dom', media: 68 }
            ]), { status: 200 }));
        }
        if (urlStr.includes('/api/sensores/historico')) {
            return Promise.resolve(new Response(JSON.stringify({ historico: demoData.historico.slice().reverse(), total: 24, page: 1, pages: 1 }), { status: 200 }));
        }
        if (urlStr.includes('/api/auth/config')) {
            return Promise.resolve(new Response(JSON.stringify({ error: 'Disponível na versão completa.' }), { status: 403 }));
        }

        // Guard-rail: throw error on unmocked routes
        console.error(`[DEMO GUARD] Bloqueada requisição para rota não-mockada: ${urlStr}`);
        throw new Error(`Rota ${urlStr} não foi mockada na Demonstração.`);
    }

    return originalFetch.apply(this, arguments);
};

const updateDemoData = () => {
    if (!isDemoMode) return;

    demoData.sensor.umidade += (Math.random() > 0.5 ? 0.5 : -0.5);
    demoData.sensor.umidade = Math.min(100, Math.max(0, demoData.sensor.umidade));

    demoData.sensor.temperatura += (Math.random() > 0.5 ? 0.2 : -0.2);
    demoData.clima.temp = demoData.sensor.temperatura;

    if (Math.random() > 0.9) demoData.iaIndex++;

    // Mutate history incrementally (push/shift)
    demoData.historico.shift();
    demoData.historico.push({
        horario: new Date().toISOString(),
        umidade: demoData.sensor.umidade,
        temperatura: demoData.sensor.temperatura,
        status_bomba: demoData.sensor.bombaStatus
    });
};

const escapeHTML = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
};

const showDemoUpsellModal = () => {
    let modal = document.getElementById('demo-upsell-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'demo-upsell-modal';
        modal.className = 'demo-upsell-modal';
        modal.innerHTML = `
            <div class="demo-upsell-content">
                <span class="material-symbols-rounded demo-upsell-icon">workspace_premium</span>
                <h3 class="demo-upsell-title">Disponível na versão completa</h3>
                <p class="demo-upsell-text">Conecte seus sensores e tenha acesso aos dados reais e configurações completas da sua propriedade em tempo real.</p>
                <button class="demo-upsell-btn">Quero conhecer o Hidrape</button>
                <button class="demo-upsell-close">Continuar explorando</button>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.demo-upsell-close').addEventListener('click', () => {
            modal.classList.remove('active');
        });
        modal.querySelector('.demo-upsell-btn').addEventListener('click', () => {
            alert('Esta ação abriria uma nova aba para contato de vendas ou registro!');
        });
    }
    // Forçar reflow para ativar animação
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
};

const startGuidedTour = () => {
    const steps = [
        { route: 'dashboard', sel: '.dash-top-bar', title: 'Visão Geral', text: 'Aqui você acompanha o status da sua fazenda e a comunicação com os sensores IoT em tempo real.' },
        { route: 'dashboard', sel: '.card-signature', title: 'Sensores em Tempo Real', text: 'O coração do Hidrape. Monitore a umidade exata do solo a cada segundo e tome decisões precisas.' },
        { route: 'dashboard', sel: '#predict-card', title: 'Inteligência Artificial', text: 'Nosso motor agronômico analisa o solo e clima para te entregar recomendações práticas e prevenir perdas.' },
        { route: 'geo', sel: '.view-header', title: 'Visão Geoespacial', text: 'Acompanhe a sua propriedade pelo mapa satelital e monitore as condições climáticas e precipitações.' },
        { route: 'history', sel: '.view-header', title: 'Histórico e Tendências', text: 'Acesse os dados armazenados e entenda o comportamento hídrico da fazenda ao longo do tempo.' },
        { route: 'settings', sel: '.view-header', title: 'Configurações e Alertas', text: 'Gerencie suas credenciais e configure seus alertas via WhatsApp e Telegram.' }
    ];

    let popover = document.getElementById('demo-tour-popover');
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'demo-tour-popover';
        popover.className = 'demo-tour-popover';
        document.body.appendChild(popover);
    }

    let backdrop = document.getElementById('demo-tour-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'demo-tour-backdrop';
        backdrop.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(12,17,23,0.5); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); z-index:9997; opacity:0; pointer-events:none; transition: opacity 0.25s ease, clip-path 0.3s cubic-bezier(0.16, 1, 0.3, 1), -webkit-clip-path 0.3s cubic-bezier(0.16, 1, 0.3, 1);';
        document.body.appendChild(backdrop);
    }

    const preventDefault = (e) => e.preventDefault();
    const preventScrollKeys = (e) => {
        if (["Space", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.code)) {
            e.preventDefault();
        }
    };

    // Bloquear scroll do usuário durante a tour
    window.addEventListener('wheel', preventDefault, { passive: false });
    window.addEventListener('touchmove', preventDefault, { passive: false });
    window.addEventListener('keydown', preventScrollKeys, { passive: false });

    const endTour = () => {
        window.removeEventListener('wheel', preventDefault);
        window.removeEventListener('touchmove', preventDefault);
        window.removeEventListener('keydown', preventScrollKeys);

        document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
        popover.classList.remove('active');
        backdrop.style.opacity = '0';
        setTimeout(() => {
            if (currentToken === "demo_token") {
                logout();
            } else {
                isDemoMode = false;
                if (demoIntervalId) { clearInterval(demoIntervalId); demoIntervalId = null; }
                navigate('dashboard');
            }
        }, 300);
    };

    const highlightEl = async (stepIdx) => {
        if (stepIdx >= steps.length) return endTour();

        const step = steps[stepIdx];

        // Navigate if needed
        const activeLink = document.querySelector('.nav-link.active');
        if (activeLink && activeLink.getAttribute('data-route') !== step.route) {
            await navigate(step.route);
            await new Promise(r => requestAnimationFrame(r));
        }

        document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

        let el = document.querySelector(step.sel);
        if (!el) {
            let retries = 0;
            while (!el && retries < 10) {
                await new Promise(r => setTimeout(r, 200));
                el = document.querySelector(step.sel);
                retries++;
            }
        }
        if (!el) return highlightEl(stepIdx + 1);

        backdrop.style.opacity = '1';
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
        el.classList.add('tour-highlight');

        // Aguarda renderização síncrona real
        await new Promise(r => requestAnimationFrame(r));

        // Use clip-path to punch a hole in the blurred backdrop
        const rect = el.getBoundingClientRect();
        const padding = 12;
        const t = Math.max(0, rect.top - padding);
        const r = Math.min(window.innerWidth, rect.right + padding);
        const b = Math.min(window.innerHeight, rect.bottom + padding);
        const l = Math.max(0, rect.left - padding);

        const clipPathStr = `polygon(0% 0%, 0% 100%, ${l}px 100%, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px 100%, 100% 100%, 100% 0%)`;
        backdrop.style.clipPath = clipPathStr;
        backdrop.style.webkitClipPath = clipPathStr;

        popover.innerHTML = `
            <span class="tour-step-info">Passo ${stepIdx + 1} de ${steps.length}</span>
            <h4 class="tour-title">${step.title}</h4>
            <p class="tour-desc">${step.text}</p>
            <div class="tour-actions">
                <button class="tour-btn" id="tour-skip">Sair do Tour</button>
                <button class="tour-btn primary" id="tour-next">${stepIdx === steps.length - 1 ? 'Concluir' : 'Próximo'}</button>
            </div>
        `;

        let topPos = rect.bottom + window.scrollY + 15;
        // Se o popover for ficar muito próximo do limite inferior da tela (ou vazar), jogue-o para cima do elemento
        if (rect.bottom + 220 > window.innerHeight) {
            topPos = rect.top + window.scrollY - 200;
        }
        // Limite superior de segurança
        if (topPos < window.scrollY + 10) {
            topPos = window.scrollY + 10;
        }

        popover.style.top = `${topPos}px`;

        let leftPos = rect.left;
        if (leftPos + 280 > window.innerWidth) leftPos = window.innerWidth - 300;
        popover.style.left = `${Math.max(10, leftPos)}px`;

        popover.classList.add('active');

        document.getElementById('tour-next').onclick = () => highlightEl(stepIdx + 1);
        document.getElementById('tour-skip').onclick = endTour;
    };

    highlightEl(0);
};

const appContainer = document.getElementById('app-container');
const appContent = document.getElementById('app-content');
const sidebar = document.getElementById('sidebar');
const btnLogout = document.getElementById('btn-logout');

let liveInterval = null;
let liveChartObj = null;
let weatherInterval = null;
let weeklyChartObj = null;

// Verifica se está logado e carrega usuário
const initAuth = async () => {
    if (!currentToken) return false;

    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'x-auth-token': currentToken }
        });

        if (!res.ok) throw new Error('Token Expirou');

        currentUser = await res.json();
        return true;
    } catch (e) {
        logout(false);
        return false;
    }
};

const logout = (redirect = true) => {
    localStorage.removeItem('jwt');
    currentToken = null;
    currentUser = null;
    if (liveInterval) clearTimeout(liveInterval);
    if (weatherInterval) clearTimeout(weatherInterval);
    if (demoIntervalId) clearInterval(demoIntervalId);
    isDemoMode = false;
    if (redirect) navigate('login');
};

// Navegação Básica (SPA)
const navigate = async (route) => {
    // 1. Limpar timers (Impedir vazamento assíncrono)
    if (liveInterval) { clearTimeout(liveInterval); liveInterval = null; }
    if (weatherInterval) { clearTimeout(weatherInterval); weatherInterval = null; }
    if (demoIntervalId) { clearInterval(demoIntervalId); demoIntervalId = null; }
    _cardCache = null; // Invalida cache de cards (DOM vai mudar)

    const zombieDropdown = document.getElementById('profile-dropdown');
    if (zombieDropdown && zombieDropdown.parentNode === document.body) {
        zombieDropdown.remove();
    }

    // 2. Proteção de Rota
    const unauthRoutes = ['login', 'register', 'forgot-password', 'reset-password'];
    if (!currentToken && !unauthRoutes.includes(route)) {
        return navigate('login');
    }
    if (currentToken && unauthRoutes.includes(route)) {
        return navigate('dashboard');
    }

    // 3. UI da Sidebar
    if (unauthRoutes.includes(route)) {
        sidebar.style.display = 'none';
        appContent.style.margin = '0';
        appContent.style.padding = '0';
        appContent.style.minHeight = '100dvh';
        appContent.style.background = 'transparent';
        appContent.style.backdropFilter = 'none';
        appContent.style.webkitBackdropFilter = 'none';
    } else {
        sidebar.style.display = 'flex';
        appContent.style.margin = '';
        appContent.style.padding = '';
        appContent.style.minHeight = '';
        appContent.style.background = '';
        appContent.style.backdropFilter = '';
        appContent.style.webkitBackdropFilter = '';

        // Atualizar nav ativa e Lanterna
        const lantern = document.getElementById('nav-lantern');
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-route') === route) {
                link.classList.add('active');
                if (lantern) {
                    // Mover fisicamente o glow para o slot do menu
                    lantern.style.transform = `translateY(${link.offsetTop}px)`;
                }
            }
        });

        // Mobile Sidebar auto-close upon navigation
        sidebar.classList.remove('open');

        // Configurar botões da sidebar para demo/normal
        const exitBtn = document.getElementById('btn-demo-exit');
        const logoutBtn = document.getElementById('btn-logout');
        if (isDemoMode) {
            if (exitBtn) exitBtn.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'none';
        } else {
            if (exitBtn) exitBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'flex';
        }
    }

    // 4. Injetar Template
    try {
        appContent.innerHTML = `<div class="loader-spinner"></div>`;
        const res = await fetch(`/views/${route}.html?v=${Date.now()}`);
        const html = await res.text();

        const wrapper = document.createElement('div');
        wrapper.className = 'animate-enter-stagger';
        wrapper.innerHTML = html;
        appContent.innerHTML = '';
        appContent.appendChild(wrapper);

        // 5. Iniciar Lógica Específica da Rota
        initRouteScript(route);

    } catch (e) {
        appContent.innerHTML = `<h2>Erro ao carregar a página</h2>`;
        console.error(e);
    }
};

// Mapeia clicks do roteamento
document.body.addEventListener('click', e => {
    const trigger = e.target.closest('[data-route]');
    if (trigger) {
        e.preventDefault();
        navigate(trigger.getAttribute('data-route'));
    }
});

// Pesquisa Global
document.getElementById('global-search')?.addEventListener('change', e => {
    const term = e.target.value.toLowerCase();
    if (term.includes('hist')) navigate('history');
    else if (term.includes('config')) navigate('settings');
    else if (term.includes('dash') || term.includes('geral')) navigate('dashboard');
    e.target.value = '';
});

// Listener Global para Rastreador de Mouse (Glow Animation) — Otimizado
let ticking = false;
let _cardCache = null;
let _cardCacheTime = 0;

const getCards = () => {
    const now = Date.now();
    // Revalida cache a cada 2s (evita querySelectorAll a cada frame)
    if (!_cardCache || now - _cardCacheTime > 2000) {
        _cardCache = document.querySelectorAll('.card');
        _cardCacheTime = now;
    }
    return _cardCache;
};

document.body.addEventListener('mousemove', e => {
    if (!ticking) {
        requestAnimationFrame(() => {
            const cards = getCards();
            for (let i = 0; i < cards.length; i++) {
                const rect = cards[i].getBoundingClientRect();
                cards[i].style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                cards[i].style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
            }
            ticking = false;
        });
        ticking = true;
    }
}, { passive: true });

// Listener Mobile Hambúrguer Toggle
document.body.addEventListener('click', e => {
    const btnMenu = e.target.closest('#mobile-menu-btn');
    if (btnMenu) {
        document.getElementById('sidebar')?.classList.toggle('open');
    }
});

btnLogout?.addEventListener('click', (e) => {
    e.preventDefault();
    logout(true);
});

// Listener dinâmico para botão Sair da Demo, caso carregue de forma assíncrona
document.body.addEventListener('click', e => {
    const exitBtn = e.target.closest('#btn-demo-exit');
    if (exitBtn) {
        e.preventDefault();
        const conf = confirm("Deseja realmente encerrar a demonstração e voltar ao login?");
        if (conf) {
            logout(true);
        }
    }
});

// ==========================================
// MÓDULOS DE INTELIGÊNCIA ARTIFICIAL E AGRONÔMICA
// ==========================================
window._latestUmid = 50;
window._latestStatus = 'IDEAL';
window._latestClima = null;
window._latestSemana = [];
window._latestSat = null;
window._sensorState = null;

const renderInteligence = () => {
    if (!window._latestClima || !document.getElementById('analise-texto')) return;

    // Se o sensor estiver offline ou os dados forem velhos, desativamos algumas coisas
    const hasValidData = window._sensorState ? window._sensorState.hasValidData : true; // fallback to true se ainda nao tiver carregado

    // 1. Evapotranspiração
    const evapo = calcularEvapotranspiracao(window._latestClima);
    document.getElementById('evapo-nivel').textContent = evapo.nivel;
    document.getElementById('evapo-desc').textContent = evapo.desc;
    document.getElementById('evapo-icon').textContent = evapo.icon;
    document.getElementById('evapo-nivel').style.color = evapo.cor;
    document.getElementById('evapo-icon-wrap').style.color = evapo.cor;
    document.getElementById('evapo-icon-wrap').style.background = evapo.cor + '20';

    // 2. Saúde do Solo (Multi-Fator)
    const saude = calcularSaudeSolo(
        window._latestUmid,
        window._latestSemana,
        window._latestClima,
        currentUser.tipoPlantacao,
        window._sensorState
    );

    document.getElementById('saude-valor').textContent = saude.score;
    document.getElementById('saude-status').textContent = saude.status;
    document.getElementById('saude-status').style.color = saude.cor;
    document.getElementById('saude-progress').style.stroke = saude.cor;

    if (saude.score === '--') {
        document.getElementById('saude-progress').style.strokeDasharray = `0, 100`;
    } else {
        document.getElementById('saude-progress').style.strokeDasharray = `${saude.score}, 100`;
    }

    // 3. Análise Avançada Global
    let txt = analiseAvancada(window._latestUmid, window._latestStatus, window._latestClima, currentUser.tipoPlantacao, window._latestSat, window._sensorState);
    document.getElementById('analise-texto').textContent = txt;
};

const calcularEvapotranspiracao = (clima) => {
    const et0 = clima.daily?.et0_fao_evapotranspiration?.[0];
    if (et0 !== undefined) {
        if (et0 > 5) return { nivel: et0.toFixed(1) + ' mm', desc: 'Alta perda (FAO). A umidade do solo evapora rapidamente.', cor: 'var(--color-dry)', icon: 'air' };
        if (et0 < 2) return { nivel: et0.toFixed(1) + ' mm', desc: 'Baixa perda (FAO). Condições favoráveis para retenção de água.', cor: 'var(--color-good)', icon: 'cloud' };
        return { nivel: et0.toFixed(1) + ' mm', desc: 'Perda média (FAO). Taxa normal para o período.', cor: 'var(--color-mid)', icon: 'routine' };
    }
    const temp = clima.current.temperature_2m;
    const umid = clima.current.relative_humidity_2m;
    if (temp > 28 && umid < 45) return { nivel: 'Alta', desc: 'Temperatura elevada e baixa umidade do ar aceleram a perda de água do solo.', cor: 'var(--color-dry)', icon: 'air' };
    if (temp < 20 || umid > 75) return { nivel: 'Baixa', desc: 'Condições favoráveis para retenção de água no solo.', cor: 'var(--color-good)', icon: 'cloud' };
    return { nivel: 'Média', desc: 'Taxa de evaporação dentro dos parâmetros normais para o período.', cor: 'var(--color-mid)', icon: 'routine' };
};

// Thresholds ideais por cultura (espelha backend sensorController)
const getCropLimits = (tipo) => {
    switch ((tipo || '').toLowerCase()) {
        case 'milho': return { min: 40, max: 70, center: 55 };
        case 'feijão': return { min: 40, max: 60, center: 50 };
        case 'hortaliças': return { min: 50, max: 80, center: 65 };
        case 'cana-de-açúcar': return { min: 35, max: 60, center: 47.5 };
        default: return { min: 40, max: 60, center: 50 };
    }
};

/**
 * ALGORITMO DE SAÚDE DO SOLO — Multi-Fator Ponderado
 *
 * Fatores (pesos):
 *   F1 (40%) - Posição na faixa ideal da cultura
 *   F2 (25%) - Consistência histórica (desvio da média semanal)
 *   F3 (20%) - Estabilidade diária (variância entre dias)
 *   F4 (15%) - Estresse climático (temp + umid do ar)
 */
const calcularSaudeSolo = (umidAtual, dadosSemana, clima, tipoPlantacao, sensorState) => {
    if (sensorState && !sensorState.hasValidData) {
        return {
            score: '--',
            status: 'Indisponível',
            cor: 'var(--sys-light)',
            mensagem: 'Aguardando dados do sensor.'
        };
    }

    const limits = getCropLimits(tipoPlantacao);

    // ===== F1: Proximidade à faixa ideal (40%) =====
    let f1 = 100;
    if (umidAtual >= limits.min && umidAtual <= limits.max) {
        // Dentro da faixa — bonús se perto do centro
        const distCenter = Math.abs(umidAtual - limits.center);
        const halfRange = (limits.max - limits.min) / 2;
        f1 = 100 - (distCenter / halfRange) * 15; // Máx perde 15pts do centro as bordas
    } else {
        // Fora da faixa — penalidade proporcional
        const overshoot = umidAtual < limits.min
            ? limits.min - umidAtual
            : umidAtual - limits.max;
        f1 = Math.max(0, 100 - overshoot * 3);
    }

    // ===== F2: Consistência com média semanal (25%) =====
    // Filtrar dias com dados reais (media > 0 = tem leitura)
    const diasComDados = dadosSemana.filter(d => d.media > 0);
    let f2 = 80; // Padrão neutro quando não há histórico
    if (diasComDados.length > 0) {
        const mediaReal = diasComDados.reduce((sum, d) => sum + d.media, 0) / diasComDados.length;
        const desvio = Math.abs(umidAtual - mediaReal);
        f2 = Math.max(0, 100 - desvio * 2.5);
    }

    // ===== F3: Estabilidade entre dias (20%) =====
    let f3 = 75; // Padrão neutro
    if (diasComDados.length >= 2) {
        const medias = diasComDados.map(d => d.media);
        const avg = medias.reduce((a, b) => a + b, 0) / medias.length;
        const variance = medias.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / medias.length;
        const stdDev = Math.sqrt(variance);
        // Desvio padrão baixo = estável = bom
        f3 = Math.max(0, 100 - stdDev * 4);
    }

    // ===== F4: Estresse Climático (15%) =====
    let f4 = 80;
    if (clima && clima.current) {
        const temp = clima.current.temperature_2m || 25;
        const airHumid = clima.current.relative_humidity_2m || 50;

        // Temperatura ideal: 18-28°C
        if (temp >= 18 && temp <= 28) {
            f4 = 100;
        } else if (temp > 35 || temp < 5) {
            f4 = 30; // Estresse severo
        } else {
            f4 = 70; // Estresse leve
        }

        // Umidade do ar: 40-80% é favorável
        if (airHumid < 25) f4 -= 20;       // Ar muito seco evapora solo
        else if (airHumid > 90) f4 -= 10;  // Risco de fungos
        f4 = Math.max(0, f4);
    }

    // ===== Score Final Ponderado =====
    const score = Math.round(
        f1 * 0.40 +
        f2 * 0.25 +
        f3 * 0.20 +
        f4 * 0.15
    );

    const clampedScore = Math.max(0, Math.min(100, score));

    if (clampedScore >= 86) return { score: clampedScore, status: 'Ideal', cor: 'var(--color-good)' };
    if (clampedScore >= 71) return { score: clampedScore, status: 'Bom', cor: '#27ae60' };
    if (clampedScore >= 51) return { score: clampedScore, status: 'Regular', cor: 'var(--color-mid)' };
    if (clampedScore >= 31) return { score: clampedScore, status: 'Baixo', cor: '#f39c12' };
    return { score: clampedScore, status: 'Crítico', cor: 'var(--color-dry)' };
};

const analiseAvancada = (umidade, status, clima, tipoPlantacao, satData = null, sensorState = null) => {
    if (sensorState && !sensorState.hasValidData) {
        return `As análises estão limitadas porque o sensor de solo está offline ou desatualizado. Verifique a conectividade.`;
    }

    const temp = clima.current.temperature_2m;
    const umidAr = clima.current.relative_humidity_2m;
    const limits = getCropLimits(tipoPlantacao);

    // 1. Detecção de Anomalias e Padrões
    if (status === 'SECO' && temp > 30) {
        return `Com a temperatura de ${temp.toFixed(1)}°C, a evaporação da cultura de ${tipoPlantacao.toLowerCase()} está acelerada. Recomenda-se irrigação.`;
    }

    if (status === 'ENCHARCADO' && umidAr > 80) {
        return `Solo com excesso de umidade e umidade do ar elevada. Atenção ao risco de doenças fúngicas na cultura de ${tipoPlantacao.toLowerCase()}.`;
    }

    if (umidade < limits.min) {
        return `Umidade do solo abaixo do ideal para ${tipoPlantacao.toLowerCase()}. A planta pode apresentar estresse hídrico.`;
    }

    if (status === 'IDEAL' && temp >= 20 && temp <= 28) {
        return `Condições ideais de solo e clima para o desenvolvimento da cultura de ${tipoPlantacao.toLowerCase()}.`;
    }

    if (status === 'ENCHARCADO') {
        return `Solo encharcado. Suspenda a irrigação para evitar danos às raízes da cultura de ${tipoPlantacao.toLowerCase()}.`;
    }

    if (satData && Math.abs(umidade - satData.umidadeMacro) > 30) {
        return `Divergência: Sensor local marca ${umidade.toFixed(1)}% e o satélite marca a região com ${satData.umidadeMacro}%. Indica possível irrigação recente localizada ou microclima extremo na sua área.`;
    }

    return `Condições gerais estáveis. Solo em boas condições para a atividade agrícola.`;
};

// ==========================================
// MÓDULOS DE ROTA
// ==========================================
const initRouteScript = (route) => {
    if (route === 'login') initLogin();
    if (route === 'register') initRegister();
    if (route === 'forgot-password') initForgotPassword();
    if (route === 'reset-password') initResetPassword();
    if (route === 'dashboard') initDashboard();
    if (route === 'geo') initGeo();
    if (route === 'history') initHistory();
    if (route === 'analysis') initAnalysis();
    if (route === 'settings') initSettings();
    if (route === 'monthly-report') initMonthlyReport();
};

const setupAuthFetch = (url, options = {}) => {
    options.headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'x-auth-token': currentToken
    };
    return fetch(url, options);
};

// ----- LOGIN -----
const initLogin = () => {
    const form = document.getElementById('login-form');
    if (!form) return;
    const errObj = document.getElementById('login-error');
    const togglePassBtn = document.getElementById('toggle-password');
    const passInput = document.getElementById('senha');
    const toggleIcon = document.getElementById('toggle-password-icon');
    const demoBtn = document.getElementById('btn-quick-demo');

    // Password visibility toggle
    if (togglePassBtn && passInput) {
        togglePassBtn.addEventListener('click', () => {
            const isPass = passInput.type === 'password';
            passInput.type = isPass ? 'text' : 'password';
            if (toggleIcon) {
                toggleIcon.textContent = isPass ? 'visibility_off' : 'visibility';
            }
        });
    }

    // Quick demo button
    if (demoBtn) {
        demoBtn.addEventListener('click', () => {
            isDemoMode = true;
            currentToken = "demo_token";
            currentUser = { id: 'demo123', nome: 'Visitante (Demo)', empresa: 'Fazenda Hidrape', area_hectares: 42, tipoPlantacao: 'Milho', data_cadastro: new Date().toISOString() };

            const card = document.querySelector('.auth-card');
            if (card) {
                card.classList.add('fade-out');
                setTimeout(() => navigate('dashboard'), 400);
            } else {
                navigate('dashboard');
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalHtml = btn.innerHTML;
        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;

        try {
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-rounded" style="animation: rotate 0.8s linear infinite; font-size: 18px;">progress_activity</span><span>Autenticando...</span>`;
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });
            let data;
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await res.json();
            } else {
                throw new Error('Servidor temporariamente indisponível.');
            }

            if (!res.ok) throw new Error(data.error || 'Falha ao autenticar.');

            currentToken = data.token;
            currentUser = data.user;
            localStorage.setItem('jwt', currentToken);
            if (errObj) errObj.style.display = 'none';
            navigate('dashboard');
        } catch (e) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (errObj) {
                errObj.textContent = e.message;
                errObj.style.display = 'block';
            }
        }
    });
};

// ----- FORGOT PASSWORD -----
const initForgotPassword = () => {
    const form = document.getElementById('forgot-form');
    const msgObj = document.getElementById('forgot-msg');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        const email = document.getElementById('email').value;

        try {
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            msgObj.textContent = data.message;
            msgObj.style.color = 'var(--color-good)';
            msgObj.style.display = 'block';
            btn.textContent = 'Enviado';
        } catch (e) {
            btn.disabled = false;
            btn.textContent = originalText;
            msgObj.textContent = e.message;
            msgObj.style.color = 'var(--color-dry)';
            msgObj.style.display = 'block';
        }
    });
};

// ----- RESET PASSWORD -----
const initResetPassword = () => {
    const form = document.getElementById('reset-form');
    const msgObj = document.getElementById('reset-msg');
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        msgObj.textContent = 'Token de recuperação não encontrado. Solicite novamente.';
        msgObj.style.color = 'var(--color-dry)';
        msgObj.style.display = 'block';
        if (form) form.style.display = 'none';
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        const senha = document.getElementById('senha').value;
        const confirmaSenha = document.getElementById('confirmaSenha').value;

        if (senha !== confirmaSenha) {
            msgObj.textContent = 'As senhas não coincidem.';
            msgObj.style.color = 'var(--color-dry)';
            msgObj.style.display = 'block';
            return;
        }

        try {
            btn.disabled = true;
            btn.textContent = 'Atualizando...';
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, senha })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            msgObj.textContent = data.message;
            msgObj.style.color = 'var(--color-good)';
            msgObj.style.display = 'block';
            form.style.display = 'none';

            // Remover token da URL visualmente para limpeza
            window.history.replaceState({}, document.title, window.location.pathname);

            setTimeout(() => {
                navigate('login');
            }, 3000);
        } catch (e) {
            btn.disabled = false;
            btn.textContent = originalText;
            msgObj.textContent = e.message;
            msgObj.style.color = 'var(--color-dry)';
            msgObj.style.display = 'block';
        }
    });
};

// ----- REGISTER -----
const initRegister = () => {
    const form = document.getElementById('register-form');
    const errObj = document.getElementById('reg-error');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        const stateInput = document.getElementById('reg-estado').value;

        const body = {
            nome: document.getElementById('reg-nome').value,
            email: document.getElementById('reg-email').value,
            senha: document.getElementById('reg-senha').value,
            cidade: document.getElementById('reg-cidade').value,
            estado: stateInput ? stateInput.toUpperCase() : 'SP',
            tipoPlantacao: document.getElementById('reg-cultura').value
        };

        try {
            btn.disabled = true;
            btn.textContent = 'Processando Cadastro...';
            errObj.style.display = 'none';

            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            let data;
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await res.json();
            } else {
                throw new Error('Servidor temporariamente indisponível.');
            }
            if (!res.ok) throw new Error(data.error);

            currentToken = data.token;
            currentUser = data.user;
            localStorage.setItem('jwt', currentToken);
            isDemoMode = true;
            navigate('dashboard');
        } catch (e) {
            btn.disabled = false;
            btn.textContent = originalText;

            // Tratamento amigável para Network Errors (CORS, Load failed, ou Servidor Reiniciando)
            if (e.message.includes('Load failed') || e.message === 'Failed to fetch') {
                errObj.textContent = "Erro de conexão com o servidor. Aguarde 5 segundos e tente novamente.";
            } else {
                errObj.textContent = e.message;
            }
            errObj.style.display = 'block';
        }
    });
};

// ----- DASHBOARD (IA + CHART + AGRO) -----
const initDashboard = async () => {
    // 1. Limpeza Garantida (Travar Phantom Timers de duplo carregamento)
    if (liveInterval) { clearTimeout(liveInterval); liveInterval = null; }
    if (weatherInterval) { clearTimeout(weatherInterval); weatherInterval = null; }
    if (demoIntervalId) { clearInterval(demoIntervalId); demoIntervalId = null; }

    if (isDemoMode) {
        // Exibe badge demo
        const badge = document.getElementById('global-demo-badge');
        if (!badge) {
            const header = document.querySelector('.dash-top-bar > div:first-child');
            if (header) {
                const b = document.createElement('div');
                b.id = 'global-demo-badge';
                b.className = 'demo-badge';
                b.innerHTML = '<span class="badge-status-dot" style="background:#ff6b6b; box-shadow: 0 0 8px #ff6b6b"></span> MODO DEMONSTRAÇÃO';
                b.title = 'Você está explorando uma demonstração com dados simulados.';
                header.appendChild(b);
            }
        }

        demoIntervalId = setInterval(updateDemoData, 5000);
        setTimeout(startGuidedTour, 1000); // Tentar iniciar o tour 1s depois
    } else {
        const badge = document.getElementById('global-demo-badge');
        if (badge) badge.remove();
    }

    document.getElementById('dash-user').textContent = currentUser.nome.split(' ')[0];
    document.getElementById('dash-culture').textContent = currentUser.tipoPlantacao;

    // ----- PROFILE MENU DROPDOWN -----
    const profileBtn = document.getElementById('profile-menu-btn');
    const profileMenu = document.getElementById('profile-dropdown');
    if (profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = profileMenu.style.display === 'flex';
            if (isVisible) {
                profileMenu.style.opacity = '0';
                profileMenu.style.transform = 'scale(0.95)';
                setTimeout(() => profileMenu.style.display = 'none', 200);
            } else {
                // Break out of .main-content to fix backdrop-filter by appending to body
                const rect = profileBtn.getBoundingClientRect();
                if (profileMenu.parentNode !== document.body) {
                    document.body.appendChild(profileMenu);
                }

                profileMenu.style.top = (rect.bottom + window.scrollY + 12) + 'px';

                // Mobile-first fix for dropdown overflow
                if (window.innerWidth <= 768) {
                    profileMenu.style.left = '16px';
                    profileMenu.style.width = 'calc(100vw - 32px)';
                    profileMenu.style.maxWidth = 'calc(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right))';
                } else {
                    profileMenu.style.left = (rect.right + window.scrollX - 260) + 'px';
                    profileMenu.style.width = '260px';
                    profileMenu.style.maxWidth = 'none';
                }

                profileMenu.style.display = 'flex';
                // Trigger reflow
                profileMenu.offsetHeight;
                profileMenu.style.opacity = '1';
                profileMenu.style.transform = 'scale(1)';
            }
        });

        profileMenu.querySelectorAll('.dropdown-item[data-action]').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                if (action.startsWith('settings-')) {
                    const tab = action.split('-')[1];
                    window._targetSettingsTab = tab === 'prop' ? 'propriedade' : 'integracoes';

                    // Close menu gracefully before navigation
                    profileMenu.style.opacity = '0';
                    profileMenu.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        profileMenu.style.display = 'none';
                        navigate('settings');
                    }, 200);
                }
            });
        });
    }

    // Config Iniciais
    const valText = document.getElementById('umidade-valor');
    const varBar = document.getElementById('umidade-progress');
    const iaCard = document.getElementById('predict-card'); // updated to predict-card from generic copy
    const iaText = document.getElementById('ia-text');
    const iaIcon = document.getElementById('ia-icon');

    // Init Live Chart (Garbage Collector)
    if (liveChartObj) liveChartObj.destroy();
    const ctxLive = document.getElementById('liveChart').getContext('2d');
    Chart.defaults.color = 'rgba(255, 255, 255, 0.5)';
    Chart.defaults.font.family = "'Space Grotesk', sans-serif";
    Chart.defaults.font.weight = 500;
    Chart.defaults.font.size = 11;
    liveChartObj = new Chart(ctxLive, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Umidade (%)', data: [], borderColor: '#94B4C1', backgroundColor: 'rgba(148, 180, 193, 0.05)', fill: true, tension: 0.4, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 }] },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#94B4C1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
            scales: {
                x: {
                    ticks: { color: 'rgba(255, 255, 255, 0.4)' },
                    grid: { display: false }
                },
                y: {
                    max: 100,
                    min: 0,
                    beginAtZero: true,
                    ticks: { color: 'rgba(255, 255, 255, 0.4)' },
                    grid: { color: 'rgba(255, 255, 255, 0.03)' }
                }
            }
        }
    });

    // Init Weekly Analytics Chart (Garbage Collector)
    if (weeklyChartObj) weeklyChartObj.destroy();
    const ctxWeekly = document.getElementById('weeklyChart').getContext('2d');
    weeklyChartObj = new Chart(ctxWeekly, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Média Semanal (%)', data: [], backgroundColor: 'rgba(148, 180, 193, 0.4)', borderRadius: 4, hoverBackgroundColor: '#94B4C1' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#94B4C1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
            scales: {
                x: {
                    ticks: { color: 'rgba(255, 255, 255, 0.4)' },
                    grid: { display: false }
                },
                y: {
                    max: 100,
                    min: 0,
                    beginAtZero: true,
                    ticks: { color: 'rgba(255, 255, 255, 0.4)' },
                    grid: { color: 'rgba(255, 255, 255, 0.03)' }
                }
            }
        }
    });

    // Leaflet Map Init
    let farmMap = null;
    let farmCircle = null;
    if (document.getElementById('farm-map') && typeof L !== 'undefined') {
        const mapContainer = L.DomUtil.get('farm-map');
        if (mapContainer != null) {
            mapContainer._leaflet_id = null;
        }
        const lat = parseFloat(currentUser.lat) || -23.55;
        const lon = parseFloat(currentUser.lon) || -46.63;

        if (isNaN(lat) || isNaN(lon)) {
            console.error("Coordenadas inválidas para o mapa", currentUser);
        }

        farmMap = L.map('farm-map').setView([lat, lon], 14);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }).addTo(farmMap);

        L.marker([lat, lon]).addTo(farmMap)
            .bindPopup(`<b>${currentUser.nome}</b><br>Cultivo: ${currentUser.tipoPlantacao}`).openPopup();

        farmCircle = L.circle([lat, lon], {
            color: 'var(--color-good)',
            fillColor: 'var(--color-good)',
            fillOpacity: 0.2,
            radius: 800 // 800 metros
        }).addTo(farmMap);

        // Fix de renderização para Single Page Applications (Força o cálculo de tamanho após o DOM pintar)
        setTimeout(() => {
            if (farmMap) {
                farmMap.invalidateSize();
                // Algumas vezes o leaflet precisa de mais um empurrão visual
                window.dispatchEvent(new Event('resize'));
            }
        }, 500);

        // -- NOVA FEATURE: Geolocalização em Tempo Real do Celular/PC do Usuário --
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const userLat = pos.coords.latitude;
                    const userLon = pos.coords.longitude;

                    const userMarker = L.marker([userLat, userLon]).addTo(farmMap)
                        .bindPopup("<b>Você está aqui</b><br>Monitorando remotamente");

                    // Cria um grupo visual para centralizar a câmera enxergando tanto você quanto a fazenda
                    const group = new L.featureGroup([
                        L.marker([lat, lon]),
                        userMarker
                    ]);
                    farmMap.fitBounds(group.getBounds().pad(0.3));
                },
                (err) => {
                    console.warn("Geolocalização não permitida pelo usuário ou falhou", err);
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    }

    // Modal NASA
    let nasaChartObj = null;
    const nasaCard = document.getElementById('nasa-card');
    if (nasaCard) {
        nasaCard.addEventListener('click', () => {
            if (!window._latestSat || !window._latestSat.historico) return;

            const modal = document.getElementById('nasa-modal');
            document.body.appendChild(modal);
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            const hist = window._latestSat.historico;
            const ctxNasa = document.getElementById('nasaChart').getContext('2d');
            if (nasaChartObj) nasaChartObj.destroy();
            nasaChartObj = new Chart(ctxNasa, {
                type: 'line',
                data: {
                    labels: hist.map(h => h.data.slice(-5)),
                    datasets: [{
                        label: 'Umidade Macro (%)',
                        data: hist.map(h => h.valor),
                        borderColor: '#f39c12',
                        backgroundColor: 'rgba(243, 156, 18, 0.2)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#f39c12', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
                    scales: {
                        x: { ticks: { color: 'rgba(255, 255, 255, 0.4)' }, grid: { display: false } },
                        y: { max: 100, min: 0, beginAtZero: true, ticks: { color: 'rgba(255, 255, 255, 0.4)' }, grid: { color: 'rgba(255, 255, 255, 0.03)' } }
                    }
                }
            });
        });
    }
    const closeNasaBtn = document.getElementById('close-nasa-modal');
    if (closeNasaBtn) {
        closeNasaBtn.addEventListener('click', () => {
            const modal = document.getElementById('nasa-modal');
            modal.style.display = 'none';
            document.body.style.overflow = '';

            const appContent = document.getElementById('app-content');
            if (appContent) appContent.appendChild(modal);
        });
    }

    // CORE 1: IoT Hardware Polling Ligeiro (A cada 5s)
    const updateIoT = async () => {
        try {
            const valText = document.getElementById('umidade-valor');
            const varBar = document.getElementById('umidade-progress');
            const iaCard = document.getElementById('predict-card');
            const iaText = document.getElementById('ia-text');
            const iaIcon = document.getElementById('ia-icon');

            // Proteção Assíncrona
            if (!valText) return;

            const setOfflineState = () => {
                if (valText) {
                    valText.textContent = '--';
                    valText.style.color = '#ff4444';
                }
                if (varBar) {
                    varBar.style.width = `100%`; // Para a barra ficar toda vermelha (opcional, ou 0% vermelha? Melhor 100% vermelha indicando erro total)
                    varBar.style.backgroundColor = 'rgba(255, 68, 68, 0.2)';
                }
                if (iaText) iaText.textContent = "Aviso Crítico: Sem comunicação com o sensor. Verifique se o equipamento tem internet/Wi-Fi. Se não voltar, contate o técnico.";
                if (iaIcon) {
                    iaIcon.textContent = "wifi_off";
                    iaIcon.style.color = "#ff4444";
                }
                if (iaCard) iaCard.style.boxShadow = `0 8px 32px 0 rgba(255,68,68,0.15)`;
                const soilInsight = document.getElementById('soil-insight');
                if (soilInsight) {
                    soilInsight.textContent = "EQUIPAMENTO OFFLINE";
                    soilInsight.style.color = "#ff4444";
                    soilInsight.style.fontWeight = "bold";
                }

                const sysStatus = document.getElementById('sys-status');
                if (sysStatus) {
                    sysStatus.style.background = '#ff4444';
                    sysStatus.nextElementSibling.textContent = 'Offline';
                    sysStatus.nextElementSibling.style.color = '#ff4444';
                }

                window._sensorState = { status: 'offline', hasValidData: false };
                renderInteligence();
            };

            let res;
            try {
                res = await setupAuthFetch('/api/sensores/umidade');
            } catch (err) {
                console.error('Fetch IoT Error', err);
                setOfflineState();
                return;
            }

            if (!res.ok) {
                setOfflineState();
                return;
            }

            const data = await res.json();

            // UI
            valText.textContent = data.umidade.toFixed(1);
            varBar.style.width = `${data.umidade}%`;

            // Micro-animation on value change
            valText.classList.remove('kpi-update');
            void valText.offsetWidth; // force reflow
            valText.classList.add('kpi-update');

            let color = 'var(--color-good)';
            let glowKey = 'good';
            if (data.status === 'SECO') { color = 'var(--color-dry)'; glowKey = 'dry'; iaIcon.textContent = 'water_drop'; }
            if (data.status === 'ENCHARCADO') { color = 'var(--color-dry)'; glowKey = 'dry'; iaIcon.textContent = 'flood'; }
            if (data.status === 'IDEAL') { color = 'var(--color-good)'; glowKey = 'good'; iaIcon.textContent = 'eco'; }

            // Signature card glow
            const sigCard = document.querySelector('.card-signature');
            if (sigCard) sigCard.setAttribute('data-glow', glowKey);

            // Soil insight text
            const soilInsight = document.getElementById('soil-insight');
            if (soilInsight) {
                const cultura = currentUser?.tipoPlantacao || 'cultura';
                if (data.status === 'IDEAL') soilInsight.textContent = `${data.umidade.toFixed(0)}% — dentro da faixa ideal para ${cultura.toLowerCase()}`;
                else if (data.status === 'SECO') soilInsight.textContent = `${data.umidade.toFixed(0)}% — abaixo do limite ideal. Considere irrigar.`;
                else if (data.status === 'ENCHARCADO') soilInsight.textContent = `${data.umidade.toFixed(0)}% — acima do ideal. Suspenda irrigação.`;
            }

            valText.style.color = color;
            varBar.style.backgroundColor = color;
            if (iaCard) iaCard.style.boxShadow = `0 4px 20px 0 ${color}15`;
            if (iaText) iaText.textContent = data.diagnostico;

            const sysStatus = document.getElementById('sys-status');
            if (sysStatus) {
                sysStatus.style.background = 'var(--color-good)';
                sysStatus.nextElementSibling.textContent = 'Online';
                sysStatus.nextElementSibling.style.color = 'var(--sys-light)';
            }

            // Live Chart Append
            const tLabel = new Date(data.timestamp).toLocaleTimeString('pt-BR');
            liveChartObj.data.labels.push(tLabel);
            liveChartObj.data.datasets[0].data.push(data.umidade);
            if (liveChartObj.data.labels.length > 20) {
                liveChartObj.data.labels.shift();
                liveChartObj.data.datasets[0].data.shift();
            }
            liveChartObj.update();

            // Store para Engine IA global e Roda Update
            window._latestUmid = data.umidade;
            window._latestStatus = data.status;
            window._sensorState = { status: 'online', hasValidData: true };
            renderInteligence();
        } catch (e) { console.error('API IoT Error', e); }
        finally {
            if (document.getElementById('umidade-valor')) {
                liveInterval = setTimeout(updateIoT, 5000); // Polling Seguro em Fila
            }
        }
    };

    // CORE 2: Data Engineering Polling Lento (A cada 10mins = Cache Safe)
    const updateAgro = async () => {
        try {
            // -- CLIMA & IA --
            const resClima = await setupAuthFetch('/api/agro/clima');
            const agroData = await resClima.json();

            if (!document.getElementById('predict-text')) return;

            if (agroData && agroData.clima && agroData.clima.current) {
                if (document.getElementById('clima-cidade')) {

                    document.getElementById('clima-cidade').textContent = agroData.cidade;
                    document.getElementById('clima-temp').textContent = Math.round(agroData.clima.current.temperature_2m) + '°C';

                    // O Open-Meteo V1 entrega exato em .current
                    const arNivel = agroData.clima.current.relative_humidity_2m !== undefined ? agroData.clima.current.relative_humidity_2m : '--';
                    document.getElementById('clima-umid').textContent = 'Ar: ' + arNivel + '%';

                    // Tradução do Ícone WeatherCode (WMO) Standard (Ex: 0 = limpo, 1,2,3 = parcial, 61+ = chuva)
                    const code = agroData.clima.current.weather_code;
                    const isDay = agroData.clima.current.is_day === 1; // Booleano retornado 1(Dia) / 0(Noite)

                    let icon = 'routine';
                    if (code <= 3) {
                        // Limpo ou Parcialmente Nublado
                        icon = isDay ? 'sunny' : 'mode_night';
                    }
                    else if (code <= 69) {
                        // Chuvoso ou Neve
                        icon = 'rainy';
                    }
                    else if (code <= 99) {
                        // Tempestade
                        icon = 'thunderstorm';
                    }
                    document.getElementById('clima-icon').textContent = icon;
                }
            } else if (document.getElementById('clima-cidade')) {
                document.getElementById('clima-cidade').textContent = "Erro API Clima";
                document.getElementById('clima-temp').textContent = "--°C";
            }

            // Binding Previsão Regras UI (Matemática Pura -> IA Generativa)
            document.getElementById('predict-text').innerHTML = `<span style="opacity:0.7">Gerando IA...</span>`;

            try {
                const iaRes = await setupAuthFetch('/api/agro/insights-ia');
                if (!iaRes.ok) throw new Error("IA Fallback");
                const iaData = await iaRes.json();

                document.getElementById('predict-text').innerHTML = `
                    <span style="font-size: 0.75rem; background: var(--color-good); padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-bottom: 6px; display: inline-block; color: white;">✦ IA GENERATIVA</span><br/>
                    ${iaData.diagnostico}
                `;
            } catch (err) {
                // Fallback para a recomendação puramente matemática se a IA falhar
                document.getElementById('predict-text').textContent = agroData.previsao.recomendacao;
            }

            let timeText = Math.round(agroData.previsao.tempoHoras) + 'H';
            if (agroData.previsao.tempoHoras <= 0) timeText = 'AGORA';
            if (agroData.previsao.tempoHoras === 99) timeText = 'LOCK'; // Trava de Segurança Hídrica (Chuva)

            document.getElementById('predict-time').textContent = timeText;

            const pCard = document.getElementById('predict-card');
            const pIconWrap = document.getElementById('predict-icon-wrapper');
            const pIcon = document.getElementById('predict-icon');

            if (agroData.previsao.status === 'indisponivel') {
                pCard.style.borderLeft = '4px solid var(--sys-light)';
                pIconWrap.style.background = 'rgba(255, 255, 255, 0.1)';
                pIcon.style.color = 'var(--sys-light)';
                pIcon.textContent = 'wifi_off';
                document.getElementById('predict-time').textContent = '--';
            } else if (agroData.previsao.status === 'critico') {
                pCard.style.borderLeft = '4px solid var(--color-dry)';
                pIconWrap.style.background = 'var(--color-dry)';
                pIcon.style.color = 'white';
                pIcon.textContent = 'warning';
            } else if (agroData.previsao.status === 'alerta') {
                pCard.style.borderLeft = '4px solid #f39c12';
                pIconWrap.style.background = '#f39c12';
                pIcon.style.color = 'white';
                pIcon.textContent = 'schedule';
            } else {
                pCard.style.borderLeft = '4px solid var(--color-good)';
                pIconWrap.style.background = 'var(--color-good)';
                pIcon.style.color = 'var(--bg-main)';
                pIcon.textContent = 'psychiatry'; // Planta Segura Icon
            }

            // -- CHART ANALISE SEMANAL DB --
            const resWeek = await setupAuthFetch('/api/agro/media-semanal');
            const weekData = await resWeek.json();
            weeklyChartObj.data.labels = weekData.map(w => w.dia);
            weeklyChartObj.data.datasets[0].data = weekData.map(w => w.media);
            weeklyChartObj.update();

            // Store para Engine IA e Roda Update
            window._latestClima = agroData.clima;
            window._latestSemana = weekData;
            window._latestSat = agroData.satelite;
            window._sensorState = agroData.sensorState || null;

            // Adicionar aviso de sensor stale se aplicavel
            const soilInsight = document.getElementById('soil-insight');
            if (agroData.sensorState && agroData.sensorState.status === 'stale' && soilInsight) {
                soilInsight.innerHTML = `<span style="color:#f39c12">⚠️ Dados desatualizados (${agroData.sensorState.dataAgeMinutes}m atrás)</span>`;
            } else if (agroData.sensorState && agroData.sensorState.status === 'offline' && soilInsight) {
                soilInsight.innerHTML = `<span style="color:#ff4444">⚠️ Sensor offline</span>`;
            }

            // Satelite Update UI
            if (agroData.satelite && document.getElementById('satelite-valor')) {
                document.getElementById('satelite-valor').textContent = agroData.satelite.umidadeMacro;
                document.getElementById('satelite-data').textContent = 'Ref: ' + agroData.satelite.dataReferencia;
            } else if (document.getElementById('satelite-valor')) {
                document.getElementById('satelite-data').textContent = 'Dados indisponíveis';
            }

            renderInteligence();

            // Render Heatmap NDVI (Estresse Hídrico) no Mapa
            if (typeof farmMap !== 'undefined' && farmMap && typeof L !== 'undefined' && L.heatLayer) {
                if (window._heatLayer) {
                    farmMap.removeLayer(window._heatLayer);
                }

                // Baseado no status da IA: critico (seco/vermelho), alerta (amarelo), bom (verde)
                const isCritico = agroData.previsao.status === 'critico';
                const isAlerta = agroData.previsao.status === 'alerta';

                // Recuperar tamanho em Hectares
                const tamanhoHectares = currentUser.tamanhoFazenda || 10;
                const sideMeters = Math.sqrt(tamanhoHectares * 10000);
                const degreeOffset = (sideMeters / 2) / 111000; // Aproximação métrica para graus

                const baseLat = parseFloat(currentUser.lat) || -23.55;
                const baseLon = parseFloat(currentUser.lon) || -46.63;

                // Algoritmo PRNG (Pseudo-Random Number Generator) simples (Mulberry32)
                // Usamos lat+lon para gerar um seed fixo para o terreno.
                let seed = Math.floor(Math.abs(baseLat + baseLon) * 1000000);
                const randomGen = () => {
                    let t = seed += 0x6D2B79F5;
                    t = Math.imul(t ^ t >>> 15, t | 1);
                    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
                    return ((t ^ t >>> 14) >>> 0) / 4294967296;
                };

                // Gerar vértices do Polígono Orgânico de forma fixa usando o PRNG
                const numVertices = 6;
                const polygonPoints = [];
                for (let v = 0; v < numVertices; v++) {
                    const angle = (v / numVertices) * Math.PI * 2;
                    // Variação orgânica entre 70% e 130% do raio projetado, mas fixo para a coordenada
                    const deformacao = 0.7 + randomGen() * 0.6;
                    const vLat = baseLat + Math.cos(angle) * degreeOffset * deformacao;
                    const vLon = baseLon + Math.sin(angle) * degreeOffset * deformacao;
                    polygonPoints.push([vLat, vLon]);
                }

                // Limpar polígono anterior se existir
                if (window._farmBoundary) farmMap.removeLayer(window._farmBoundary);

                // Desenhar Polígono (Cerca Orgânica da Fazenda)
                window._farmBoundary = L.polygon(polygonPoints, {
                    color: 'var(--sys-accent, #ff3300)',
                    weight: 2,
                    dashArray: '5, 5',
                    fillOpacity: 0
                }).addTo(farmMap);

                // Forçar a câmera a focar na área exata do polígono irregular
                farmMap.fitBounds(window._farmBoundary.getBounds(), { padding: [20, 20] });

                // Criar malha térmica (Grid) fixo (Seeded Noise) no relevo da fazenda para parecer uma máscara de satélite real
                const heatPoints = [];
                // Preencher o polígono com uma grade densa para efeito de "lente"
                for (let i = 0; i < 600; i++) {
                    const angle = randomGen() * Math.PI * 2;
                    const r = Math.sqrt(randomGen()) * degreeOffset * 0.9; // sqrt para distribuição uniforme no círculo
                    const rLat = baseLat + Math.cos(angle) * r;
                    const rLon = baseLon + Math.sin(angle) * r;
                    const intensity = 0.4 + randomGen() * 0.6; // Intensidade fixa da matriz local
                    heatPoints.push([rLat, rLon, intensity]);
                }

                // Buscar dados reais do Radar Meteorológico Global (RainViewer)
                let rainUrl = '';
                try {
                    const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                    if (rvRes.ok) {
                        const rvData = await rvRes.json();
                        if (rvData.radar && rvData.radar.past && rvData.radar.past.length > 0) {
                            const lastFrame = rvData.radar.past[rvData.radar.past.length - 1];
                            rainUrl = `https://tilecache.rainviewer.com${lastFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;
                        }
                    }
                } catch (e) { console.error('Erro ao buscar RainViewer', e); }

                // Definir Cores do NDVI: Verde (Bom) | Amarelo (Alerta) | Vermelho (Estresse Crítico)
                // A intensidade das manchas será direcionada pelos dados reais do agroData.
                let hGradient = { 0.4: '#00ff00', 0.65: '#ffff00', 1.0: '#ff0000' };
                if (!isCritico && !isAlerta) hGradient = { 0.3: '#00ffff', 0.6: '#00ff00', 1.0: '#00aa00' };
                else if (isAlerta) hGradient = { 0.4: '#00ff00', 0.7: '#ffff00', 1.0: '#ff9900' };

                if (window._ndviLayer) farmMap.removeLayer(window._ndviLayer);
                if (window._rainLayer) farmMap.removeLayer(window._rainLayer);

                // Camada 1: NDVI (Máscara Hídrica)
                window._ndviLayer = L.heatLayer(heatPoints, {
                    radius: Math.max(25, 80 - Math.log(tamanhoHectares) * 5),
                    blur: Math.max(20, 50 - Math.log(tamanhoHectares) * 3),
                    maxZoom: 18,
                    minOpacity: 0.4,
                    gradient: hGradient
                });

                // Camada 2: Chuva (Real-Time Radar TileLayer)
                if (rainUrl) {
                    window._rainLayer = L.tileLayer(rainUrl, {
                        maxZoom: 18,
                        maxNativeZoom: 12,
                        opacity: 0.7,
                        zIndex: 10
                    });
                } else {
                    // Fallback visual vazio se API de radar falhar
                    window._rainLayer = L.heatLayer([], { maxZoom: 18 });
                }

                // Default layer é NDVI
                window._ndviLayer.addTo(farmMap);
                window._currentLayer = 'ndvi';

                // Lógica de texto da IA
                const cultura = escapeHTML(currentUser.tipoPlantacao || 'plantação');
                const updateIAText = (layer) => {
                    const ndviTextObj = document.getElementById('ndvi-analysis-text');
                    if (!ndviTextObj) return;

                    if (layer === 'ndvi') {
                        if (isCritico) {
                            ndviTextObj.innerHTML = `<strong>Atenção Crítica:</strong> As manchas vermelhas indicam alto estresse hídrico na sua lavoura de <strong>${cultura.toLowerCase()}</strong>. A atividade fotossintética está caindo rapidamente devido à seca severa. Sugerimos ativar o sistema de irrigação com máxima urgência para evitar perdas irreparáveis de colheita.`;
                        } else if (isAlerta) {
                            ndviTextObj.innerHTML = `<strong>Alerta Moderado:</strong> As manchas amarelas revelam que a sua lavoura de <strong>${cultura.toLowerCase()}</strong> está começando a perder vigor vegetativo. A umidade do solo está caindo. Planeje um turno de rega em breve para manter a saúde das folhas e garantir a absorção de nutrientes.`;
                        } else {
                            ndviTextObj.innerHTML = `<strong>Condição Ideal:</strong> As áreas em verde mostram vegetação super saudável. A sua cultura de <strong>${cultura.toLowerCase()}</strong> está com balanço hídrico adequado e não apresenta sinais de estresse termal. Nenhuma intervenção no pivô/gotejamento é necessária no momento.`;
                        }
                    } else if (layer === 'rain') {
                        if (rainUrl) {
                            ndviTextObj.innerHTML = `<strong>Radar Meteorológico Ativo (Real-time):</strong> Exibindo cobertura de nuvens e precipitação real sobre a sua coordenada agora. O radar global cruza sinais físicos para projetar volume hídrico no solo.`;
                        } else {
                            ndviTextObj.innerHTML = `<strong>Radar Indisponível:</strong> Sinal do satélite meteorológico enfraquecido no momento.`;
                        }
                    }
                };

                updateIAText('ndvi');

                // Toggle Listeners
                const btnNdvi = document.getElementById('btn-layer-ndvi');
                const btnRain = document.getElementById('btn-layer-rain');
                const legNdvi = document.getElementById('legend-ndvi');
                const legRain = document.getElementById('legend-rain');

                if (btnNdvi && btnRain) {
                    // Remover listeners antigos para evitar duplicação em re-renders
                    const newBtnNdvi = btnNdvi.cloneNode(true);
                    const newBtnRain = btnRain.cloneNode(true);
                    btnNdvi.parentNode.replaceChild(newBtnNdvi, btnNdvi);
                    btnRain.parentNode.replaceChild(newBtnRain, btnRain);

                    newBtnNdvi.addEventListener('click', () => {
                        if (window._currentLayer === 'ndvi') return;
                        farmMap.removeLayer(window._rainLayer);
                        window._ndviLayer.addTo(farmMap);
                        window._currentLayer = 'ndvi';

                        newBtnNdvi.style.background = 'var(--sys-secondary)';
                        newBtnNdvi.style.color = 'white';
                        newBtnRain.style.background = 'transparent';
                        newBtnRain.style.color = 'rgba(255,255,255,0.6)';

                        if (legNdvi) legNdvi.style.display = 'flex';
                        if (legRain) legRain.style.display = 'none';

                        updateIAText('ndvi');
                    });

                    newBtnRain.addEventListener('click', () => {
                        if (window._currentLayer === 'rain') return;
                        farmMap.removeLayer(window._ndviLayer);
                        window._rainLayer.addTo(farmMap);
                        window._currentLayer = 'rain';

                        newBtnRain.style.background = 'var(--sys-secondary)';
                        newBtnRain.style.color = 'white';
                        newBtnNdvi.style.background = 'transparent';
                        newBtnNdvi.style.color = 'rgba(255,255,255,0.6)';

                        if (legRain) legRain.style.display = 'flex';
                        if (legNdvi) legNdvi.style.display = 'none';

                        updateIAText('rain');
                    });
                }
            }

        } catch (e) { console.error('Agro Sync Error', e); }
        finally {
            if (document.getElementById('clima-cidade')) {
                weatherInterval = setTimeout(updateAgro, 10 * 60 * 1000); // Polling Seguro em Fila
            }
        }
    };

    // Kickoff Inicial Duplo // Recursive call inside handles timings.
    updateIoT();
    updateAgro();
};


// ----- GEOESPACIAL (MAPA + CLIMA) -----
const initGeo = async () => {
    if (weatherInterval) { clearTimeout(weatherInterval); weatherInterval = null; }

    // Leaflet Map Init
    let farmMap = null;
    let farmCircle = null;
    if (document.getElementById('farm-map') && typeof L !== 'undefined') {
        const mapContainer = L.DomUtil.get('farm-map');
        if (mapContainer != null) {
            mapContainer._leaflet_id = null;
        }
        const lat = parseFloat(currentUser.lat) || -23.55;
        const lon = parseFloat(currentUser.lon) || -46.63;

        farmMap = L.map('farm-map').setView([lat, lon], 14);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri'
        }).addTo(farmMap);

        L.marker([lat, lon]).addTo(farmMap)
            .bindPopup(`<b>${currentUser.nome}</b><br>Cultivo: ${currentUser.tipoPlantacao}`).openPopup();

        farmCircle = L.circle([lat, lon], {
            color: 'var(--color-good)',
            fillColor: 'var(--color-good)',
            fillOpacity: 0.2,
            radius: 800
        }).addTo(farmMap);

        setTimeout(() => {
            if (farmMap) {
                farmMap.invalidateSize();
                window.dispatchEvent(new Event('resize'));
            }
        }, 500);
    }

    const updateGeo = async () => {
        try {
            const resClima = await setupAuthFetch('/api/agro/clima');
            const agroData = await resClima.json();

            if (!document.getElementById('clima-cidade')) return;

            if (agroData && agroData.clima && agroData.clima.current) {
                document.getElementById('clima-cidade').textContent = agroData.cidade;
                document.getElementById('clima-temp').textContent = Math.round(agroData.clima.current.temperature_2m) + '°C';

                const arNivel = agroData.clima.current.relative_humidity_2m !== undefined ? agroData.clima.current.relative_humidity_2m : '--';
                document.getElementById('clima-umid').textContent = 'Ar: ' + arNivel + '%';

                const code = agroData.clima.current.weather_code;
                const isDay = agroData.clima.current.is_day === 1;

                let icon = 'routine';
                if (code <= 3) icon = isDay ? 'sunny' : 'mode_night';
                else if (code <= 69) icon = 'rainy';
                else if (code <= 99) icon = 'thunderstorm';
                document.getElementById('clima-icon').textContent = icon;
            }

            if (typeof farmMap !== 'undefined' && farmMap && typeof L !== 'undefined' && L.heatLayer) {
                if (window._heatLayer) farmMap.removeLayer(window._heatLayer);

                const isCritico = agroData.previsao && agroData.previsao.status === 'critico';
                const isAlerta = agroData.previsao && agroData.previsao.status === 'alerta';

                const tamanhoHectares = currentUser.tamanhoFazenda || 10;
                const sideMeters = Math.sqrt(tamanhoHectares * 10000);
                const degreeOffset = (sideMeters / 2) / 111000;

                const baseLat = parseFloat(currentUser.lat) || -23.55;
                const baseLon = parseFloat(currentUser.lon) || -46.63;

                let seed = Math.floor(Math.abs(baseLat + baseLon) * 1000000);
                const randomGen = () => {
                    let t = seed += 0x6D2B79F5;
                    t = Math.imul(t ^ t >>> 15, t | 1);
                    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
                    return ((t ^ t >>> 14) >>> 0) / 4294967296;
                };

                const numVertices = 6;
                const polygonPoints = [];
                for (let v = 0; v < numVertices; v++) {
                    const angle = (v / numVertices) * Math.PI * 2;
                    const deformacao = 0.7 + randomGen() * 0.6;
                    const vLat = baseLat + Math.cos(angle) * degreeOffset * deformacao;
                    const vLon = baseLon + Math.sin(angle) * degreeOffset * deformacao;
                    polygonPoints.push([vLat, vLon]);
                }

                if (window._farmBoundary) farmMap.removeLayer(window._farmBoundary);

                window._farmBoundary = L.polygon(polygonPoints, {
                    color: 'var(--sys-accent, #ff3300)',
                    weight: 2,
                    dashArray: '5, 5',
                    fillOpacity: 0
                }).addTo(farmMap);

                farmMap.fitBounds(window._farmBoundary.getBounds(), { padding: [20, 20] });

                const heatPoints = [];
                for (let i = 0; i < 600; i++) {
                    const angle = randomGen() * Math.PI * 2;
                    const r = Math.sqrt(randomGen()) * degreeOffset * 0.9;
                    const rLat = baseLat + Math.cos(angle) * r;
                    const rLon = baseLon + Math.sin(angle) * r;
                    const intensity = 0.4 + randomGen() * 0.6;
                    heatPoints.push([rLat, rLon, intensity]);
                }

                let rainUrl = '';
                try {
                    const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                    if (rvRes.ok) {
                        const rvData = await rvRes.json();
                        if (rvData.radar && rvData.radar.past && rvData.radar.past.length > 0) {
                            const lastFrame = rvData.radar.past[rvData.radar.past.length - 1];
                            rainUrl = `https://tilecache.rainviewer.com${lastFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;
                        }
                    }
                } catch (e) { }

                let hGradient = { 0.4: '#00ff00', 0.65: '#ffff00', 1.0: '#ff0000' };
                if (!isCritico && !isAlerta) hGradient = { 0.3: '#00ffff', 0.6: '#00ff00', 1.0: '#00aa00' };
                else if (isAlerta) hGradient = { 0.4: '#00ff00', 0.7: '#ffff00', 1.0: '#ff9900' };

                if (window._ndviLayer) farmMap.removeLayer(window._ndviLayer);
                if (window._rainLayer) farmMap.removeLayer(window._rainLayer);

                window._ndviLayer = L.heatLayer(heatPoints, {
                    radius: Math.max(25, 80 - Math.log(tamanhoHectares) * 5),
                    blur: Math.max(20, 50 - Math.log(tamanhoHectares) * 3),
                    maxZoom: 18,
                    minOpacity: 0.4,
                    gradient: hGradient
                });

                if (rainUrl) {
                    window._rainLayer = L.tileLayer(rainUrl, { maxZoom: 18, maxNativeZoom: 12, opacity: 0.7, zIndex: 10 });
                } else {
                    window._rainLayer = L.heatLayer([], { maxZoom: 18 });
                }

                window._ndviLayer.addTo(farmMap);
                window._currentLayer = 'ndvi';

                const cultura = escapeHTML(currentUser.tipoPlantacao || 'plantação');
                const updateIAText = (layer) => {
                    const ndviTextObj = document.getElementById('ndvi-analysis-text');
                    if (!ndviTextObj) return;

                    if (layer === 'ndvi') {
                        if (isCritico) ndviTextObj.innerHTML = `<strong>Atenção Crítica:</strong> As manchas vermelhas indicam alto estresse hídrico na sua lavoura de <strong>${cultura.toLowerCase()}</strong>.`;
                        else if (isAlerta) ndviTextObj.innerHTML = `<strong>Alerta Moderado:</strong> As manchas amarelas revelam que a sua lavoura de <strong>${cultura.toLowerCase()}</strong> está começando a perder vigor vegetativo.`;
                        else ndviTextObj.innerHTML = `<strong>Condição Ideal:</strong> As áreas em verde mostram vegetação super saudável na cultura de <strong>${cultura.toLowerCase()}</strong>.`;
                    } else if (layer === 'rain') {
                        if (rainUrl) ndviTextObj.innerHTML = `<strong>Radar Meteorológico Ativo (Real-time):</strong> Exibindo cobertura de nuvens e precipitação real sobre a sua coordenada agora.`;
                        else ndviTextObj.innerHTML = `<strong>Radar Indisponível:</strong> Sinal do satélite meteorológico enfraquecido no momento.`;
                    }
                };

                updateIAText('ndvi');

                const btnNdvi = document.getElementById('btn-layer-ndvi');
                const btnRain = document.getElementById('btn-layer-rain');
                const legNdvi = document.getElementById('legend-ndvi');
                const legRain = document.getElementById('legend-rain');

                if (btnNdvi && btnRain) {
                    const newBtnNdvi = btnNdvi.cloneNode(true);
                    const newBtnRain = btnRain.cloneNode(true);
                    btnNdvi.parentNode.replaceChild(newBtnNdvi, btnNdvi);
                    btnRain.parentNode.replaceChild(newBtnRain, btnRain);

                    newBtnNdvi.addEventListener('click', () => {
                        if (window._currentLayer === 'ndvi') return;
                        farmMap.removeLayer(window._rainLayer);
                        window._ndviLayer.addTo(farmMap);
                        window._currentLayer = 'ndvi';

                        newBtnNdvi.style.background = 'var(--sys-secondary)';
                        newBtnNdvi.style.color = 'white';
                        newBtnRain.style.background = 'transparent';
                        newBtnRain.style.color = 'rgba(255,255,255,0.6)';

                        if (legNdvi) legNdvi.style.display = 'flex';
                        if (legRain) legRain.style.display = 'none';

                        updateIAText('ndvi');
                    });

                    newBtnRain.addEventListener('click', () => {
                        if (window._currentLayer === 'rain') return;
                        farmMap.removeLayer(window._ndviLayer);
                        window._rainLayer.addTo(farmMap);
                        window._currentLayer = 'rain';

                        newBtnRain.style.background = 'var(--sys-secondary)';
                        newBtnRain.style.color = 'white';
                        newBtnNdvi.style.background = 'transparent';
                        newBtnNdvi.style.color = 'rgba(255,255,255,0.6)';

                        if (legRain) legRain.style.display = 'flex';
                        if (legNdvi) legNdvi.style.display = 'none';

                        updateIAText('rain');
                    });
                }
            }
        } catch (e) { console.error('Geo Sync Error', e); }
        finally {
            if (document.getElementById('clima-cidade')) {
                weatherInterval = setTimeout(updateGeo, 10 * 60 * 1000);
            }
        }
    };

    updateGeo();
};


// ----- HISTORY -----
const initHistory = () => {
    let currentPage = 1;
    const limit = 15;

    const loadPage = async () => {
        try {
            const res = await setupAuthFetch(`/api/sensores/historico?page=${currentPage}&limit=${limit}`);
            const payload = await res.json();

            const tbody = document.getElementById('history-tbody');
            tbody.innerHTML = '';

            // Note: DB returns chronologically, we reverse to show latest at top in the view if desired,
            // but controller already reversed it for charting. 
            // In API we returned `data` array reversed? Yes, reversed to oldest..newest. Let's reverse back for table.
            let tableData = [...payload.data].reverse();

            tableData.forEach(d => {
                let colorClass = 'text-good';
                if (d.status === 'SECO') colorClass = 'text-dry';
                else if (d.status === 'ENCHARCADO') colorClass = 'text-dry';

                tbody.innerHTML += `
                    <tr>
                        <td>${new Date(d.dataFull).toLocaleString('pt-BR')}</td>
                        <td class="font-kpi ${colorClass}" style="font-size: 1rem;">${d.umidade.toFixed(1)}%</td>
                        <td>
                            <span class="status-badge ${colorClass}">${d.status}</span>
                        </td>
                    </tr>
                `;
            });

            document.getElementById('hist-page-info').textContent = `Página ${payload.meta.page} de ${payload.meta.pages || 1}`;

            document.getElementById('hist-prev').disabled = payload.meta.page <= 1;
            document.getElementById('hist-next').disabled = payload.meta.page >= payload.meta.pages;

        } catch (e) {
            console.error(e);
        }
    };

    document.getElementById('btn-refresh-history').addEventListener('click', loadPage);
    document.getElementById('hist-prev').addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadPage(); } });
    document.getElementById('hist-next').addEventListener('click', () => { currentPage++; loadPage(); });

    loadPage();
};

// ----- SETTINGS -----
const initSettings = async () => {
    // Tab logic
    document.querySelectorAll('.settings-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Reset all tabs
            document.querySelectorAll('.settings-tab').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = 'var(--neutral-300)';
                b.style.borderColor = 'transparent';
                const icon = b.querySelector('.material-symbols-rounded');
                if (icon) icon.style.color = 'inherit';
            });

            // Activate clicked tab
            const target = e.currentTarget;
            target.classList.add('active');
            target.style.background = 'rgba(255,255,255,0.05)';
            target.style.color = '#fff';
            target.style.borderColor = 'rgba(255,255,255,0.1)';
            const icon = target.querySelector('.material-symbols-rounded');
            if (icon) icon.style.color = 'var(--sys-accent)';

            // Switch panels
            document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
            const tabId = 'tab-' + target.dataset.tab;
            const panel = document.getElementById(tabId);
            if (panel) panel.style.display = 'block';
        });
    });

    // Check if there is a target tab selected from dropdown navigation
    if (window._targetSettingsTab) {
        const tabBtn = document.querySelector(`.settings-tab[data-tab="${window._targetSettingsTab}"]`);
        if (tabBtn) {
            tabBtn.click(); // Trigger the logic above automatically
        }
        window._targetSettingsTab = null; // Clear it
    }

    // Fill
    if (currentUser.nome) document.getElementById('set-nome').value = currentUser.nome;
    if (currentUser.tipoPlantacao) document.getElementById('set-plantacao').value = currentUser.tipoPlantacao;
    if (currentUser.cidade) document.getElementById('set-cidade').value = currentUser.cidade;
    if (currentUser.estado) document.getElementById('set-estado').value = currentUser.estado;
    if (currentUser.tamanhoFazenda) document.getElementById('set-tamanho').value = currentUser.tamanhoFazenda;
    if (currentUser.hasWhatsappPhone) document.getElementById('set-whatsapp').placeholder = 'Telefone configurado (digite para alterar)';
    if (currentUser.hasBlynkToken) document.getElementById('set-blynk').placeholder = 'Token configurado (digite para alterar)';
    if (currentUser.hasCallmebotApiKey) document.getElementById('set-apikey').placeholder = 'API Key salva (digite para alterar)';

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;

        if (isDemoMode) {
            btn.disabled = false;
            return showDemoUpsellModal();
        }

        try {
            btn.disabled = true;
            btn.textContent = 'Aguarde...';
            document.getElementById('set-success').style.display = 'none';

            const requestBody = {
                nome: document.getElementById('set-nome').value,
                tipoPlantacao: document.getElementById('set-plantacao').value,
                cidade: document.getElementById('set-cidade').value,
                estado: document.getElementById('set-estado').value,
                tamanhoFazenda: document.getElementById('set-tamanho').value
            };

            const blynkVal = document.getElementById('set-blynk').value;
            const apiKeyVal = document.getElementById('set-apikey').value;
            const whatsVal = document.getElementById('set-whatsapp').value;

            if (blynkVal) requestBody.blynkToken = blynkVal;
            if (apiKeyVal) requestBody.callmebotApiKey = apiKeyVal;
            if (whatsVal) requestBody.whatsappPhone = whatsVal;

            const res = await setupAuthFetch('/api/auth/config', {
                method: 'PUT',
                body: JSON.stringify(requestBody)
            });
            const updated = await res.json();
            if (!res.ok) throw new Error(updated.error || 'Erro ao salvar no BD');

            currentUser.nome = updated.nome;
            currentUser.tipoPlantacao = updated.tipoPlantacao;
            currentUser.cidade = updated.cidade;
            currentUser.estado = updated.estado;
            if (updated.endereco !== undefined) currentUser.endereco = updated.endereco;
            if (updated.tamanhoFazenda) currentUser.tamanhoFazenda = updated.tamanhoFazenda;

            currentUser.hasWhatsappPhone = updated.hasWhatsappPhone;
            currentUser.hasBlynkToken = updated.hasBlynkToken;
            currentUser.hasCallmebotApiKey = updated.hasCallmebotApiKey;

            // Limpa os campos visuais de chaves após o envio
            document.getElementById('set-blynk').value = '';
            document.getElementById('set-apikey').value = '';
            document.getElementById('set-whatsapp').value = '';

            // Re-render placeholders
            if (updated.hasWhatsappPhone) document.getElementById('set-whatsapp').placeholder = 'Telefone configurado (digite para alterar)';
            if (updated.hasBlynkToken) document.getElementById('set-blynk').placeholder = 'Token configurado (digite para alterar)';
            if (updated.hasCallmebotApiKey) document.getElementById('set-apikey').placeholder = 'API Key salva (digite para alterar)';

            if (updated.lat && updated.lon) {
                currentUser.lat = updated.lat;
                currentUser.lon = updated.lon;

                // Redesenha mapa e clima recarregando o painel em background 
                if (typeof initDashboard === 'function') {
                    // Nós não forçamos navegação completa para manter a fluidez, mas as novas vars serão pegas
                }
            }

            btn.disabled = false;
            btn.textContent = originalText;
            document.getElementById('set-success').style.display = 'block';
            setTimeout(() => { document.getElementById('set-success').style.display = 'none'; }, 3000);
        } catch (e) {
            btn.disabled = false;
            btn.textContent = originalText;
            alert(e.message);
        }
    });

    document.getElementById('integrations-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const res = await setupAuthFetch('/api/auth/config', {
                method: 'PUT',
                body: JSON.stringify({
                    blynkToken: document.getElementById('set-blynk').value,
                    whatsappPhone: document.getElementById('set-phone').value,
                    callmebotApiKey: document.getElementById('set-apikey').value
                })
            });
            const updated = await res.json();
            currentUser.blynkToken = updated.blynkToken;
            currentUser.whatsappPhone = updated.whatsappPhone;
            document.getElementById('int-success').style.display = 'block';
            setTimeout(() => { document.getElementById('int-success').style.display = 'none'; }, 3000);
        } catch (e) { alert(e.message); }
    });
};

// ==========================================
// ANÁLISE INTELIGENTE
// ==========================================
let analysisWeeklyChart = null;
let analysisNasaChart = null;

const initAnalysis = async () => {
    // Helper to set check icon
    const setCheck = (id, ok, label) => {
        const el = document.getElementById(id);
        const lbl = document.getElementById(id + '-label');
        if (el) {
            el.textContent = ok ? 'check_circle' : 'cancel';
            el.style.color = ok ? 'var(--color-good)' : 'var(--color-dry)';
        }
        if (lbl) lbl.textContent = label || (ok ? 'Disponível' : 'Indisponível');
    };

    const hideSkeleton = (id) => {
        const skel = document.getElementById(id);
        if (skel) skel.classList.add('hidden');
    };

    // --- 1. CULTURA (Always available from currentUser) ---
    const cultura = currentUser?.tipoPlantacao || 'Cultura';
    const limits = getCropLimits(cultura);
    const srcCultTipo = document.getElementById('an-src-cult-tipo');
    const srcCultFaixa = document.getElementById('an-src-cult-faixa');
    const srcCultCenter = document.getElementById('an-src-cult-center');
    if (srcCultTipo) srcCultTipo.textContent = cultura;
    if (srcCultFaixa) srcCultFaixa.textContent = limits.min + '% – ' + limits.max + '%';
    if (srcCultCenter) srcCultCenter.textContent = limits.center + '%';

    // Timeline: Limite da cultura
    const tlLimit = document.getElementById('an-tl-limit');
    const tlLimitDesc = document.getElementById('an-tl-limit-desc');
    if (tlLimit) tlLimit.textContent = limits.min + '%';
    if (tlLimitDesc) tlLimitDesc.textContent = cultura.toLowerCase();

    // --- 2. FETCH SENSOR ---
    let sensorData = null;
    try {
        const sensorRes = await setupAuthFetch('/api/sensores/umidade');
        if (sensorRes.ok) {
            sensorData = await sensorRes.json();
            setCheck('an-check-sensor', true, 'Conectado');

            // Populate sensor data
            const kpiUmid = document.getElementById('an-kpi-umid');
            const kpiUmidStatus = document.getElementById('an-kpi-umid-status');
            const srcSensorVal = document.getElementById('an-src-sensor-val');
            const srcSensorStatus = document.getElementById('an-src-sensor-status');
            const tlNow = document.getElementById('an-tl-now');

            if (kpiUmid) kpiUmid.textContent = sensorData.umidade.toFixed(1) + '%';
            if (tlNow) tlNow.textContent = sensorData.umidade.toFixed(1) + '%';
            if (srcSensorVal) srcSensorVal.textContent = sensorData.umidade.toFixed(1) + '%';

            let statusText = sensorData.status === 'IDEAL' ? 'Faixa ideal' : sensorData.status === 'SECO' ? 'Abaixo do ideal' : 'Acima do ideal';
            if (kpiUmidStatus) kpiUmidStatus.textContent = statusText;
            if (srcSensorStatus) {
                srcSensorStatus.textContent = 'Conectado';
                srcSensorStatus.style.color = 'var(--color-good)';
            }

            // Update globals for intelligence functions
            window._latestUmid = sensorData.umidade;
            window._latestStatus = sensorData.status;
        } else {
            throw new Error('Sensor offline');
        }
    } catch (e) {
        setCheck('an-check-sensor', false, 'Offline');
        const srcSensorStatus = document.getElementById('an-src-sensor-status');
        if (srcSensorStatus) {
            srcSensorStatus.textContent = 'Offline';
            srcSensorStatus.style.color = 'var(--color-dry)';
        }
        // Show alert
        const alertBox = document.getElementById('an-alert-box');
        const alertText = document.getElementById('an-alert-text');
        if (alertBox && alertText) {
            alertBox.style.display = 'block';
            alertText.textContent = 'O sensor está sem comunicação. Algumas estimativas podem estar baseadas nos últimos dados disponíveis.';
        }
    }

    // --- 3. FETCH AGRO (Clima + Previsão + Satélite) ---
    let agroData = null;
    try {
        const agroRes = await setupAuthFetch('/api/agro/clima');
        if (agroRes.ok) {
            agroData = await agroRes.json();
            setCheck('an-check-clima', true, 'Disponível');

            const clima = agroData.clima;
            const previsao = agroData.previsao;
            const meta = previsao?._meta;

            // Store globals
            window._latestClima = clima;
            window._latestSat = agroData.satelite;

            // --- HERO CARD ---
            const heroStatus = document.getElementById('analysis-hero-status');
            const heroReco = document.getElementById('analysis-hero-reco');
            const heroTime = document.getElementById('analysis-hero-time');
            const heroIconWrap = document.getElementById('analysis-hero-icon-wrap');
            const heroIcon = document.getElementById('analysis-hero-icon');

            if (previsao) {
                let statusLabel = 'IDEAL';
                let statusColor = 'var(--color-good)';
                let icon = 'psychiatry';

                if (previsao.status === 'critico') {
                    statusLabel = 'CRÍTICO';
                    statusColor = 'var(--color-dry)';
                    icon = 'warning';
                } else if (previsao.status === 'alerta') {
                    statusLabel = 'ATENÇÃO';
                    statusColor = 'var(--color-mid)';
                    icon = 'schedule';
                }

                if (heroStatus) {
                    heroStatus.textContent = statusLabel;
                    heroStatus.style.color = statusColor;
                }
                if (heroReco) heroReco.textContent = previsao.recomendacao;
                if (heroIconWrap) heroIconWrap.style.background = statusColor;
                if (heroIcon) heroIcon.textContent = icon;

                let timeText = Math.round(previsao.tempoHoras) + ' horas';
                if (previsao.tempoHoras <= 0) timeText = 'AGORA';
                if (previsao.tempoHoras === 99) timeText = 'SUSPENSA (chuva)';
                if (heroTime) heroTime.textContent = timeText;

                // Timeline
                const tlIrrig = document.getElementById('an-tl-irrig');
                if (tlIrrig) tlIrrig.textContent = previsao.tempoHoras <= 0 ? 'AGORA' : '≈ ' + Math.round(previsao.tempoHoras) + 'h';
            }

            hideSkeleton('analysis-hero-skeleton');

            // --- KPI Cards ---
            if (meta) {
                const kpiDrop = document.getElementById('an-kpi-drop');
                const tlDrop = document.getElementById('an-tl-drop');
                if (kpiDrop) kpiDrop.textContent = '-' + meta.dropRealTime + '%/h';
                if (tlDrop) tlDrop.textContent = '-' + meta.dropRealTime + '%/h';

                const kpiRain = document.getElementById('an-kpi-rain');
                if (kpiRain) kpiRain.textContent = meta.rainProb + '%';
            }

            if (clima && clima.current) {
                const kpiTemp = document.getElementById('an-kpi-temp');
                const kpiAirHum = document.getElementById('an-kpi-airhum');
                const kpiTempDesc = document.getElementById('an-kpi-temp-desc');

                if (kpiTemp) kpiTemp.textContent = Math.round(clima.current.temperature_2m) + '°C';
                if (kpiAirHum) kpiAirHum.textContent = (clima.current.relative_humidity_2m || '--') + '%';

                let tempDesc = 'Normal';
                if (clima.current.temperature_2m > 35) tempDesc = 'Extremo';
                else if (clima.current.temperature_2m > 30) tempDesc = 'Elevada';
                else if (clima.current.temperature_2m < 15) tempDesc = 'Baixa';
                if (kpiTempDesc) kpiTempDesc.textContent = tempDesc;

                // Source cards
                const srcClimaTemp = document.getElementById('an-src-clima-temp');
                const srcClimaHum = document.getElementById('an-src-clima-hum');
                const srcClimaWind = document.getElementById('an-src-clima-wind');
                if (srcClimaTemp) srcClimaTemp.textContent = Math.round(clima.current.temperature_2m) + '°C';
                if (srcClimaHum) srcClimaHum.textContent = (clima.current.relative_humidity_2m || '--') + '%';
                if (srcClimaWind) srcClimaWind.textContent = (clima.current.wind_speed_10m || '--') + ' km/h';
            }

            // ET₀
            const et0Val = clima?.daily?.et0_fao_evapotranspiration?.[0];
            const kpiEt0 = document.getElementById('an-kpi-et0');
            const srcClimaEt0 = document.getElementById('an-src-clima-et0');
            if (et0Val !== undefined) {
                if (kpiEt0) kpiEt0.textContent = et0Val.toFixed(1) + ' mm';
                if (srcClimaEt0) srcClimaEt0.textContent = et0Val.toFixed(1) + ' mm';
            } else {
                if (kpiEt0) kpiEt0.textContent = 'N/D';
                if (srcClimaEt0) srcClimaEt0.textContent = 'N/D';
            }

            // --- SATÉLITE ---
            if (agroData.satelite) {
                setCheck('an-check-nasa', true, 'Disponível');
                const srcNasaVal = document.getElementById('an-src-nasa-val');
                const srcNasaDate = document.getElementById('an-src-nasa-date');
                if (srcNasaVal) srcNasaVal.textContent = agroData.satelite.umidadeMacro + '%';
                if (srcNasaDate) srcNasaDate.textContent = agroData.satelite.dataReferencia;

                // NASA Chart
                if (agroData.satelite.historico && agroData.satelite.historico.length > 0) {
                    const ctxNasa = document.getElementById('an-nasaChart');
                    if (ctxNasa) {
                        if (analysisNasaChart) analysisNasaChart.destroy();
                        analysisNasaChart = new Chart(ctxNasa.getContext('2d'), {
                            type: 'line',
                            data: {
                                labels: agroData.satelite.historico.map(h => h.data.slice(-5)),
                                datasets: [{
                                    label: 'Umidade Macro (%)',
                                    data: agroData.satelite.historico.map(h => h.valor),
                                    borderColor: '#f39c12',
                                    backgroundColor: 'rgba(243, 156, 18, 0.15)',
                                    fill: true,
                                    tension: 0.3,
                                    borderWidth: 2,
                                    pointRadius: 3,
                                    pointBackgroundColor: '#f39c12'
                                }]
                            },
                            options: {
                                responsive: true, maintainAspectRatio: false,
                                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#f39c12', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
                                scales: {
                                    x: { ticks: { color: 'rgba(255, 255, 255, 0.4)' }, grid: { display: false } },
                                    y: { max: 100, min: 0, beginAtZero: true, ticks: { color: 'rgba(255, 255, 255, 0.4)' }, grid: { color: 'rgba(255, 255, 255, 0.03)' } }
                                }
                            }
                        });
                    }
                }
            } else {
                setCheck('an-check-nasa', false, 'Indisponível');
                const nasaChartWrap = document.getElementById('an-nasa-chart-wrap');
                const nasaUnavail = document.getElementById('an-nasa-unavailable');
                if (nasaChartWrap) nasaChartWrap.style.display = 'none';
                if (nasaUnavail) nasaUnavail.style.display = 'block';
            }

            // --- UPDATE TIMESTAMP ---
            const statusDot = document.getElementById('analysis-status-dot');
            const updateText = document.getElementById('analysis-update-text');
            if (statusDot) statusDot.style.background = 'var(--color-good)';
            if (updateText) updateText.textContent = 'Dados atualizados — ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        } else {
            throw new Error('Agro API error');
        }
    } catch (e) {
        setCheck('an-check-clima', false, 'Indisponível');
        setCheck('an-check-nasa', false, 'Indisponível');
        hideSkeleton('analysis-hero-skeleton');
        const heroReco = document.getElementById('analysis-hero-reco');
        if (heroReco) heroReco.textContent = 'Não foi possível carregar os dados climáticos no momento.';
    }

    // --- 4. FETCH WEEKLY ---
    try {
        const weekRes = await setupAuthFetch('/api/agro/media-semanal');
        const weekData = await weekRes.json();
        window._latestSemana = weekData;

        const ctxWeek = document.getElementById('an-weeklyChart');
        if (ctxWeek) {
            if (analysisWeeklyChart) analysisWeeklyChart.destroy();
            analysisWeeklyChart = new Chart(ctxWeek.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: weekData.map(w => w.dia),
                    datasets: [{
                        label: 'Média Semanal (%)',
                        data: weekData.map(w => w.media),
                        backgroundColor: 'rgba(148, 180, 193, 0.4)',
                        borderRadius: 4,
                        hoverBackgroundColor: '#94B4C1'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#94B4C1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
                    scales: {
                        x: { ticks: { color: 'rgba(255, 255, 255, 0.4)' }, grid: { display: false } },
                        y: { max: 100, min: 0, beginAtZero: true, ticks: { color: 'rgba(255, 255, 255, 0.4)' }, grid: { color: 'rgba(255, 255, 255, 0.03)' } }
                    }
                }
            });

            // Average
            const diasComDados = weekData.filter(d => d.media > 0);
            if (diasComDados.length > 0) {
                const avg = diasComDados.reduce((s, d) => s + d.media, 0) / diasComDados.length;
                const avgEl = document.getElementById('an-week-avg-val');
                if (avgEl) avgEl.textContent = Math.round(avg) + '%';
            }
        }
    } catch (e) {
        console.error('Analysis: Weekly fetch failed', e);
    }

    // --- 5. INTELLIGENCE (Evapotranspiração, Saúde do Solo, Análise Avançada) ---
    if (window._latestClima) {
        // Evapotranspiração
        const evapo = calcularEvapotranspiracao(window._latestClima);
        const evapoNivel = document.getElementById('an-evapo-nivel');
        const evapoDesc = document.getElementById('an-evapo-desc');
        const evapoIcon = document.getElementById('an-evapo-icon');
        const evapoIconWrap = document.getElementById('an-evapo-icon-wrap');
        if (evapoNivel) { evapoNivel.textContent = evapo.nivel; evapoNivel.style.color = evapo.cor; }
        if (evapoDesc) evapoDesc.textContent = evapo.desc;
        if (evapoIcon) evapoIcon.textContent = evapo.icon;
        if (evapoIconWrap) { evapoIconWrap.style.color = evapo.cor; evapoIconWrap.style.background = evapo.cor + '20'; }

        // Saúde do Solo
        const saude = calcularSaudeSolo(
            window._latestUmid || 50,
            window._latestSemana || [],
            window._latestClima,
            cultura
        );
        const saudeScore = document.getElementById('an-saude-score');
        const saudeStatus = document.getElementById('an-saude-status');
        const saudeProgress = document.getElementById('an-saude-progress');
        if (saudeScore) saudeScore.textContent = saude.score;
        if (saudeStatus) { saudeStatus.textContent = saude.status; saudeStatus.style.color = saude.cor; }
        if (saudeProgress) { saudeProgress.style.strokeDasharray = saude.score + ', 100'; saudeProgress.style.stroke = saude.cor; }

        // Análise Avançada
        const analiseTexto = document.getElementById('an-analise-texto');
        if (analiseTexto) {
            const txt = analiseAvancada(window._latestUmid || 50, window._latestStatus || 'IDEAL', window._latestClima, cultura, window._latestSat);
            analiseTexto.textContent = txt;
        }
    }

    // --- 6. FETCH IA GENERATIVA ---
    try {
        const iaRes = await setupAuthFetch('/api/agro/insights-ia');
        if (iaRes.ok) {
            const iaData = await iaRes.json();
            setCheck('an-check-ia', true, iaData.cached ? 'Em cache' : 'Atualizado');
            const iaLaudo = document.getElementById('an-ia-laudo');
            const iaCache = document.getElementById('an-ia-cache');
            if (iaLaudo) iaLaudo.textContent = iaData.diagnostico;
            if (iaCache && iaData.cached) iaCache.style.display = 'inline';
            hideSkeleton('an-ia-skeleton');
        } else {
            throw new Error('IA fallback');
        }
    } catch (e) {
        setCheck('an-check-ia', false, 'Indisponível');
        hideSkeleton('an-ia-skeleton');
        const iaLaudo = document.getElementById('an-ia-laudo');
        if (iaLaudo) iaLaudo.innerHTML = '<span style="opacity:0.5;">Não foi possível gerar a interpretação agronômica no momento. A análise baseada em dados continua funcionando normalmente.</span>';
    }
};

// ==========================================
// BOOT
// ==========================================
const bootApplication = async () => {
    appContainer.style.display = 'flex';
    const isLogged = await initAuth();
    if (isLogged) {
        navigate('dashboard');
    } else {
        navigate('login');
    }
};

// Global click event to close dropdowns
document.addEventListener('click', (e) => {
    const profileMenu = document.getElementById('profile-dropdown');
    const profileBtn = document.getElementById('profile-menu-btn');
    if (profileMenu && profileMenu.style.display === 'flex') {
        if (!profileMenu.contains(e.target) && (!profileBtn || !profileBtn.contains(e.target))) {
            profileMenu.style.opacity = '0';
            profileMenu.style.transform = 'scale(0.95)';
            setTimeout(() => profileMenu.style.display = 'none', 200);
        }
    }
});

// ==========================================
// RELATÓRIO MENSAL
// ==========================================
let mrSoilChartInstance = null;
let mrClimateChartInstance = null;

const initMonthlyReport = async () => {
    const selectMonth = document.getElementById('report-month-select');
    if (!selectMonth) return;

    // Popular select com últimos 3 meses
    selectMonth.innerHTML = '';
    const now = new Date();
    for (let i = 0; i < 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

        const option = document.createElement('option');
        option.value = `${year}-${month}`;
        option.textContent = label;
        selectMonth.appendChild(option);
    }

    const loadReport = async (year, month) => {
        try {
            document.getElementById('mr-resumo').textContent = 'Carregando relatório...';

            const res = await setupAuthFetch(`/api/reports/monthly?year=${year}&month=${month}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao carregar relatório');

            // Preencher KPIs
            document.getElementById('mr-faixa-ideal').textContent = data.kpis.totalLeituras > 0 ? `${data.kpis.pctIdeal}%` : '--%';
            document.getElementById('mr-deficit').textContent = data.kpis.totalLeituras > 0 ? `${data.kpis.pctDeficit}%` : '--%';
            document.getElementById('mr-chuva').textContent = data.kpis.chuvaAcumulada !== null ? `${data.kpis.chuvaAcumulada} mm` : '-- mm';
            document.getElementById('mr-et0').textContent = data.kpis.et0Acumulada !== null ? `${data.kpis.et0Acumulada} mm` : '-- mm';
            document.getElementById('mr-recomendacoes-count').textContent = data.kpis.recomendacoesCount !== undefined ? data.kpis.recomendacoesCount : '--';
            document.getElementById('mr-volume-teorico').textContent = data.kpis.volumeTeorico !== null ? `${data.kpis.volumeTeorico} m³` : '-- m³';
            document.getElementById('mr-total-leituras').textContent = data.kpis.totalLeituras;

            // Qualidade dos dados
            const daysInMonth = new Date(year, month, 0).getDate();
            const pctQualidade = data.kpis.totalLeituras > 0 ? Math.min(100, Math.round((data.kpis.totalLeituras / daysInMonth) * 100)) : 0;
            const qPctEl = document.getElementById('mr-qualidade-pct');
            qPctEl.textContent = `${pctQualidade}%`;
            if (pctQualidade >= 90) qPctEl.style.color = '#4ade80';
            else if (pctQualidade >= 70) qPctEl.style.color = 'var(--warning)';
            else qPctEl.style.color = 'var(--danger)';

            // IA Resumo
            document.getElementById('mr-leitura-ia').textContent = data.ia.resumo;

            // Criar Resumo Sintético do Mês (Diferente da IA que foca em insights)
            const resumoEl = document.getElementById('mr-resumo');
            if (data.kpis.totalLeituras === 0) {
                resumoEl.textContent = 'Não há dados de sensores suficientes para gerar um relatório abrangente neste período.';
            } else {
                resumoEl.textContent = `Neste período, o solo permaneceu dentro da faixa adequada em ${data.kpis.pctIdeal}% das leituras observadas. Foram identificados ${data.kpis.recomendacoesCount} eventos onde a umidade reduziu e alertas foram possivelmente gerados. A ocorrência de precipitação acumulou ${data.kpis.chuvaAcumulada !== null ? data.kpis.chuvaAcumulada : 0} mm, influenciando o balanço contra uma evapotranspiração teórica de ${data.kpis.et0Acumulada !== null ? data.kpis.et0Acumulada : 0} mm.`;
            }

            // Renderizar Gráfico de Solo
            const ctxSoil = document.getElementById('mr-soil-chart');
            if (mrSoilChartInstance) mrSoilChartInstance.destroy();

            if (data.graficos.solo && data.graficos.solo.length > 0) {
                const labels = data.graficos.solo.map(d => new Date(d.data).toLocaleDateString('pt-BR'));
                const values = data.graficos.solo.map(d => d.umidade);

                mrSoilChartInstance = new Chart(ctxSoil, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Umidade do Solo (%)',
                                data: values,
                                borderColor: 'rgba(0, 163, 255, 1)',
                                backgroundColor: 'rgba(0, 163, 255, 0.1)',
                                borderWidth: 2,
                                fill: true,
                                pointRadius: 0
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            annotation: {
                                annotations: {
                                    box1: {
                                        type: 'box',
                                        yMin: data.kpis.limites.minIdeal,
                                        yMax: data.kpis.limites.maxIdeal,
                                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                                        borderWidth: 0
                                    }
                                }
                            }
                        },
                        scales: {
                            y: { min: 0, max: 100, beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.5)' } },
                            x: { ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 10 } }
                        }
                    }
                });
            }

            // Renderizar Gráfico de Clima
            const ctxClimate = document.getElementById('mr-climate-chart');
            if (mrClimateChartInstance) mrClimateChartInstance.destroy();

            if (data.graficos.clima && data.graficos.clima.length > 0) {
                const labels = data.graficos.clima.map(d => new Date(d.data).toLocaleDateString('pt-BR'));
                const chuva = data.graficos.clima.map(d => d.chuva);
                const et0 = data.graficos.clima.map(d => d.et0);

                mrClimateChartInstance = new Chart(ctxClimate, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Chuva (mm)',
                                data: chuva,
                                backgroundColor: 'rgba(0, 163, 255, 0.6)',
                                borderRadius: 4
                            },
                            {
                                label: 'ET₀ (mm)',
                                data: et0,
                                backgroundColor: 'rgba(255, 153, 0, 0.6)',
                                borderRadius: 4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { labels: { color: '#fff' } } },
                        scales: {
                            y: { ticks: { color: 'rgba(255,255,255,0.5)' } },
                            x: { ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 10 } }
                        }
                    }
                });
            }

        } catch (e) {
            document.getElementById('mr-resumo').textContent = 'Erro ao carregar dados: ' + e.message;
        }
    };

    selectMonth.addEventListener('change', (e) => {
        const [year, month] = e.target.value.split('-');
        loadReport(year, month);
    });

    // Load initial
    const [year, month] = selectMonth.value.split('-');
    loadReport(year, month);
};

document.addEventListener('DOMContentLoaded', bootApplication);
