import { it,expect,vi } from 'vitest';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { loader,now,history } from './helpers/offline.js';
const root= new URL('../',import.meta.url);
const file=name=>fs.readFileSync(new URL(name,root),'utf8');
const snapshot=loader()('services/agroEngine/index.js').evaluate({id:'u',tipoPlantacao:'Milho'},[],null,null,now);
const user={id:'u',nome:'Teste',tipoPlantacao:'Milho',cidade:'Recife',estado:'PE',timeZone:'America/Recife',cropConfig:{minIdeal:40,maxIdeal:70,center:55}};
const app=(view,fetcher=async()=>({ok:true,json:async()=>({})}))=>{
    const dom=new JSDOM(file('public/index.html'),{url:'https://hidrape.test',runScripts:'outside-only'}),w=dom.window;
    w.document.getElementById('app-content').innerHTML=file(`public/views/${view}.html`);
    const listener=w.document.addEventListener.bind(w.document);
    w.document.addEventListener=(name,...args)=>name==='DOMContentLoaded'?undefined:listener(name,...args);
    w.fetch=fetcher;w.setTimeout=()=>1;w.clearTimeout=()=>{};w.alert=vi.fn();w.console={...console,error:vi.fn(),warn:vi.fn()};
    w.HTMLCanvasElement.prototype.getContext=()=>({});
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.matchMedia=query=>({get matches(){return query.includes('prefers-reduced-motion') ? !!w.__reducedMotion : w.innerWidth >= 769;},addEventListener:vi.fn()});
    const charts=[];w.Chart=class {constructor(ctx,config){this.data=config.data;charts.push(this);}destroy(){}update(){}};
    w.localStorage.setItem('jwt','legacy-token');
    w.eval(file('public/js/app.js')+`\nwindow.api={initAnalysis,initSettings,initDashboard,applyAgroSnapshot,clearAgroState,predictionTime,logout,setupAuthFetch,openDialog,closeDialog,playMotion,stopAllMotion,updateSoilMeter,motionJobs,dashboardForecast};window.setUser=(u)=>{currentUser=u;currentToken='cookie';};`);
    w.setUser(user);
    return {w,dom,charts};
};
it('interface mantém ausência distinta de zero e remove token legado',()=>{
    const {w,dom}=app('analysis');expect(w.localStorage.getItem('jwt')).toBeNull();w.api.applyAgroSnapshot(snapshot);
    expect(w.document.getElementById('analysis-hero-time').textContent).toBe('Indisponível');expect(w.document.getElementById('analysis-hero-status').textContent).toBe('VERIFICAR_SENSOR');
    expect(w.api.predictionTime(0)).toBe('AGORA');expect(w.api.predictionTime(null)).toBe('Indisponível');dom.window.close();
});
it('análise completa com sensor ausente e NASA indisponível não mostra IDEAL ou null%',async()=>{
    const fetcher=async url=>({ok:!url.includes('sensores/umidade'),json:async()=>url.includes('media-semanal')?[]:url.includes('insights-ia')?{diagnostico:snapshot.recomendacao,previsao:snapshot}:url.includes('agro/clima')?{clima:null,previsao:snapshot,satelite:{available:false,umidadeMacro:null},sensorState:snapshot.sensorState}:{} });
    const {w,dom}=app('analysis',fetcher);await w.api.initAnalysis();
    expect(w.document.getElementById('analysis-hero-status').textContent).toBe('VERIFICAR_SENSOR');
    expect(w.document.getElementById('analysis-hero-time').textContent).toBe('Indisponível');expect(w.document.body.textContent).not.toContain('null%');
    expect(w.document.getElementById('an-check-nasa-label').textContent).toBe('Indisponível');dom.window.close();
});
it('NASA com uma observação produz apenas um ponto no gráfico',async()=>{
    const fetcher=async url=>({ok:true,json:async()=>url.includes('sensores/umidade')?{umidade:0,status:'INDEFINIDO'}:url.includes('media-semanal')?[]:url.includes('insights-ia')?{diagnostico:snapshot.recomendacao,previsao:snapshot}:{clima:null,previsao:snapshot,satelite:{available:true,umidadeMacro:50,dataReferencia:'2026-10-09',historico:[{data:'2026-10-09',valor:50}]}}});
    const {w,dom,charts}=app('analysis',fetcher);await w.api.initAnalysis();const chart=charts.find(c=>c.data.datasets[0].label.includes('Saturação'));
    expect(chart.data.datasets[0].data).toEqual([50]);expect(w._latestUmid).toBe(0);dom.window.close();
});
it('configurações carregam campos existentes e personalizados sem erro de DOM',()=>{
    const {w,dom}=app('settings');expect(()=>w.api.initSettings()).not.toThrow();expect(w.document.getElementById('set-timezone').value).toBe('America/Recife');expect(w.document.getElementById('set-cultura').value).toBe('Milho');dom.window.close();
});
it('ativação agro usa somente o endpoint novo e não submete configuração do login',async()=>{
    const fetcher=vi.fn(async()=>({ok:true,status:201,json:async()=>({})}));
    const {w,dom}=app('settings',fetcher);await w.api.initSettings();
    const button=w.document.getElementById('agro-activate-btn');
    expect(button.type).toBe('button');expect(button.closest('form')).toBeNull();
    button.click();
    await vi.waitFor(()=>expect(w.document.getElementById('agro-activation-status').textContent).toContain('Dispositivo cadastrado'));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('/api/agro/dispositivo-principal');
    expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',body:'{}'});
    dom.window.close();
});
it('resposta iniciada por outro usuário é descartada e logout limpa estado',async()=>{
    let finish;const {w,dom}=app('analysis',()=>new Promise(r=>finish=r));const pending=w.api.setupAuthFetch('/api/agro/clima');
    w.setUser({...user,id:'other'});finish({ok:true,json:async()=>({secret:'other-user-data'})});await expect(pending).rejects.toThrow('sessão anterior');
    w.api.applyAgroSnapshot(snapshot);w.api.clearAgroState();expect(w._agroSnapshot).toBeNull();expect(w.document.getElementById('analysis-hero-status').textContent).toBe('Indisponível');dom.window.close();
});

