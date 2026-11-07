// ==========================================
// CORE: ESTADO, AUTENTICAÇÃO E ROTEAMENTO
// ==========================================
try { localStorage.removeItem('jwt'); } catch {}
let sessionRevision = 0;
let currentUser = null;
let currentToken = null; // mantido temporariamente por legibilidade de código legado

// Motion only explains an applied state; canceling it never changes product data.
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const motionJobs = new Map();
const motionDuration = (token, fallback) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token);
    return Number.parseFloat(value) || fallback;
};
const cancelMotion = element => {
    const animation = motionJobs.get(element);
    if (animation) {
        motionJobs.delete(element);
        animation.cancel();
    }
};
const stopAllMotion = () => {
    for (const element of motionJobs.keys()) cancelMotion(element);
};
const playMotion = (element, frames, {duration = 180, reducedFrames = [{opacity: 0.85}, {opacity: 1}]} = {}) => {
    cancelMotion(element);
    if (!element?.animate || document.hidden) return null;
    const reduced = motionPreference?.matches;
    const keyframes = reduced ? reducedFrames : frames;
    if (!keyframes) return null;
    try {
        const animation = element.animate(keyframes, {
            duration: reduced ? motionDuration('--motion-feedback', 100) : duration,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
        });
        motionJobs.set(element, animation);
        const release = () => {
            if (motionJobs.get(element) === animation) motionJobs.delete(element);
        };
        animation.finished.then(release, release);
        return animation;
    } catch {
        return null; // Unsupported motion must never interrupt data or navigation.
    }
};
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAllMotion();
});
motionPreference?.addEventListener?.('change', stopAllMotion);

const openDialog = dialog => {
    if (!dialog.open) dialog.showModal();
    playMotion(dialog, [
        {opacity: 0.7, transform: 'translateY(8px) scale(0.985)'},
        {opacity: 1, transform: 'none'}
    ], {duration: motionDuration('--motion-layer', 240)});
};
const closeDialog = dialog => {
    if (!dialog) return;
    cancelMotion(dialog);
    if (dialog.open) dialog.close();
};
document.addEventListener('close', event => {
    if (!(event.target instanceof HTMLDialogElement)) return;
    cancelMotion(event.target);
    if (event.target.id === 'search-dialog' && window.innerWidth <= 768 &&
        (document.activeElement === document.body || document.getElementById('sidebar').contains(document.activeElement))) {
        document.getElementById('mobile-menu-btn').focus();
    }
}, true);

const updateSoilMeter = (meter, value) => {
    if (!meter) return;
    const previous = Number(meter.dataset.value || 0);
    const next = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
    meter.dataset.value = String(next);
    meter.style.width = '100%';
    meter.style.transform = `scaleX(${next / 100})`;
    if (next !== previous) playMotion(meter, [
        {transform: `scaleX(${previous / 100})`},
        {transform: `scaleX(${next / 100})`}
    ], {duration: motionDuration('--motion-reading', 320), reducedFrames: null});
};

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

// Synthetic responses use the same public contracts as the authenticated API.
const demoSnapshot = () => ({
    status: 'seguro', tempoHoras: null,
    recomendacao: 'Neste exemplo, a umidade está dentro da faixa de referência para milho. Continue acompanhando as leituras. Dados simulados; não use para decisões no campo.',
    sensorState: {status:'online',hasValidData:true,dataAgeMinutes:0,lastReadingAt:new Date().toISOString()},
    engineData: {
        recommendation: {action:'MONITORAR'},
        confidence: {score:88,level:'Alta (exemplo)',eligible:true,factors:['Demonstração com dados simulados.']},
        climateAnalysis: {eto:4.2},
        predictor: {dynamicDropRate:null,cropSupported:true}
    }
});

