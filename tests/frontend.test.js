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
    const charts=[];w.Chart=class {constructor(ctx,config){this.data=config.data;charts.push(this);}destroy(){}update(){}};
    w.localStorage.setItem('jwt','legacy-token');
    w.eval(file('public/js/app.js')+`\nwindow.api={initAnalysis,initSettings,initDashboard,applyAgroSnapshot,clearAgroState,predictionTime,logout,setupAuthFetch};window.setUser=(u)=>{currentUser=u;currentToken='cookie';};`);
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