it('dashboard preserva leitura zero e distingue dias sem medição no resumo acessível',async()=>{
    const fetcher=async url=>({ok:true,json:async()=>url.includes('sensores/umidade')?{umidade:0,status:'SECO',timestamp:new Date().toISOString(),diagnostico:'Abaixo da faixa',previsao:snapshot}:url.includes('media-semanal')?[{dia:'Seg',media:0},{dia:'Ter',media:null}]:url.includes('insights-ia')?{diagnostico:snapshot.recomendacao,previsao:snapshot}:{clima:null,previsao:snapshot,satelite:{available:false},sensorState:snapshot.sensorState}});
    const {w,dom}=app('dashboard',fetcher);
    await w.api.initDashboard();
    await vi.waitFor(()=>expect(w.document.getElementById('weekly-data-summary').textContent).toContain('Ter: sem leitura'));
    expect(w.document.getElementById('umidade-valor').textContent).toBe('0,0%');
    expect(w.document.getElementById('weekly-data-summary').textContent).toContain('Seg: 0.0%');
    expect(w.document.getElementById('live-data-summary').textContent).toContain('0.0%');
    expect(w.document.body.textContent).not.toContain('null%');
    dom.window.close();
});
it('falha do clima não apaga uma leitura válida do sensor e oferece recuperação',async()=>{
    const fetcher=async url=>({ok:url.includes('sensores/umidade'),json:async()=>url.includes('sensores/umidade')?{umidade:55,status:'IDEAL',timestamp:new Date().toISOString(),previsao:snapshot}:{}});
    const {w,dom}=app('dashboard',fetcher);await w.api.initDashboard();
    await vi.waitFor(()=>expect(w.document.getElementById('predict-text').textContent).toContain('Verifique a conexão'));
    expect(w.document.getElementById('umidade-valor').textContent).toBe('55,0%');
    expect(w.document.getElementById('satelite-valor').textContent).toBe('—');
    dom.window.close();
});
it('consulta sem horário de medição não cria ponto em 1970 nem horário artificial',async()=>{
    const previous={...snapshot,sensorState:{...snapshot.sensorState,lastReadingAt:new Date(Date.now()-60000).toISOString()}};
    const fetcher=async url=>({ok:true,json:async()=>url.includes('sensores/umidade')?{umidade:55,status:'INDEFINIDO',timestamp:null,collectedAt:new Date().toISOString(),previsao:previous}:url.includes('media-semanal')?[]:url.includes('insights-ia')?{diagnostico:snapshot.recomendacao,previsao:snapshot}:{clima:null,previsao:snapshot,satelite:{available:false}}});
    const {w,dom,charts}=app('dashboard',fetcher);await w.api.initDashboard();
    expect(charts[0].data.datasets[0].data).toEqual([]);
    expect(w.document.getElementById('soil-reading-time').hasAttribute('datetime')).toBe(false);
    expect(w.document.getElementById('soil-freshness').textContent).toContain('Atualidade não confirmada');
    dom.window.close();
});
it('três coletas sem comunicação apresentam investigação sem afirmar defeito físico',async()=>{
    const fetcher=async url=>({ok:!url.includes('sensores/umidade'),status:url.includes('sensores/umidade')?503:200,json:async()=>url.includes('sensores/umidade')?{sensorState:{investigationRequired:true,communicationMisses:3}}:url.includes('media-semanal')?[]:url.includes('insights-ia')?{diagnostico:snapshot.recomendacao,previsao:snapshot}:{clima:null,previsao:snapshot,satelite:{available:false}}});
    const {w,dom}=app('dashboard',fetcher);await w.api.initDashboard();
    expect(w.document.getElementById('predict-action').textContent).toBe('Investigue a comunicação');
    expect(w.document.getElementById('predict-text').textContent).toContain('não comprova defeito físico');dom.window.close();
});
it('dashboard apresenta vazio e diálogo NASA sem inventar observações',async()=>{
    const fetcher=async url=>({ok:true,json:async()=>url.includes('sensores/umidade')?{umidade:55,status:'IDEAL',timestamp:new Date().toISOString(),previsao:snapshot}:url.includes('media-semanal')?[]:url.includes('insights-ia')?{diagnostico:snapshot.recomendacao,previsao:snapshot}:{clima:null,previsao:snapshot,satelite:{available:false}}});
    const {w,dom}=app('dashboard',fetcher);await w.api.initDashboard();
    await vi.waitFor(()=>expect(w.document.getElementById('weekly-data-summary').textContent).toContain('Sem leituras'));
    w.document.getElementById('nasa-card').click();expect(w.document.getElementById('nasa-modal').open).toBe(true);
    expect(w.document.getElementById('nasa-data-summary').textContent).toContain('Nenhuma observação');
    w.document.getElementById('close-nasa-modal').click();expect(w.document.getElementById('nasa-modal').open).toBe(false);
    dom.window.close();
});
it('busca ignora acentos, sinaliza resultado vazio e fecha pelo controle visível',()=>{
    const {w,dom}=app('dashboard');w.document.getElementById('open-search').click();
    const input=w.document.getElementById('global-search'), dialog=w.document.getElementById('search-dialog');
    expect(dialog.open).toBe(true);expect(w.document.activeElement).toBe(input);
    input.value='historico';input.dispatchEvent(new w.Event('input'));
    expect(w.document.querySelectorAll('#search-results a').length).toBe(1);
    expect(w.document.querySelector('#search-results a').dataset.route).toBe('history');
    input.value='inexistente';input.dispatchEvent(new w.Event('input'));expect(w.document.getElementById('search-empty').hidden).toBe(false);
    w.document.querySelector('[data-close-dialog="search-dialog"]').click();expect(dialog.open).toBe(false);
    dom.window.close();
});
it('menu móvel alterna estado acessível, bloqueia conteúdo de fundo e fecha com Escape',()=>{
    const {w,dom}=app('dashboard');const button=w.document.getElementById('mobile-menu-btn');button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');expect(w.document.getElementById('app-content').inert).toBe(true);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
    expect(button.getAttribute('aria-expanded')).toBe('false');expect(w.document.getElementById('app-content').inert).toBe(false);
    expect(w.document.getElementById('sidebar-backdrop').hidden).toBe(true);expect(w.document.activeElement).toBe(button);
    dom.window.close();
});
it('falha de carregamento de Chart.js mantém valores textuais e permite reabrir o diálogo',async()=>{
    const fetcher=async url=>({ok:true,json:async()=>url.includes('sensores/umidade')?{umidade:55,status:'IDEAL',timestamp:new Date().toISOString(),previsao:snapshot}:url.includes('media-semanal')?[]:url.includes('insights-ia')?{diagnostico:snapshot.recomendacao,previsao:snapshot}:{clima:null,previsao:snapshot,satelite:{available:false}}});
    const {w,dom}=app('dashboard',fetcher);w.Chart=undefined;
    w.HTMLCanvasElement.prototype.getContext=function(){return {canvas:this};};
    await w.api.initDashboard();
    await vi.waitFor(()=>expect(w.document.getElementById('weekly-data-summary').textContent).toContain('Sem leituras'));
    expect(w.document.getElementById('live-data-summary').textContent).toContain('55.0%');
    expect(w.document.getElementById('liveChart').hidden).toBe(true);
    for(let i=0;i<2;i++) {w.document.getElementById('nasa-card').click();expect(w.document.getElementById('nasa-modal').open).toBe(true);w.document.getElementById('close-nasa-modal').click();}
    expect(w.document.querySelectorAll('.nasa-chart-wrap .chart-unavailable').length).toBe(1);
    dom.window.close();
});