const originalFetch = window.fetch;
window.fetch = async function (resource, config) {
    if (isDemoMode) {
        const urlStr = typeof resource === 'string' ? resource : resource.url;

        // Allowed bypasses: views, chartjs, local assets
        if (urlStr.startsWith('/views/') || urlStr.startsWith('http') && !urlStr.includes('/api/') || urlStr.includes('ibge.gov.br')) {
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
            return Promise.resolve(new Response(JSON.stringify({...demoData.sensor,status:'IDEAL',timestamp:new Date().toISOString(),diagnostico:demoSnapshot().recomendacao,previsao:demoSnapshot()}), { status: 200 }));
        }
        if (urlStr.includes('/api/agro/clima')) {
            return Promise.resolve(new Response(JSON.stringify({cidade:'Recife, PE',clima:{current:{temperature_2m:24.5,relative_humidity_2m:62,wind_speed_10m:12.3,weather_code:2,is_day:1},daily:{et0_fao_evapotranspiration:[4.2]}},previsao:demoSnapshot(),sensorState:demoSnapshot().sensorState,satelite:{available:true,umidadeMacro:58,dataReferencia:new Date().toISOString().slice(0,10),historico:Array.from({length:7},(_,i)=>({data:new Date(Date.now()-(6-i)*86400000).toISOString().slice(0,10),valor:[52,54,51,55,57,59,58][i]}))}}), { status: 200 }));
        }
        if (urlStr.includes('/api/agro/insights-ia')) {
            return Promise.resolve(new Response(JSON.stringify({diagnostico:demoSnapshot().recomendacao,previsao:demoSnapshot(),cached:false}), { status: 200 }));
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
            return Promise.resolve(new Response(JSON.stringify({data:demoData.historico.map(item=>({dataFull:item.horario,umidade:item.umidade,status:'IDEAL'})),meta:{page:1,pages:1,total:24}}), { status: 200 }));
        }
        if (urlStr.includes('/api/reports/monthly')) {
            return new Response(JSON.stringify({error:'Relatórios reais ficam disponíveis após conectar o sensor. A demonstração inclui apenas leituras de exemplo.'}), {status:403});
        }
        if (urlStr.includes('/api/auth/logout')) return new Response('{}', {status:200});
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
    try {
        const res = await fetch('/api/auth/me', {
            credentials: 'include'
        });

        if (!res.ok) throw new Error('Token Expirou/Inexistente');

        currentUser = await res.json();
        currentToken = "cookie"; // mock for legacy logic
        return true;
    } catch (e) {
        logout(false);
        return false;
    }
};

const logout = async (redirect = true) => {
    sessionRevision++;
    try { localStorage.removeItem('jwt'); } catch {}
    clearAgroState();
    currentToken = null;
    currentUser = null;
    try {
        await fetch('/api/auth/logout', {method:'POST',credentials:'include',signal:AbortSignal.timeout(5000)});
    } catch {}
    if (liveInterval) clearTimeout(liveInterval);
    if (weatherInterval) clearTimeout(weatherInterval);
    if (demoIntervalId) clearInterval(demoIntervalId);
    isDemoMode = false;
    if (redirect) navigate('login');
};

// Navegação Básica (SPA)
const navigate = async (route) => {
    sessionRevision++;
    stopAllMotion();
    // 1. Limpar timers (Impedir vazamento assíncrono)
    if (liveInterval) { clearTimeout(liveInterval); liveInterval = null; }
    if (weatherInterval) { clearTimeout(weatherInterval); weatherInterval = null; }
    if (demoIntervalId) { clearInterval(demoIntervalId); demoIntervalId = null; }
    closeMobileNavigation(false);
    document.querySelectorAll('dialog[open]').forEach(closeDialog);


    // 2. Proteção de Rota
    const unauthRoutes = ['login', 'register', 'forgot-password', 'reset-password'];
    if (!currentToken && !unauthRoutes.includes(route)) {
        return navigate('login');
    }
    if (currentToken && unauthRoutes.includes(route)) {
        return navigate('dashboard');
    }

    // 3. UI da Sidebar
    const isAuthRoute = unauthRoutes.includes(route);
    document.body.dataset.auth = String(isAuthRoute);
    document.getElementById('workspace-header').hidden = isAuthRoute;
    document.getElementById('workspace-header').style.display = isAuthRoute ? 'none' : '';
    if (!isAuthRoute) {
        document.getElementById('workspace-name').textContent = currentUser?.empresa || 'Minha propriedade';
        document.getElementById('sidebar-user').textContent = currentUser?.nome || 'Minha conta';
        document.getElementById('workspace-page').textContent = routeLabels[route] || route;
    }
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
            link.removeAttribute('aria-current');
            if (link.getAttribute('data-route') === route) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
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
        if (!res.ok) throw new Error('Página indisponível');
        const html = await res.text();

        const wrapper = document.createElement('div');
        wrapper.className = 'animate-enter-stagger';
        wrapper.innerHTML = html;
        appContent.innerHTML = '';
        appContent.appendChild(wrapper);

        // 5. Iniciar Lógica Específica da Rota
        initRouteScript(route);
        if (!isAuthRoute) appContent.focus({preventScroll: true});

    } catch (e) {
        appContent.innerHTML = `<section class="card route-error" role="alert"><h2>Não foi possível carregar a página</h2><p>Verifique sua conexão e tente novamente.</p><button class="button button-secondary" data-route="${route}">Tentar novamente</button></section>`;
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

// Shared navigation, command search and native dialog keyboard behavior.
const routeLabels = {dashboard:'Visão geral',geo:'Geoespacial',history:'Histórico',analysis:'Análise agronômica','monthly-report':'Relatório mensal',settings:'Configurações'};
const searchDialog = document.getElementById('search-dialog');
const searchInput = document.getElementById('global-search');
const normalizeSearch = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const renderSearch = () => {
    const query = normalizeSearch(searchInput.value.trim());
    const results = document.getElementById('search-results');
    results.replaceChildren();
    document.querySelectorAll('.sidebar-nav a[data-route]').forEach(link => {
        if (!normalizeSearch(link.textContent).includes(query)) return;
        const result = link.cloneNode(true);
        result.classList.remove('active');
        result.removeAttribute('aria-current');
        results.appendChild(result);
    });
    document.getElementById('search-empty').hidden = results.childElementCount > 0;
};
const openSearch = () => {
    closeMobileNavigation(false);
    searchInput.value = '';
    renderSearch();
    openDialog(searchDialog);
    searchInput.focus();
};
searchInput.addEventListener('input', renderSearch);
searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        document.querySelector('#search-results a')?.click();
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        document.querySelector('#search-results a')?.focus();
    }
});
document.getElementById('open-search').addEventListener('click', openSearch);
const closeMobileNavigation = (restoreFocus = true) => {
    const wasOpen = sidebar.classList.contains('open');
    sidebar.classList.remove('open');
    sidebar.inert = window.innerWidth <= 768;
    document.getElementById('mobile-menu-btn').setAttribute('aria-expanded', 'false');
    document.getElementById('sidebar-backdrop').hidden = true;
    appContent.inert = false;
    document.body.classList.remove('navigation-open');
    cancelMotion(sidebar);
    if (wasOpen && window.innerWidth <= 768) playMotion(sidebar, [
        {transform: 'translateX(0)', visibility: 'visible'},
        {transform: 'translateX(-100%)', visibility: 'visible'}
    ], {duration: motionDuration('--motion-exit', 140), reducedFrames: null});
    if (restoreFocus) document.getElementById('mobile-menu-btn').focus();
};
document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    if (sidebar.classList.contains('open')) return closeMobileNavigation();
    sidebar.inert = false;
    sidebar.classList.add('open');
    document.getElementById('mobile-menu-btn').setAttribute('aria-expanded', 'true');
    document.getElementById('sidebar-backdrop').hidden = false;
    appContent.inert = true;
    document.body.classList.add('navigation-open');
    playMotion(sidebar, [
        {transform: 'translateX(-100%)'},
        {transform: 'translateX(0)'}
    ], {duration: motionDuration('--motion-layer', 240)});
    sidebar.querySelector('.workspace-search').focus();
});
document.getElementById('sidebar-backdrop').addEventListener('click', () => closeMobileNavigation());
window.matchMedia?.('(min-width: 769px)').addEventListener('change', event => {
    if (event.matches) closeMobileNavigation(false);
});
document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && currentToken) {
        event.preventDefault();
        if (searchDialog.open) closeDialog(searchDialog); else openSearch();
    }
    if (sidebar.classList.contains('open') && !document.querySelector('dialog[open]')) {
        if (event.key === 'Escape') closeMobileNavigation();
        if (event.key === 'Tab') {
            const focusable = [...sidebar.querySelectorAll('a,button')].filter(el => el.getClientRects().length);
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    }
});
document.body.addEventListener('click', event => {
    const close = event.target.closest('[data-close-dialog]');
    if (close) closeDialog(document.getElementById(close.dataset.closeDialog));
    if (event.target instanceof HTMLDialogElement) {
        const rect = event.target.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(event.target);
    }
});

// Keep data available when the external chart library cannot load.
const createChart = (context, config) => {
    if (typeof Chart !== 'undefined') {
        config.options = {...config.options, animation: false};
        return new Chart(context, config);
    }
    if (context?.canvas) {
        const notice = document.createElement('p');
        notice.className = 'chart-unavailable';
        notice.textContent = 'Visualização indisponível. Consulte os valores em texto abaixo.';
        context.canvas.hidden = true;
        if (!context.canvas.parentElement.querySelector('.chart-unavailable')) context.canvas.parentElement.appendChild(notice);
    }
    return {data: config.data, update() {}, destroy() {}};
};

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
window._latestUmid = null;
window._latestStatus = 'INDEFINIDO';
window._latestClima = null;
window._latestSemana = [];
window._latestSat = null;
window._sensorState = null;

