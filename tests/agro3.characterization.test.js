import { it, expect, vi } from 'vitest';
import { loader, history, weather, now, response } from './helpers/offline.js';

it('agro-3 mantém decisão, unidades, entradas e identidade reproduzível', () => {
    const { evaluate } = loader()('services/agroEngine/index.js');
    const user = { id:'owner', tipoPlantacao:'Milho' };
    const first = evaluate(user, history(30), weather(), null, now);
    expect(first.engineData.version).toBe('agro-3');
    expect(first.engineData.recommendation.action).toBe('IRRIGAR');
    expect(first.engineData.confidence.basis).toBe('OPERATIONAL_SCORE_NOT_PROBABILITY');
    expect(first.engineData.inputs.history).toHaveLength(9);
    expect(evaluate(user, history(30), weather(), null, now).snapshotId).toBe(first.snapshotId);
});

it.each([{ value:50, age:14, count:0 }, { value:52, age:14, count:1 }, { value:50, age:15, count:1 }])(
    'GET legado preserva a regra 15 minutos / 2 pontos: %j', async ({value, age, count}) => {
        const create = vi.fn(async () => ({data:new Date()}));
        const user = {id:'owner',tipoPlantacao:'Milho',blynkToken:'cipher'};
        const controller = loader({
            axios:{get:vi.fn().mockResolvedValueOnce({data:true}).mockResolvedValueOnce({data:value})},
            'lib/prisma.js':{user:{findUnique:async()=>user},sensor:{findFirst:async()=>({umidade:50,data:new Date(Date.now()-age*60000)}),create,findMany:async()=>[]}}
        })('controllers/sensorController.js');
        const res = response(); await controller.getLiveSystem({user:{id:'owner'}},res);
        expect(res.statusCode).toBe(200); expect(create).toHaveBeenCalledTimes(count);
        expect(res.body.umidade).toBe(value); expect(res.body.previsao.engineData.version).toBe('agro-3');
    }
);

it('log legado conserva histórico integral e talhão ausente', async () => {
    const create = vi.fn(async()=>({}));
    const load = loader({'lib/prisma.js':{agroLog:{create}}});
    const snapshot = load('services/agroEngine/index.js').evaluate({id:'owner',tipoPlantacao:'Milho'},history(),null,null,now);
    await load('services/agroEngine/observability.js').logAgroDecision('owner',snapshot.engineData);
    expect(create.mock.calls[0][0].data.talhaoId).toBeNull();
    expect(JSON.parse(create.mock.calls[0][0].data.dadosUtilizados).inputs.history).toHaveLength(9);
});

it('salto continua suspeito e bloqueia manejo no agro-3', () => {
    const rows = history(80); rows[1].umidade=30;
    const result = loader()('services/agroEngine/index.js').evaluate({id:'owner',tipoPlantacao:'Milho'},rows,weather(),null,now);
    expect(result.engineData.recommendation.action).toBe('VERIFICAR_SENSOR');
    expect(result.engineData.anomalies.some(a=>a.type==='RAPID_WETTING')).toBe(true);
    expect(result.tempoHoras).toBeNull();
});