const motionHarness = w => {
    Object.defineProperty(w.document,'hidden',{configurable:true,value:false});
    const animations=[];
    w.HTMLElement.prototype.animate=vi.fn((frames,options)=>{
        let finish;
        const animation={frames,options,cancel:vi.fn(),finished:new Promise(resolve=>finish=resolve),finish:()=>finish()};
        animations.push(animation);return animation;
    });
    return animations;
};
it('fechar e reabrir diálogo interrompe o efeito antigo sem fechar a nova interação',async()=>{
    const {w,dom}=app('dashboard'),animations=motionHarness(w),dialog=w.document.getElementById('search-dialog');
    w.api.openDialog(dialog);w.api.closeDialog(dialog);w.api.openDialog(dialog);
    expect(animations[0].cancel).toHaveBeenCalledOnce();expect(dialog.open).toBe(true);
    animations[0].finish();await Promise.resolve();
    expect(w.api.motionJobs.get(dialog)).toBe(animations[1]);expect(dialog.open).toBe(true);
    animations[1].finish();await Promise.resolve();expect(w.api.motionJobs.size).toBe(0);
    dom.window.close();
});
it('movimento reduzido mantém feedback de camada sem deslocamento nem escala',()=>{
    const {w,dom}=app('dashboard'),animations=motionHarness(w);w.__reducedMotion=true;
    w.api.openDialog(w.document.getElementById('search-dialog'));
    expect(animations).toHaveLength(1);expect(animations[0].frames.every(frame=>!('transform' in frame))).toBe(true);
    const meter=w.document.getElementById('umidade-progress');w.api.updateSoilMeter(meter,55);
    expect(meter.style.transform).toBe('scaleX(0.55)');expect(animations).toHaveLength(1);
    dom.window.close();
});
it('aba oculta encerra efeitos em curso e não cria novos efeitos',()=>{
    const {w,dom}=app('dashboard'),animations=motionHarness(w),dialog=w.document.getElementById('search-dialog');
    w.api.openDialog(dialog);Object.defineProperty(w.document,'hidden',{configurable:true,value:true});
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    expect(animations[0].cancel).toHaveBeenCalledOnce();expect(w.api.motionJobs.size).toBe(0);
    w.api.playMotion(dialog,[{opacity:0},{opacity:1}]);expect(animations).toHaveLength(1);expect(dialog.open).toBe(true);
    dom.window.close();
});
it('controles continuam disponíveis quando o navegador não suporta animações',()=>{
    const {w,dom}=app('dashboard'),dialog=w.document.getElementById('search-dialog');
    expect(()=>w.api.openDialog(dialog)).not.toThrow();expect(dialog.open).toBe(true);
    w.api.closeDialog(dialog);expect(dialog.open).toBe(false);dom.window.close();
});
it('reabrir o menu móvel durante a saída preserva foco e estado do painel atual',async()=>{
    const {w,dom}=app('dashboard'),animations=motionHarness(w);
    Object.defineProperty(w,'innerWidth',{configurable:true,value:390});
    const button=w.document.getElementById('mobile-menu-btn'),sidebar=w.document.getElementById('sidebar');
    button.click();expect(sidebar.inert).toBe(false);
    button.click();expect(sidebar.inert).toBe(true);expect(w.document.activeElement).toBe(button);
    button.click();animations[1].finish();await Promise.resolve();
    expect(sidebar.inert).toBe(false);expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(w.document.getElementById('app-content').inert).toBe(true);
    expect(w.api.motionJobs.get(sidebar)).toBe(animations[2]);
    expect(w.document.activeElement).toBe(w.document.getElementById('open-search'));
    w.api.stopAllMotion();dom.window.close();
});