window._agroSnapshot = null;
// The overview distinguishes sensor availability from forecast availability.
let dashboardContext = null;
const activeDashboard = () => dashboardContext?.root?.isConnected && dashboardContext.revision === sessionRevision && dashboardContext.owner === currentUser?.id ? dashboardContext : null;
const dashboardText = (id, text) => {
    const element = document.getElementById(id);
    if (element && element.textContent !== text) element.textContent = text;
};
const dashboardError = error => {
    if (error?.status === 401) return {title:'Entre novamente', message:'Sua sessão expirou. Entre novamente para consultar os dados.', kind:'session'};
    if (error?.status === 403) return {title:'Configure o sensor', message:'A integração do sensor precisa ser configurada. Confira o token em Configurações.', kind:'configuration'};
    if (error?.status === 429) return {title:'Aguarde para atualizar', message:'Muitas consultas em sequência. Aguarde um pouco e tente novamente.', kind:'rate-limit'};
    if (error?.status === 503) return {title:'Sensor sem comunicação', message:'Não foi possível receber uma leitura. Confira a alimentação e a conexão do equipamento e tente novamente.', kind:'sensor'};
    if (error?.invalidReading) return {title:'Confira a leitura do sensor', message:'O sensor retornou uma leitura inválida. Confira o equipamento e tente novamente.', kind:'invalid'};
    return {title:'Leitura não carregada', message:'Não foi possível consultar o sensor. Verifique sua conexão e tente novamente.', kind:'connection'};
};
const dashboardForecast = (snapshot, context = activeDashboard()) => {
    if (context?.sensorError) return {title:context.sensorError.title,time:'Estimativa suspensa',reason:'A estimativa depende de uma leitura válida e da análise dos dados.',message:context.sensorError.message,state:'blocked',icon:'sensors_off'};
    if (context?.analysisStatus === 'error') return {title:'Análise não atualizada',time:'Tente atualizar os dados',reason:'A leitura do sensor foi mantida; a estimativa aguarda a análise.',message:'Não foi possível atualizar a análise. Verifique a conexão e tente novamente.',state:'blocked',icon:'sync_problem'};
    if (!snapshot) return {title:'Aguardando os dados',time:'Carregando análise...',reason:'A estimativa será apresentada após consultar as leituras e a análise.',state:'loading',icon:'sensors'};
    const engine = snapshot.engineData || {}, predictor = engine.predictor, quality = engine.dataQuality;
    const action = engine.recommendation?.action;
    const stale = snapshot.sensorState?.status === 'stale' || quality?.staleData;
    const blocked = snapshot.status === 'indisponivel' || action === 'VERIFICAR_SENSOR' || engine.confidence?.eligible === false || snapshot.sensorState?.hasValidData === false || snapshot.sensorState?.status === 'offline' || stale;
    if (blocked) {
        let reason = 'A qualidade dos dados não permite uma estimativa. Confira os avisos da análise abaixo.';
        if (stale) reason = 'A análise usa leituras desatualizadas. Atualize os dados antes de avaliar o manejo.';
        else if (predictor?.cropSupported === false) reason = 'Defina a faixa de referência da cultura em Configurações para permitir a análise.';
        else if (quality && (quality.sampleCount < (engine.inputs?.rules?.minSamples ?? 5) || quality.spanHours < (engine.inputs?.rules?.minSpanHours ?? 1))) reason = 'Ainda não há histórico suficiente para estimar o tempo até o limite da cultura.';
        return {title:'Confira os dados antes do manejo',time:'Estimativa suspensa',reason,state:'blocked',icon:'fact_check'};
    }
    const titles = {MONITORAR:'Continue acompanhando',IRRIGAR:'Confirme a leitura no campo','ATENÇÃO':'Acompanhe a aproximação do limite',EXCESSO_UMIDADE:'Confira o solo e a drenagem'};
    const title = titles[action] || 'Consulte a análise';
    const state = ['IRRIGAR','ATENÇÃO','EXCESSO_UMIDADE'].includes(action) ? 'attention' : 'ready';
    if (Number.isFinite(snapshot.tempoHoras) && snapshot.tempoHoras >= 0) return {title,time:snapshot.tempoHoras === 0 ? 'Limite inferior atingido' : `≈ ${snapshot.tempoHoras.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} h`,reason:'Estimativa condicionada à continuidade da secagem observada; chuva e irrigação podem alterá-la.',state,icon:state === 'attention' ? 'water_drop' : 'eco'};
    let reason = 'A análise não retornou uma estimativa de tempo até o limite da cultura.';
    if (predictor?.dynamicDropRate === null) reason = 'Não há tendência de secagem confiável para estimar o tempo até o limite.';
    else if (Number.isFinite(predictor?.dynamicDropRate)) reason = 'O tempo até o limite não pôde ser estimado dentro do horizonte do histórico observado.';
    return {title,time:'Ainda sem estimativa de tempo',reason,state,icon:'eco'};
};
const renderDashboardPrediction = (snapshot = window._agroSnapshot) => {
    if (!document.getElementById('predict-action')) return;
    const context = activeDashboard(), forecast = dashboardForecast(snapshot,context);
    dashboardText('predict-action',forecast.title);
    dashboardText('predict-time',forecast.time);
    dashboardText('predict-reason',forecast.reason);
    const card = document.getElementById('predict-card');
    card.dataset.state = forecast.state;
    card.style.removeProperty('border-left');
    const icon = document.getElementById('predict-icon');
    icon.textContent = forecast.icon;
    if (context?.sensorError || context?.analysisStatus === 'error') dashboardText('predict-text',forecast.message);
    const settings = document.getElementById('dashboard-settings-link');
    if (settings) {
        const cropMissing = snapshot?.engineData?.predictor?.cropSupported === false;
        settings.hidden = !(context?.sensorError?.kind === 'configuration' || cropMissing);
        settings.firstChild.textContent = cropMissing ? 'Definir faixa da cultura' : 'Configurar sensor';
    }
};
const renderDashboardSensorContext = () => {
    const context = activeDashboard();
    if (!context) return;
    const limits = getCropLimits();
    const hasLimits = Number.isFinite(limits.min) && Number.isFinite(limits.max) && limits.min >= 0 && limits.max <= 100 && limits.min < limits.max;
    dashboardText('soil-crop-range',hasLimits ? `${limits.min.toLocaleString('pt-BR')}% a ${limits.max.toLocaleString('pt-BR')}% do sensor calibrado` : 'Faixa não configurada — confira em Configurações');
    const stamp = context.lastReadingAt ? new Date(context.lastReadingAt).getTime() : NaN;
    const time = document.getElementById('soil-reading-time');
    let zone = currentUser?.timeZone || 'UTC';
    let zoneConfigured = !!currentUser?.timeZone;
    try { new Intl.DateTimeFormat('pt-BR',{timeZone:zone}).format(); } catch { zone='UTC';zoneConfigured=false; }
    if (Number.isFinite(stamp)) {
        time.dateTime = new Date(stamp).toISOString();
        time.textContent = `${new Intl.DateTimeFormat('pt-BR',{timeZone:zone,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(stamp)} · ${zone}${zoneConfigured ? '' : ' (configure o fuso)'}`;
    } else {
        time.removeAttribute('datetime');
        time.textContent = context.sensorStatus === 'loading' ? 'Aguardando leitura...' : context.sensorError ? 'Nenhuma leitura recebida nesta sessão' : 'Horário da leitura não informado';
    }
    let freshness = 'Consultando o sensor...', state = 'loading';
    if (context.sensorError) { freshness=context.sensorError.title;state='error'; }
    else if (context.sensorStatus === 'ready') {
        const age = Number.isFinite(stamp) ? (Date.now()-stamp)/60000 : null;
        const limit = context.sensorSnapshot?.engineData?.inputs?.rules?.freshnessMinutes ?? 30;
        if (age === null) { freshness='Atualidade não confirmada: o horário da leitura não foi informado.';state='unknown'; }
        else if (age < 0) { freshness='Horário futuro informado. Confira o relógio do equipamento.';state='unknown'; }
        else if (age > limit || context.sensorSnapshot?.sensorState?.status === 'stale') { freshness=`Leitura desatualizada · há ${Math.floor(age)} min. Atualize os dados.`;state='stale'; }
        else { freshness=age < 1 ? 'Leitura recebida há menos de 1 min' : `Leitura recebida há ${Math.floor(age)} min`;state='fresh'; }
    }
    dashboardText('soil-freshness',freshness);
    document.getElementById('soil-freshness').dataset.state = state;
    const status = document.getElementById('sys-status');
    const label = context.sensorError ? (context.sensorError.kind === 'session' ? 'Sessão expirada' : 'Sem leitura atual') : state === 'stale' ? 'Leitura desatualizada' : context.sensorStatus === 'ready' ? 'Sensor conectado' : 'Consultando sensor';
    status.style.background = context.sensorError ? 'var(--danger)' : state === 'stale' || state === 'unknown' ? 'var(--warning)' : context.sensorStatus === 'ready' ? 'var(--success)' : 'var(--control-border)';
    status.nextElementSibling.textContent = label;
};
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderDashboardSensorContext();
});

