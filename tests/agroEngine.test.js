import { describe,it,expect } from 'vitest';
import { loader, now, history, weather } from './helpers/offline.js';
const load = loader(), { evaluate } = load('services/agroEngine/index.js');
const user = {id:'tenant-a',tipoPlantacao:'Milho'};
const engine = (rows,climate=weather(),u=user) => evaluate(u,rows,climate,null,now);
describe('Bloqueios de manejo e números do motor',()=>{
    it.each([[],history(30,1),history(30,2)])('não recomenda sem histórico suficiente %#',rows=>{
        const result=engine(rows); expect(result.status).toBe('indisponivel'); expect(result.tempoHoras).toBeNull();
    });
    it.each([null,undefined,NaN,Infinity,-1,101,'30','1023raw'])('rejeita umidade inválida %s em qualquer posição',value=>{
        const rows=history(30); rows[4].umidade=value;
        expect(engine(rows).engineData.recommendation.action).toBe('VERIFICAR_SENSOR');
    });
    it.each(['bad-date',null,new Date(now+60000)])('rejeita timestamp inválido %s',date=>{
        const rows=history(); rows[3].data=date; expect(engine(rows).status).toBe('indisponivel');
    });
    it('ordena sem mutar o histórico',()=>{
        const rows=history(); const shuffled=rows.toReversed(); expect(engine(shuffled).recomendacao).toBe(engine(rows).recomendacao); expect(shuffled[0]).toEqual(rows.at(-1));
    });
    it('bloqueia timestamps duplicados e dados antigos',()=>{
        const rows=history();rows[1].data=rows[0].data;expect(engine(rows).status).toBe('indisponivel');
        expect(engine(history().map(r=>({...r,data:new Date(r.data.getTime()-31*60000)}))).status).toBe('indisponivel');
    });
    it('suspeita de congelamento com pequena oscilação e explica a janela real',()=>{
        const rows=history().map((r,i)=>({...r,umidade:20+(i%2)*0.05}));const result=engine(rows);
        expect(result.status).toBe('indisponivel');expect(result.recomendacao).toContain('2.0h');expect(result.recomendacao).not.toContain('24h');
    });
    it('não diagnostica congelamento em apenas quatro minutos',()=>{
        const rows=history(20,5,1).map(r=>({...r,umidade:20}));expect(engine(rows).engineData.anomalies.some(a=>a.type==='FROZEN_SENSOR')).toBe(false);
    });
    it('queda e salto por chuva exigem confirmação, sem afirmar defeito',()=>{
        const rows=history(20);rows[1].umidade=70;expect(engine(rows).status).toBe('indisponivel');
        const wet=history(80);wet[1].umidade=40;const result=engine(wet);expect(result.status).toBe('indisponivel');expect(result.recomendacao).toContain('pode ser chuva');
    });
    it.each([30,40])('limite inferior e déficit nunca aguardam chuva incerta (%s)',value=>{
        const rainy=weather();rainy.hourly.precipitation[11]=50;rainy.hourly.precipitation_probability[11]=100;
        const result=engine(history(value),rainy);expect(result.engineData.recommendation.action).toBe('IRRIGAR');expect(result.tempoHoras).toBe(0);
    });
    it('excesso gera alerta e risco alto',()=>{
        const result=engine(history(85));expect(result.engineData.recommendation.action).toBe('EXCESSO_UMIDADE');expect(result.engineData.risk.level).toBe('HIGH');
    });
    it('clima ausente reduz confiança sem inventar temperaturas',()=>{
        const result=engine(history(30),null);expect(result.engineData.confidence.level).toBe('MEDIUM');expect(result.engineData.climateAnalysis.temperature).toBeNull();
    });
    it('cultura desconhecida bloqueia, Unicode equivalente usa a mesma faixa',()=>{
        expect(engine(history(),weather(),{...user,tipoPlantacao:'???'}).status).toBe('indisponivel');
        const config=load('config/cultures.js').getCropConfig;expect(config('Hortaliças'.normalize('NFD')).minIdeal).toBe(50);
        expect(config({tipoPlantacao:'Personalizado',minIdeal:25,maxIdeal:75}).supported).toBe(true);
        expect(config('Personalizado').supported).toBe(false);
    });
    it('regressão observada não muda por ET₀, NASA ou multiplicadores',()=>{
        const predict=load('services/agroEngine/mlPredictor.js').predictMoisture;
        expect(predict(history(),{eto:100,climateMultiplier:50},'Milho',now).dynamicDropRate).toBe(4);
        expect(predict(history(50,2),{eto:5},'Milho',now).dynamicDropRate).toBeNull();
    });
    it('não extrapola além do histórico nem limita tempo distante a 48h',()=>{
        const rows=history(50,25,60).map((r,i)=>({...r,umidade:50+i*0.2})); const result=engine(rows);
        expect(result.tempoHoras).toBeNull();expect(result.engineData.predictions.in24h).toBeCloseTo(45.2);
        expect(engine(history()).engineData.predictions.in6h).toBeNull();
    });
    it('previsões são nulas ou permanecem entre 0 e 100',()=>{
        const result=engine(history(5,25,60));for(const value of Object.values(result.engineData.predictions)) if(value!==null){expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(100);}
    });
});
describe('Clima e fontes',()=>{
    const analyze=load('services/agroEngine/climateAnalyzer.js').analyzeClimate;
    it('usa timestamps absolutos e não pondera mm por probabilidade',()=>{
        const data=weather();data.hourly.precipitation.fill(1);data.hourly.precipitation_probability.fill(50);
        const result=analyze(data,null,now);expect(result.available).toBe(true);expect(result.expectedRainVolume12h).toBe(12);
        data.hourly.time=data.hourly.time.map(t=>new Date((t-10800)*1000).toISOString().slice(0,16));expect(analyze(data,null,now)).toEqual(result);
    });
    it('dados passados, parciais, null e erro HTTP não são clima válido',()=>{
        expect(analyze({error:true},null,now).available).toBe(false);
        const data=weather();data.hourly.time=data.hourly.time.map(t=>t-24*3600);expect(analyze(data,null,now).expectedRainVolume12h).toBeNull();
        const partial=weather();partial.hourly.precipitation[0]=null;expect(analyze(partial,null,now).available).toBe(false);
    });
    it('NASA exclui sentinelas, null, datas falsas e dados velhos',()=>{
        const parse=load('services/satelliteService.js').parseSatellite;
        const result=parse({properties:{parameter:{GWETTOP:{20261010:0.5,20261009:null,20261008:-999,20261007:1.5,20260231:0.5}}}},now);
        expect(result.historico).toHaveLength(1);expect(result.umidadeMacro).toBe(50);
        expect(parse({properties:{parameter:{GWETTOP:{20260925:0.4}}}},now).umidadeMacro).toBeNull();
    });
    it('Redis indisponível não pendura NASA nem cria dados',async()=>{
        const satellite=loader({'lib/redis.js':{get:async()=>{throw Error();}},'lib/httpJson.js':{validCoordinates:()=>true,getJson:async()=>{throw Error();}}})('services/satelliteService.js');
        expect((await satellite.fetchSateliteData(0,0)).available).toBe(false);
    });
});
it('desconexão conhecida bloqueia inclusive leituras recentes',()=>{
    const result=engine(history(30),weather(),{...user,sensorOnline:false});expect(result.status).toBe('indisponivel');expect(result.sensorState.status).toBe('offline');
});
it('congelamento recente não é mascarado por variação mais antiga',()=>{
    const rows=history();rows.slice(0,5).forEach(r=>r.umidade=20);expect(engine(rows).engineData.anomalies.some(a=>a.type==='FROZEN_SENSOR')).toBe(true);
});
it('salto antigo confirmado por novas leituras deixa de bloquear por 24h',()=>{
    const rows=history(60,10,15);rows.slice(6).forEach(r=>r.umidade=20);
    const result=engine(rows);expect(result.engineData.anomalies.some(a=>a.type==='PAST_JUMP')).toBe(true);expect(result.status).not.toBe('indisponivel');
});