const readyForecast = {
    status:'normal',tempoHoras:null,recomendacao:'Leitura dentro da faixa. Continue monitorando.',
    sensorState:{status:'online',hasValidData:true},
    engineData:{recommendation:{action:'MONITORAR'},confidence:{eligible:true,score:65,level:'MEDIUM'},predictor:{dynamicDropRate:null,cropSupported:true}}
};
const dashboardResponses = (sensor, forecast=readyForecast) => async url=>({ok:true,json:async()=>url.includes('sensores/umidade')?{umidade:55,status:'IDEAL',timestamp:new Date().toISOString(),previsao:forecast,...sensor}:url.includes('media-semanal')?[]:url.includes('insights-ia')?{diagnostico:forecast.recomendacao,previsao:forecast}:{clima:null,previsao:forecast,satelite:{available:false}}});
it('leitura saudável sem tendência mantém orientação e explica a ausência de estimativa',async()=>{
    const {w,dom}=app('dashboard',dashboardResponses());await w.api.initDashboard();
    expect(w.document.getElementById('predict-action').textContent).toBe('Continue acompanhando');
    expect(w.document.getElementById('predict-time').textContent).toBe('Ainda sem estimativa de tempo');
    expect(w.document.getElementById('predict-reason').textContent).toContain('Não há tendência de secagem confiável');
    expect(w.document.getElementById('soil-crop-range').textContent).toBe('40% a 70% do sensor calibrado');
    expect(w.document.getElementById('soil-reading-time').dateTime).toBeTruthy();
    expect(w.document.getElementById('soil-freshness').textContent).toContain('há menos de 1 min');
    dom.window.close();
});
it('estimativas distintas explicam zero, horizonte observado e suspensão por leitura antiga',()=>{
    const {w,dom}=app('dashboard'),forecast=w.api.dashboardForecast;
    expect(forecast({...readyForecast,tempoHoras:0},null).time).toBe('Limite inferior atingido');
    expect(forecast({...readyForecast,tempoHoras:2.5},null).time).toBe('≈ 2,5 h');
    const beyond={...readyForecast,engineData:{...readyForecast.engineData,predictor:{dynamicDropRate:1,cropSupported:true}}};
    expect(forecast(beyond,null).reason).toContain('horizonte do histórico observado');
    const stale={...readyForecast,tempoHoras:2,sensorState:{status:'stale',hasValidData:false}};
    expect(forecast(stale,null).time).toBe('Estimativa suspensa');
    expect(forecast(stale,null).reason).toContain('leituras desatualizadas');
    dom.window.close();
});
it('erro do sensor não é sobrescrito por análise saudável e uma única tentativa recupera a tela',async()=>{
    let sensorCalls=0,resolveRetry;
    const normal=dashboardResponses();
    const fetcher=async url=>{
        if(url.includes('sensores/umidade')) {
            sensorCalls++;
            if(sensorCalls===1) return {ok:false,status:503,json:async()=>({})};
            return new Promise(resolve=>resolveRetry=()=>resolve({ok:true,json:async()=>({umidade:61,status:'IDEAL',timestamp:new Date().toISOString(),previsao:readyForecast})}));
        }
        return normal(url);
    };
    const {w,dom}=app('dashboard',fetcher);await w.api.initDashboard();
    expect(w.document.getElementById('predict-action').textContent).toBe('Sensor sem comunicação');
    expect(w.document.getElementById('predict-text').textContent).toContain('Confira a alimentação');
    expect(w.document.getElementById('umidade-valor').textContent).toBe('—');
    const root=w.document.querySelector('.dashboard-view'),button=w.document.getElementById('dashboard-refresh');
    button.focus();button.click();button.dispatchEvent(new w.Event('click'));
    expect(button.disabled).toBe(true);expect(button.getAttribute('aria-busy')).toBe('true');expect(sensorCalls).toBe(2);
    resolveRetry();await vi.waitFor(()=>expect(button.disabled).toBe(false));
    expect(w.document.querySelector('.dashboard-view')).toBe(root);
    expect(w.document.getElementById('umidade-valor').textContent).toBe('61,0%');
    expect(w.document.getElementById('predict-action').textContent).toBe('Continue acompanhando');
    expect(button.hasAttribute('aria-busy')).toBe(false);
    dom.window.close();
});
it('configuração ausente oferece destino específico e fuso inválido é identificado como UTC',async()=>{
    const normal=dashboardResponses();
    const {w,dom}=app('dashboard',async url=>url.includes('sensores/umidade')?{ok:false,status:403,json:async()=>({})}:normal(url));
    await w.api.initDashboard();
    expect(w.document.getElementById('predict-action').textContent).toBe('Configure o sensor');
    expect(w.document.getElementById('dashboard-settings-link').hidden).toBe(false);
    expect(w.document.getElementById('dashboard-settings-link').dataset.route).toBe('settings');
    dom.window.close();
    const second=app('dashboard',dashboardResponses({timestamp:new Date(Date.now()-40*60000).toISOString()}));
    second.w.setUser({...user,timeZone:'invalid-zone',cropConfig:{minIdeal:0,maxIdeal:20}});await second.w.api.initDashboard();
    expect(second.w.document.getElementById('soil-reading-time').textContent).toContain('UTC (configure o fuso)');
    expect(second.w.document.getElementById('soil-freshness').textContent).toContain('Leitura desatualizada');
    expect(second.w.document.getElementById('soil-crop-range').textContent).toBe('0% a 20% do sensor calibrado');
    second.dom.window.close();
});
it('resposta pendente da visão anterior não altera conteúdo nem inicia nova consulta após sair',async()=>{
    let finish;const fetcher=vi.fn(()=>new Promise(resolve=>finish=resolve));
    const {w,dom}=app('dashboard',fetcher),pending=w.api.initDashboard();
    w.document.getElementById('app-content').innerHTML='<p id="new-route">Conteúdo da nova página</p>';
    w.setUser({...user,id:'other'});finish({ok:true,json:async()=>({umidade:99,status:'IDEAL',timestamp:new Date().toISOString(),previsao:readyForecast})});
    await pending;expect(w.document.getElementById('new-route').textContent).toBe('Conteúdo da nova página');
    expect(fetcher).toHaveBeenCalledTimes(1);dom.window.close();
});
it('solo e próximo passo antecedem referências e gráficos também na ordem semântica',()=>{
    const {w,dom}=app('dashboard'),d=w.document;
    const before=(first,second)=>!!(d.querySelector(first).compareDocumentPosition(d.querySelector(second))&w.Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before('.card-signature','#predict-card')).toBe(true);
    expect(before('#predict-card','.dashboard-metrics')).toBe(true);
    expect(before('#dashboard-refresh','#liveChart')).toBe(true);
    dom.window.close();
});
it('sessão expirada informa a ação necessária e não continua consultando a análise',async()=>{
    const fetcher=vi.fn(async()=>({ok:false,status:401,json:async()=>({})}));
    const {w,dom}=app('dashboard',fetcher);await w.api.initDashboard();
    expect(w.document.getElementById('predict-action').textContent).toBe('Entre novamente');
    expect(w.document.getElementById('dashboard-refresh-label').textContent).toBe('Entrar novamente');
    expect(fetcher).toHaveBeenCalledTimes(1);dom.window.close();
});
it('análise anterior não limpa a leitura da visão geral aberta enquanto a resposta estava pendente',async()=>{
    let finishClimate;
    const fetcher=async url=>url.includes('sensores/umidade')?{ok:true,json:async()=>({umidade:55,status:'IDEAL'})}:new Promise(resolve=>finishClimate=resolve);
    const {w,dom}=app('analysis',fetcher),pending=w.api.initAnalysis();
    await vi.waitFor(()=>expect(finishClimate).toBeTypeOf('function'));
    w.document.getElementById('app-content').innerHTML=file('public/views/dashboard.html');
    w.document.getElementById('umidade-valor').textContent='55,0%';
    finishClimate({ok:false,json:async()=>({})});await pending;
    expect(w.document.getElementById('umidade-valor').textContent).toBe('55,0%');dom.window.close();
});
it('consulta pendente não reescreve a visão geral quando o usuário muda no mesmo DOM',async()=>{
    let finish;const fetcher=vi.fn(()=>new Promise(resolve=>finish=resolve));
    const {w,dom}=app('dashboard',fetcher),pending=w.api.initDashboard();
    w.setUser({...user,id:'new-owner'});
    w.document.getElementById('umidade-valor').textContent='Dados da nova sessão';
    finish({ok:true,json:async()=>({umidade:99,status:'IDEAL',timestamp:new Date().toISOString(),previsao:readyForecast})});
    await pending;expect(w.document.getElementById('umidade-valor').textContent).toBe('Dados da nova sessão');
    expect(fetcher).toHaveBeenCalledTimes(1);dom.window.close();
});