const clearAgroState = () => {
    dashboardContext = null;
    dashboardText('soil-reading-time','Aguardando leitura...');
    document.getElementById('soil-reading-time')?.removeAttribute('datetime');
    dashboardText('soil-freshness','Sem leitura atual.');
    dashboardText('predict-action','Aguardando os dados');
    dashboardText('predict-reason','Consulte os dados antes de avaliar o manejo.');
    window._latestUmid = null; window._latestStatus = 'INDEFINIDO'; window._latestClima = null;
    window._latestSemana = []; window._latestSat = null; window._sensorState = null; window._agroSnapshot = null;
    for (const id of ['predict-time','analysis-hero-time','analysis-hero-status','umidade-valor','saude-valor','an-saude-score']) {
        const element = document.getElementById(id); if (element) element.textContent = 'Indisponível';
    }
    for (const id of ['predict-text','analysis-hero-reco','analise-texto','soil-insight']) {
        const element = document.getElementById(id); if (element) element.textContent = 'Dados indisponíveis. Recomendação suspensa.';
    }
};
const predictionTime = hours => Number.isFinite(hours) ? hours === 0 ? 'AGORA' : `≈ ${hours.toFixed(1)}h` : 'Indisponível';
const applyAgroSnapshot = snapshot => {
    if (!snapshot) return;
    if (activeDashboard()?.sensorError) { renderDashboardPrediction(null); return; }
    window._agroSnapshot = snapshot; window._sensorState = snapshot.sensorState || snapshot._meta?.sensorState || null;
    const status = snapshot.engineData?.recommendation?.action || 'VERIFICAR_SENSOR';
    for (const id of ['predict-text','analysis-hero-reco','analise-texto']) {
        const element = document.getElementById(id); if (element) element.textContent = snapshot.recomendacao;
    }
    for (const id of ['predict-time','analysis-hero-time','an-tl-irrig']) {
        const element = document.getElementById(id); if (element) element.textContent = predictionTime(snapshot.tempoHoras);
    }
    renderDashboardPrediction(snapshot);
    const hero = document.getElementById('analysis-hero-status'); if (hero) hero.textContent = status;
    const factors = document.getElementById('an-confidence-factors');
    if (factors) factors.textContent = snapshot.engineData?.confidence?.factors?.join(' ') || 'Dados recentes e sem anomalias detectadas. O score não é uma probabilidade estatística.';
};
const renderMapAvailability = () => {
    const text = document.getElementById('ndvi-analysis-text');
    if (text) text.textContent = 'Mapa de localização. Não há dados de NDVI, limites medidos do talhão ou diagnóstico espacial disponíveis.';
    for (const id of ['btn-layer-ndvi','btn-layer-rain','legend-ndvi','legend-rain']) {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
    }
};

const renderInteligence = () => {
    if (!document.getElementById('analise-texto')) return;

    // Se o sensor estiver offline ou os dados forem velhos, desativamos algumas coisas
    const hasValidData = window._sensorState ? window._sensorState.hasValidData : true; // fallback to true se ainda nao tiver carregado

    // 1. Evapotranspiração
    const evapo = calcularEvapotranspiracao(window._latestClima);
    document.getElementById('evapo-nivel').textContent = evapo.nivel;
    document.getElementById('evapo-desc').textContent = evapo.desc;
    document.getElementById('evapo-icon').textContent = evapo.icon;
    document.getElementById('evapo-nivel').style.color = evapo.cor;
    document.getElementById('evapo-icon-wrap').style.color = evapo.cor;


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

const calcularEvapotranspiracao = () => {
    const eto = window._agroSnapshot?.engineData?.climateAnalysis?.eto;
    return {nivel:Number.isFinite(eto)?eto.toLocaleString('pt-BR', {minimumFractionDigits:1,maximumFractionDigits:1})+' mm/dia':'Indisponível',desc:'Evapotranspiração de referência meteorológica; não mede a perda de água do sensor.',cor:'var(--sys-light)',icon:'air'};
};
const getCropLimits = () => {
    const config = currentUser?.cropConfig;
    return {min:config?.minIdeal ?? null,max:config?.maxIdeal ?? null,center:config?.center ?? null};
};
const calcularSaudeSolo = () => {
    const confidence = window._agroSnapshot?.engineData?.confidence;
    return {score:confidence?.score ?? '--',status:confidence?.level || 'Indisponível',cor:confidence?.eligible?'var(--color-good)':'var(--sys-light)'};
};
const analiseAvancada = () => window._agroSnapshot?.recomendacao || 'Dados indisponíveis. Recomendação suspensa.';

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

const setupAuthFetch = async (url, options = {}) => {
    const revision = sessionRevision, owner = currentUser?.id;
    const response = await fetch(url, {...options, headers:{...options.headers,'Content-Type':'application/json'}, credentials:'include'});
    const check = () => { if (revision !== sessionRevision || owner !== currentUser?.id) throw new Error('Resposta de sessão anterior descartada'); };
    check();
    const parse = response.json.bind(response);
    response.json = async () => { const data = await parse(); check(); return data; };
    return response;
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
            currentUser = { id: 'demo123', nome: 'Visitante (Demo)', empresa: 'Fazenda Hidrape', area_hectares: 42, tipoPlantacao: 'Milho', cidade:'Recife', estado:'PE', timeZone:'America/Recife', cropConfig:{minIdeal:40,maxIdeal:70,center:55}, data_cadastro: new Date().toISOString() };

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

            currentToken = "cookie";
            currentUser = data.user;

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

    const ufSelect = document.getElementById('reg-estado');
    const cidadeSelect = document.getElementById('reg-cidade');

    if (ufSelect && cidadeSelect) {
        // Buscar Estados do IBGE
        fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
            .then(res => res.json())
            .then(estados => {
                estados.forEach(estado => {
                    const option = document.createElement('option');
                    option.value = estado.sigla;
                    option.textContent = estado.sigla;
                    ufSelect.appendChild(option);
                });
            })
            .catch(err => console.error('Erro ao buscar estados:', err));

        // Buscar Cidades ao mudar o Estado
        ufSelect.addEventListener('change', (e) => {
            const uf = e.target.value;
            if (!uf) return;

            cidadeSelect.innerHTML = '<option value="" disabled selected>Carregando...</option>';
            cidadeSelect.disabled = true;

            fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
                .then(res => res.json())
                .then(cidades => {
                    cidadeSelect.innerHTML = '<option value="" disabled selected>Selecione a Cidade</option>';
                    cidades.forEach(cidade => {
                        const option = document.createElement('option');
                        option.value = cidade.nome;
                        option.textContent = cidade.nome;
                        cidadeSelect.appendChild(option);
                    });
                    cidadeSelect.disabled = false;
                })
                .catch(err => {
                    console.error('Erro ao buscar cidades:', err);
                    cidadeSelect.innerHTML = '<option value="" disabled selected>Erro ao carregar</option>';
                });
        });
    }

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
            estado: stateInput.toUpperCase(),
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

            currentToken = "cookie";
            currentUser = data.user;

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
            const header = document.querySelector('.farm-context');
            if (header) {
                const b = document.createElement('div');
                b.id = 'global-demo-badge';
                b.className = 'demo-badge';
                b.textContent = 'Demonstração · dados simulados';
                b.title = 'Você está explorando uma demonstração com dados simulados.';
                header.appendChild(b);
            }
        }

        demoIntervalId = setInterval(updateDemoData, 5000);
        // The sample is self-guided; navigation remains available.
    } else {
        const badge = document.getElementById('global-demo-badge');
        if (badge) badge.remove();
    }

    document.getElementById('dash-user').textContent = currentUser.nome.split(' ')[0];
    document.getElementById('dash-culture').textContent = currentUser.tipoPlantacao || 'Não configurada';
    document.getElementById('dash-location').textContent = [currentUser.cidade, currentUser.estado].filter(Boolean).join(', ') || 'Localização não configurada';

    const context = {root:document.querySelector('.dashboard-view'),revision:sessionRevision,owner:currentUser?.id,sensorStatus:'loading',analysisStatus:'loading',lastReadingAt:null,sensorSnapshot:null,sensorError:null};
    dashboardContext = context;
    const isCurrent = () => activeDashboard() === context;
    renderDashboardSensorContext();
    renderDashboardPrediction(null);

    // Init Live Chart (Garbage Collector)
    if (liveChartObj) liveChartObj.destroy();
    const ctxLive = document.getElementById('liveChart').getContext('2d');
    if (typeof Chart !== 'undefined' && Chart.defaults) {
        const theme = getComputedStyle(document.documentElement);
        Chart.defaults.color = theme.getPropertyValue('--text-secondary').trim();
        Chart.defaults.font.family = theme.getPropertyValue('--font-family').trim();
        Chart.defaults.font.weight = 400;
        Chart.defaults.font.size = 11;
        Chart.defaults.animation = false;
    }
    liveChartObj = createChart(ctxLive, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Umidade (%)', data: [], borderColor: '#94B4C1', backgroundColor: 'rgba(148, 180, 193, 0.10)', fill: true, tension: 0.4, borderWidth: 1.5, pointRadius: context => context.dataset.data.length === 1 ? 3 : 0, pointHoverRadius: 4 }] },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#94B4C1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
            scales: {
                x: {
                    ticks: { color: '#ADB4BF', maxTicksLimit: 6 },
                    grid: { display: false }
                },
                y: {
                    max: 100,
                    min: 0,
                    beginAtZero: true,
                    ticks: { color: '#ADB4BF', maxTicksLimit: 6 },
                    grid: { color: 'rgba(255, 255, 255, 0.03)' }
                }
            }
        }
    });

    // Init Weekly Analytics Chart (Garbage Collector)
    if (weeklyChartObj) weeklyChartObj.destroy();
    const ctxWeekly = document.getElementById('weeklyChart').getContext('2d');
    weeklyChartObj = createChart(ctxWeekly, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Média diária de umidade (%)', data: [], backgroundColor: '#829BA8', borderRadius: 4, hoverBackgroundColor: '#94B4C1' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#94B4C1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
            scales: {
                x: {
                    ticks: { color: '#ADB4BF', maxTicksLimit: 6 },
                    grid: { display: false }
                },
                y: {
                    max: 100,
                    min: 0,
                    beginAtZero: true,
                    ticks: { color: '#ADB4BF', maxTicksLimit: 6 },
                    grid: { color: 'rgba(255, 255, 255, 0.03)' }
                }
            }
        }
    });

    // Leaflet Map Init
    let farmMap = null;
    let farmCircle = null;
    if (document.getElementById('farm-map') && typeof L !== 'undefined' && Number.isFinite(currentUser.lat) && Number.isFinite(currentUser.lon)) {
        const mapContainer = L.DomUtil.get('farm-map');
        if (mapContainer != null) {
            mapContainer._leaflet_id = null;
        }
        const lat = Number.isFinite(currentUser.lat) ? currentUser.lat : 0;
        const lon = Number.isFinite(currentUser.lon) ? currentUser.lon : 0;

        if (isNaN(lat) || isNaN(lon)) {
            console.error("Coordenadas inválidas para o mapa", currentUser);
        }

        farmMap = L.map('farm-map').setView([lat, lon], 14);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }).addTo(farmMap);

        L.marker([lat, lon]).addTo(farmMap)
            .bindPopup(`<b>${escapeHTML(currentUser.nome)}</b><br>Cultivo: ${escapeHTML(currentUser.tipoPlantacao)}`).openPopup();



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


            const modal = document.getElementById('nasa-modal');
            openDialog(modal);

            const hist = window._latestSat?.historico || [];
            document.getElementById('nasa-data-summary').textContent = hist.length ? hist.map(h => `${h.data}: ${h.valor}%`).join('; ') : 'Nenhuma observação disponível. Tente novamente após atualizar os dados.';
                        const ctxNasa = document.getElementById('nasaChart').getContext('2d');
            if (nasaChartObj) nasaChartObj.destroy();
            nasaChartObj = createChart(ctxNasa, {
                type: 'line',
                data: {
                    labels: hist.map(h => h.data.slice(-5)),
                    datasets: [{
                        label: 'Saturação regional relativa (%)',
                        data: hist.map(h => h.valor),
                        borderColor: '#f39c12',
                        backgroundColor: 'rgba(243, 156, 18, 0.2)',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#f39c12',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1.5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(20, 28, 38, 0.9)',
                            titleColor: '#fff',
                            bodyColor: '#f39c12',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            cornerRadius: 12,
                            padding: 12,
                            callbacks: {
                                label: (context) => ` Saturação regional: ${context.parsed.y}%`
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { color: 'rgba(255, 255, 255, 0.5)' }, grid: { display: false } },
                        y: { max: 100, min: 0, beginAtZero: true, ticks: { color: 'rgba(255, 255, 255, 0.5)' }, grid: { color: 'rgba(255, 255, 255, 0.04)' } }
                    }
                }
            });
        });
    }
    const closeNasaBtn = document.getElementById('close-nasa-modal');
    if (closeNasaBtn) {
        closeNasaBtn.addEventListener('click', () => {
            const modal = document.getElementById('nasa-modal');
            closeDialog(modal);
        });
    }

    // Client refresh retains the existing API contracts and polling cadence.
    const requestData = async url => {
        const response = await setupAuthFetch(url,{signal:AbortSignal.timeout(15000)});
        if (!response.ok) { const error=new Error('Consulta não concluída');error.status=response.status;throw error; }
        return response.json();
    };
    let sensorPending = null, analysisPending = null, refreshPending = null;
    const readIoT = async force => {
        if (!isCurrent() || (document.hidden && context.lastReadingAt && !force)) return;
        context.sensorStatus = 'loading';
        context.sensorError = null;
        renderDashboardSensorContext();
        try {
            const data = await requestData('/api/sensores/umidade');
            if (!isCurrent()) return;
            if (!Number.isFinite(data.umidade) || data.umidade < 0 || data.umidade > 100) { const error=new Error('Leitura inválida');error.invalidReading=true;throw error; }
            context.sensorStatus = 'ready';
            context.lastReadingAt = data.timestamp || data.previsao?.sensorState?.lastReadingAt || null;
            context.sensorSnapshot = data.previsao || null;
            const value = document.getElementById('umidade-valor');
            const previous = value.textContent;
            value.textContent = data.umidade.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
            if (previous !== value.textContent) playMotion(value,[{backgroundColor:'rgba(148, 180, 193, 0.18)'},{backgroundColor:'transparent'}],{duration:motionDuration('--motion-reading',320),reducedFrames:[{backgroundColor:'rgba(148, 180, 193, 0.12)'},{backgroundColor:'transparent'}]});
            const color = ['SECO','ENCHARCADO'].includes(data.status) ? 'var(--danger)' : data.status === 'IDEAL' ? 'var(--success)' : 'var(--text-primary)';
            value.style.color = color;
            const meter = document.getElementById('umidade-progress');
            meter.style.backgroundColor = color;
            updateSoilMeter(meter,data.umidade);
            dashboardText('soil-insight',data.status === 'IDEAL' ? `Dentro da faixa de referência para ${(currentUser.tipoPlantacao || 'a cultura').toLowerCase()}` : data.diagnostico || 'Confira a faixa da cultura e os avisos da análise.');
            window._latestUmid = data.umidade;
            window._latestStatus = data.status || 'INDEFINIDO';
            applyAgroSnapshot(data.previsao);
            renderInteligence();
            renderDashboardSensorContext();
            renderDashboardPrediction();
            const stamp = new Date(data.timestamp).getTime();
            if (Number.isFinite(stamp) && liveChartObj) {
                const zone = currentUser.timeZone;
                let label;
                try { label=new Date(stamp).toLocaleTimeString('pt-BR',{timeZone:zone || 'UTC'}); }
                catch { label=new Date(stamp).toLocaleTimeString('pt-BR',{timeZone:'UTC'}); }
                liveChartObj.data.labels.push(label);
                liveChartObj.data.datasets[0].data.push(data.umidade);
                if (liveChartObj.data.labels.length > 20) { liveChartObj.data.labels.shift();liveChartObj.data.datasets[0].data.shift(); }
                liveChartObj.update();
                dashboardText('live-data-summary',liveChartObj.data.labels.map((time,i)=>`${time}: ${liveChartObj.data.datasets[0].data[i].toFixed(1)}%`).join('; '));
            }
        } catch (error) {
            if (!isCurrent()) return;
            context.sensorStatus = 'error';
            context.sensorError = dashboardError(error);
            window._latestUmid = null;
            window._latestStatus = 'INDEFINIDO';
            window._agroSnapshot = null;
            window._sensorState = {status:'offline',hasValidData:false};
            dashboardText('umidade-valor','—');
            dashboardText('soil-insight','A última consulta não retornou uma leitura válida.');
            updateSoilMeter(document.getElementById('umidade-progress'),null);
            renderInteligence();
            renderDashboardSensorContext();
            renderDashboardPrediction(null);
        }
    };
    const updateIoT = (force = false) => {
        if (!isCurrent()) return Promise.resolve();
        if (sensorPending) return sensorPending;
        if (liveInterval) { clearTimeout(liveInterval);liveInterval=null; }
        sensorPending = readIoT(force).finally(()=>{
            sensorPending=null;
            if (isCurrent() && context.sensorError?.kind !== 'session') liveInterval=setTimeout(()=>updateIoT(),30000);
        });
        return sensorPending;
    };
    const readAgro = async () => {
        if (!isCurrent()) return;
        context.analysisStatus = 'loading';
        try {
            const data = await requestData('/api/agro/clima');
            if (!isCurrent()) return;
            if (!data.previsao || typeof data.previsao.recomendacao !== 'string') throw new Error('Análise incompleta');
            context.analysisStatus = 'ready';
            window._latestClima = data.clima;
            window._latestSat = data.satelite;
            applyAgroSnapshot(data.previsao);
            if (data.satelite?.available && Number.isFinite(data.satelite.umidadeMacro)) {
                dashboardText('satelite-valor',data.satelite.umidadeMacro+'%');
                dashboardText('satelite-data','Ref: '+data.satelite.dataReferencia);
            } else {
                dashboardText('satelite-valor','Indisponível');
                dashboardText('satelite-data','Dados indisponíveis na fonte. Tente novamente mais tarde.');
            }
            renderInteligence();
            renderDashboardPrediction(data.previsao);
            // Optional phrasing failures retain the deterministic recommendation.
            try {
                const insights = await requestData('/api/agro/insights-ia'+(data.snapshotId ? '?snapshotId='+encodeURIComponent(data.snapshotId) : ''));
                if (!isCurrent()) return;
                if (insights.previsao) applyAgroSnapshot(insights.previsao);
                if (!context.sensorError && typeof insights.diagnostico === 'string') dashboardText('predict-text',insights.diagnostico);
                renderDashboardPrediction();
            } catch { /* The motor's existing explanation remains visible. */ }
        } catch (error) {
            if (!isCurrent()) return;
            context.analysisStatus = 'error';
            if (error.status === 401) context.sensorError = dashboardError(error);
            window._latestClima = null;
            window._latestSat = null;
            window._agroSnapshot = null;
            renderInteligence();
            dashboardText('satelite-valor','—');
            dashboardText('satelite-data','Não foi possível carregar os dados. Tente novamente mais tarde.');
            renderDashboardSensorContext();
            renderDashboardPrediction(null);
        }
        if (context.sensorError?.kind === 'session') return;
        // Weekly history is independent of analysis availability.
        try {
            const week = await requestData('/api/agro/media-semanal');
            if (!isCurrent()) return;
            if (!Array.isArray(week)) throw new Error('Médias inválidas');
            weeklyChartObj.data.labels = week.map(day=>day.dia);
            weeklyChartObj.data.datasets[0].data = week.map(day=>Number.isFinite(day.media) ? day.media : null);
            weeklyChartObj.update();
            window._latestSemana = week;
            dashboardText('weekly-data-summary',week.length ? week.map(day=>`${day.dia}: ${Number.isFinite(day.media) ? day.media.toFixed(1)+'%' : 'sem leitura'}`).join('; ') : 'Sem leituras nos últimos 7 dias completos. Conecte o sensor em Configurações.');
        } catch {
            if (isCurrent()) dashboardText('weekly-data-summary','Não foi possível carregar as médias. Use Atualizar dados para tentar novamente.');
        }
    };
    const updateAgro = () => {
        if (!isCurrent() || context.sensorError?.kind === 'session') return Promise.resolve();
        if (analysisPending) return analysisPending;
        if (weatherInterval) { clearTimeout(weatherInterval);weatherInterval=null; }
        analysisPending=readAgro().finally(()=>{
            analysisPending=null;
            if (isCurrent() && context.sensorError?.kind !== 'session') weatherInterval=setTimeout(updateAgro,10*60*1000);
        });
        return analysisPending;
    };
    const refreshButton = document.getElementById('dashboard-refresh');
    const refresh = () => {
        if (refreshPending) return refreshPending;
        const restoreFocus = document.activeElement === refreshButton;
        if (liveInterval) {clearTimeout(liveInterval);liveInterval=null;}
        if (weatherInterval) {clearTimeout(weatherInterval);weatherInterval=null;}
        refreshButton.disabled=true;
        refreshButton.setAttribute('aria-busy','true');
        dashboardText('dashboard-refresh-label','Atualizando...');
        refreshPending=updateIoT(true).then(updateAgro).finally(()=>{
            refreshPending=null;
            if (!isCurrent()) return;
            refreshButton.disabled=false;
            refreshButton.removeAttribute('aria-busy');
            dashboardText('dashboard-refresh-label',context.sensorError?.kind === 'session' ? 'Entrar novamente' : 'Atualizar dados');
            if (restoreFocus && document.activeElement === document.body) refreshButton.focus({preventScroll:true});
        });
        return refreshPending;
    };
    refreshButton.addEventListener('click',()=>{
        if (context.sensorError?.kind === 'session') { logout(true);return; }
        refresh();
    });
    return refresh();

};