it('cards desktop abrem detalhes atuais sem mover conteúdo ou duplicar identificadores',async()=>{
    const {w,dom}=app('dashboard',dashboardResponses());await w.api.initDashboard();
    const d=w.document, modal=d.getElementById('dashboard-details');
    d.querySelector('[data-dashboard-detail="soil"]').click();
    expect(modal.open).toBe(true);
    expect(modal.textContent).toContain('40% a 70% do sensor calibrado');
    expect(modal.textContent).toContain('55,0%');
    expect(d.querySelector('[data-dashboard-detail="soil"] #soil-reading-time')).not.toBeNull();
    expect(modal.querySelectorAll('#soil-reading-time').length).toBe(0);
    expect(d.activeElement.classList.contains('card-details-trigger')).toBe(true);
    w.api.closeDialog(modal);
    d.getElementById('soil-insight').textContent='Detalhamento atualizado';
    d.querySelector('[data-dashboard-detail="soil"] .card-details-trigger').click();
    expect(modal.textContent).toContain('Detalhamento atualizado');
    w.api.closeDialog(modal);
    d.getElementById('dashboard-refresh').click();
    expect(modal.open).toBe(false);
    d.querySelector('[data-dashboard-detail="nasa"]').click();
    expect(d.getElementById('nasa-modal').open).toBe(true);
    expect(modal.open).toBe(false);
    dom.window.close();
});
it('mobile mantém cards sem ativação de detalhes ao tocar no conteúdo',async()=>{
    const {w,dom}=app('dashboard',dashboardResponses());w.innerWidth=390;await w.api.initDashboard();
    w.document.querySelector('[data-dashboard-detail="soil"]').click();
    expect(w.document.getElementById('dashboard-details').open).toBe(false);
    expect(w.document.getElementById('soil-crop-range').textContent).toContain('40% a 70%');
    dom.window.close();
});
it('detalhes dos gráficos copiam os pontos atuais e preservam a tabela textual',async()=>{
    const {w,dom,charts}=app('dashboard',dashboardResponses());await w.api.initDashboard();
    const d=w.document, modal=d.getElementById('dashboard-details');
    d.querySelector('[data-dashboard-detail="live"] .card-details-trigger').click();
    const source=charts[0], detail=charts.at(-1);
    expect(detail.data.datasets[0].data).toEqual(source.data.datasets[0].data);
    expect(detail.data.datasets[0].data).not.toBe(source.data.datasets[0].data);
    expect(modal.textContent).toContain(d.getElementById('live-data-summary').textContent);
    detail.destroy=vi.fn();w.api.closeDialog(modal);modal.dispatchEvent(new w.Event('close'));
    expect(detail.destroy).toHaveBeenCalledOnce();
    dom.window.close();
});