// ----- GEOESPACIAL (MAPA + CLIMA) -----
const initGeo = async () => {
    renderMapAvailability();
    if (weatherInterval) { clearTimeout(weatherInterval); weatherInterval = null; }

    // Leaflet Map Init
    let farmMap = null;
    let farmCircle = null;
    if (document.getElementById('farm-map') && typeof L !== 'undefined' && Number.isFinite(currentUser.lat) && Number.isFinite(currentUser.lon)) {
        const mapContainer = L.DomUtil.get('farm-map');
        if (mapContainer != null) {
            mapContainer._leaflet_id = null;
        }
        const lat = Number.isFinite(currentUser.lat) ? currentUser.lat : 0;
        const lon = Number.isFinite(currentUser.lon) ? currentUser.lon : 0;

        farmMap = L.map('farm-map').setView([lat, lon], 14);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri'
        }).addTo(farmMap);

        L.marker([lat, lon]).addTo(farmMap)
            .bindPopup(`<b>${escapeHTML(currentUser.nome)}</b><br>Cultivo: ${escapeHTML(currentUser.tipoPlantacao)}`).openPopup();



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
            if (!resClima.ok) throw new Error('Motor indisponível');
            applyAgroSnapshot(agroData.previsao);

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

            renderMapAvailability();
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
    document.getElementById('set-timezone').value = currentUser.timeZone || '';
    document.getElementById('set-min').value = currentUser.minIdeal ?? '';
    document.getElementById('set-max').value = currentUser.maxIdeal ?? '';
    if (currentUser.nome) document.getElementById('set-nome').value = currentUser.nome;
    if (currentUser.tipoPlantacao) document.getElementById('set-cultura').value = currentUser.tipoPlantacao;
    if (currentUser.cidade) document.getElementById('set-cidade').value = currentUser.cidade;
    if (currentUser.estado) document.getElementById('set-estado').value = currentUser.estado;
    if (currentUser.tamanhoFazenda) document.getElementById('set-tamanho').value = currentUser.tamanhoFazenda;
    if (currentUser.hasWhatsappPhone) document.getElementById('set-phone').placeholder = 'Telefone configurado (digite para alterar)';
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
                tipoPlantacao: document.getElementById('set-cultura').value,
                cidade: document.getElementById('set-cidade').value,
                estado: document.getElementById('set-estado').value,
                tamanhoFazenda: document.getElementById('set-tamanho').value,
                timeZone: document.getElementById('set-timezone').value,
                minIdeal: document.getElementById('set-min').value === '' ? null : Number(document.getElementById('set-min').value),
                maxIdeal: document.getElementById('set-max').value === '' ? null : Number(document.getElementById('set-max').value)
            };

            const blynkVal = document.getElementById('set-blynk').value;
            const apiKeyVal = document.getElementById('set-apikey').value;
            const whatsVal = document.getElementById('set-phone').value;

            if (blynkVal) requestBody.blynkToken = blynkVal;
            if (apiKeyVal) requestBody.callmebotApiKey = apiKeyVal;
            if (whatsVal) requestBody.whatsappPhone = whatsVal;

            const res = await setupAuthFetch('/api/auth/config', {
                method: 'PUT',
                body: JSON.stringify(requestBody)
            });
            const updated = await res.json();
            if (!res.ok) throw new Error(updated.error || 'Erro ao salvar no BD');

            Object.assign(currentUser, updated);
            clearAgroState();
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
            document.getElementById('set-phone').value = '';

            // Re-render placeholders
            if (updated.hasWhatsappPhone) document.getElementById('set-phone').placeholder = 'Telefone configurado (digite para alterar)';
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
            playMotion(document.getElementById('set-success'), [{opacity: 0.6}, {opacity: 1}], {duration: motionDuration('--motion-feedback', 100)});
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
            if (!res.ok) throw new Error(updated.error || 'Falha ao salvar');
            Object.assign(currentUser, updated);
            clearAgroState();
            for (const id of ['set-blynk','set-phone','set-apikey']) document.getElementById(id).value = '';
            document.getElementById('int-success').style.display = 'block';
            playMotion(document.getElementById('int-success'), [{opacity: 0.6}, {opacity: 1}], {duration: motionDuration('--motion-feedback', 100)});
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
    const analysisRevision = sessionRevision;
    const analysisRoot = document.getElementById('analysis-hero-status');
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
    if (srcCultFaixa) srcCultFaixa.textContent = Number.isFinite(limits.min) ? limits.min + '% – ' + limits.max + '%' : 'Não configurada';
    if (srcCultCenter) srcCultCenter.textContent = Number.isFinite(limits.center) ? limits.center + '%' : 'Não configurado';

    // Timeline: Limite da cultura
    const tlLimit = document.getElementById('an-tl-limit');
    const tlLimitDesc = document.getElementById('an-tl-limit-desc');
    if (tlLimit) tlLimit.textContent = Number.isFinite(limits.min) ? limits.min + '%' : 'Não configurado';
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

            let statusText = sensorData.status === 'IDEAL' ? 'Faixa de referência' : sensorData.status === 'SECO' ? 'Abaixo da faixa' : sensorData.status === 'ENCHARCADO' ? 'Acima da faixa' : 'Verificar sensor';
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
            alertText.textContent = 'O sensor está sem comunicação. Recomendações de manejo foram suspensas.';
        }
    }

    // --- 3. FETCH AGRO (Clima + Previsão + Satélite) ---
    let agroData = null;
    try {
        const agroRes = await setupAuthFetch('/api/agro/clima');
        if (agroRes.ok) {
            agroData = await agroRes.json();
            applyAgroSnapshot(agroData.previsao);
            setCheck('an-check-clima', !!agroData.clima, agroData.clima ? 'Disponível' : 'Indisponível');

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

                if (previsao.status === 'indisponivel') {
                    statusLabel = 'INDISPONÍVEL'; statusColor = 'var(--sys-light)'; icon = 'sensors_off';
                } else if (previsao.status === 'critico') {
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

                let timeText = predictionTime(previsao.tempoHoras);
                if (heroTime) heroTime.textContent = timeText;

                // Timeline
                const tlIrrig = document.getElementById('an-tl-irrig');
                if (tlIrrig) tlIrrig.textContent = predictionTime(previsao.tempoHoras);
            }

            hideSkeleton('analysis-hero-skeleton');

            // --- KPI Cards ---
            if (meta) {
                const kpiDrop = document.getElementById('an-kpi-drop');
                const tlDrop = document.getElementById('an-tl-drop');
                if (kpiDrop) kpiDrop.textContent = Number.isFinite(meta.dropRealTime) ? meta.dropRealTime.toFixed(2) + ' pp/h' : 'Indisponível';
                if (tlDrop) tlDrop.textContent = Number.isFinite(meta.dropRealTime) ? meta.dropRealTime.toFixed(2) + ' pp/h' : 'Indisponível';

                const kpiRain = document.getElementById('an-kpi-rain');
                if (kpiRain) kpiRain.textContent = Number.isFinite(meta.rainProb) ? meta.rainProb + '%' : 'Indisponível';
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
            const et0Val = previsao?.engineData?.climateAnalysis?.eto;
            const kpiEt0 = document.getElementById('an-kpi-et0');
            const srcClimaEt0 = document.getElementById('an-src-clima-et0');
            if (Number.isFinite(et0Val)) {
                if (kpiEt0) kpiEt0.textContent = et0Val.toFixed(1) + ' mm';
                if (srcClimaEt0) srcClimaEt0.textContent = et0Val.toFixed(1) + ' mm';
            } else {
                if (kpiEt0) kpiEt0.textContent = 'N/D';
                if (srcClimaEt0) srcClimaEt0.textContent = 'N/D';
            }

            // --- SATÉLITE ---
            if (agroData.satelite?.available) {
                setCheck('an-check-nasa', true, 'Disponível');
                const srcNasaVal = document.getElementById('an-src-nasa-val');
                const srcNasaDate = document.getElementById('an-src-nasa-date');
                if (srcNasaVal) srcNasaVal.textContent = agroData.satelite.umidadeMacro + '%';
                if (srcNasaDate) srcNasaDate.textContent = agroData.satelite.dataReferencia;

                // NASA Chart
                if (agroData.satelite.historico && agroData.satelite.historico.length > 0) {
                    const ctxNasa = document.getElementById('an-nasaChart');
                    if (ctxNasa) {
                        let anHist = [...agroData.satelite.historico];
                                                if (analysisNasaChart) analysisNasaChart.destroy();
                        analysisNasaChart = createChart(ctxNasa.getContext('2d'), {
                            type: 'line',
                            data: {
                                labels: anHist.map(h => h.data.slice(-5)),
                                datasets: [{
                                    label: 'Saturação regional relativa (%)',
                                    data: anHist.map(h => h.valor),
                                    borderColor: '#f39c12',
                                    backgroundColor: 'rgba(243, 156, 18, 0.15)',
                                    fill: true,
                                    tension: 0.35,
                                    borderWidth: 2,
                                    pointRadius: 4,
                                    pointHoverRadius: 6,
                                    pointBackgroundColor: '#f39c12',
                                    pointBorderColor: '#ffffff',
                                    pointBorderWidth: 1.5
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                animation: {
                                    duration: 1000,
                                    easing: 'easeOutQuart'
                                },
                                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#f39c12', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
                                scales: {
                                    x: { ticks: { color: 'rgba(255, 255, 255, 0.5)' }, grid: { display: false } },
                                    y: { max: 100, min: 0, beginAtZero: true, ticks: { color: 'rgba(255, 255, 255, 0.5)' }, grid: { color: 'rgba(255, 255, 255, 0.04)' } }
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
        if (analysisRevision !== sessionRevision || !analysisRoot?.isConnected) return;
        clearAgroState();
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
            analysisWeeklyChart = createChart(ctxWeek.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: weekData.map(w => w.dia),
                    datasets: [{
                        label: 'Média diária de umidade (%)',
                        data: weekData.map(w => w.media),
                        backgroundColor: '#829BA8',
                        borderRadius: 4,
                        hoverBackgroundColor: '#94B4C1'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20, 28, 38, 0.9)', titleColor: '#fff', bodyColor: '#94B4C1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 12, padding: 12 } },
                    scales: {
                        x: { ticks: { color: '#ADB4BF', maxTicksLimit: 6 }, grid: { display: false } },
                        y: { max: 100, min: 0, beginAtZero: true, ticks: { color: '#ADB4BF', maxTicksLimit: 6 }, grid: { color: 'rgba(255, 255, 255, 0.03)' } }
                    }
                }
            });

            // Average
            const diasComDados = weekData.filter(d => Number.isFinite(d.media));
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
    if (window._agroSnapshot) {
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
            window._latestUmid,
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
            const txt = analiseAvancada(window._latestUmid, window._latestStatus || 'INDEFINIDO', window._latestClima, cultura, window._latestSat);
            analiseTexto.textContent = txt;
        }
    }

    // --- 6. FETCH IA GENERATIVA ---
    try {
        const iaRes = await setupAuthFetch('/api/agro/insights-ia' + (agroData?.snapshotId ? '?snapshotId=' + encodeURIComponent(agroData.snapshotId) : ''));
        if (iaRes.ok) {
            const iaData = await iaRes.json();
                if (iaData.previsao) { if (agroData) agroData.previsao = iaData.previsao; applyAgroSnapshot(iaData.previsao); }
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
            document.getElementById('mr-faixa-ideal').textContent = Number.isFinite(data.kpis.pctIdeal) ? `${data.kpis.pctIdeal}%` : '--%';
            document.getElementById('mr-deficit').textContent = Number.isFinite(data.kpis.pctDeficit) ? `${data.kpis.pctDeficit}%` : '--%';
            document.getElementById('mr-chuva').textContent = data.kpis.chuvaAcumulada !== null ? `${data.kpis.chuvaAcumulada} mm` : '-- mm';
            document.getElementById('mr-et0').textContent = data.kpis.et0Acumulada !== null ? `${data.kpis.et0Acumulada} mm` : '-- mm';
            document.getElementById('mr-recomendacoes-count').textContent = data.kpis.recomendacoesCount !== undefined ? data.kpis.recomendacoesCount : '--';
            document.getElementById('mr-volume-teorico').textContent = data.kpis.volumeTeorico !== null ? `${data.kpis.volumeTeorico} m³` : '-- m³';
            document.getElementById('mr-total-leituras').textContent = data.kpis.totalLeituras;

            // Qualidade dos dados
            const daysInMonth = new Date(year, month, 0).getDate();
            const pctQualidade = data.coverage?.expectedDays ? Math.round(data.coverage.climateDays / data.coverage.expectedDays * 100) : 0;
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
                resumoEl.textContent = `${data.kpis.totalLeituras} amostras registradas, agrupadas no fuso ${data.timeZone}${data.timeZoneConfigured ? '' : ' (configure o fuso da propriedade)'}. ${data.kpis.recomendacoesCount} decisões IRRIGAR registradas, sem comprovação de execução. Clima: ${data.coverage.climateDays}/${data.coverage.expectedDays} dias disponíveis.`;
            }

            // Renderizar Gráfico de Solo
            const ctxSoil = document.getElementById('mr-soil-chart');
            if (mrSoilChartInstance) mrSoilChartInstance.destroy();

            if (data.graficos.solo && data.graficos.solo.length > 0) {
                const labels = data.graficos.solo.map(d => new Date(d.data.slice(0,10) + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone:'UTC'}));
                const values = data.graficos.solo.map(d => d.umidade);

                mrSoilChartInstance = createChart(ctxSoil, {
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
                                        yMin: data.kpis.limites.minIdeal ?? undefined,
                                        yMax: data.kpis.limites.maxIdeal ?? undefined,
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
                const labels = data.graficos.clima.map(d => new Date(d.data.slice(0,10) + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone:'UTC'}));
                const chuva = data.graficos.clima.map(d => d.chuva);
                const et0 = data.graficos.clima.map(d => d.et0);

                mrClimateChartInstance = createChart(ctxClimate, {
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

// Initialize the existing authentication flow.
document.addEventListener('DOMContentLoaded', bootApplication);
