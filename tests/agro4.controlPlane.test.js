import {it,expect,vi} from 'vitest';
import {loader,now} from './helpers/offline.js';
const load=loader(),{createControlPlane}=load('services/agro4/controlPlane.js'),{AgroRepository}=load('services/agro4/repository.js');
const device={id:'device',userId:'owner'};
const authorization={active:true,deviceId:'device',userId:'owner',revision:'a'.repeat(64),sensorRevision:'b'.repeat(64),config:{tipoPlantacao:'Milho',minIdeal:null,maxIdeal:null,timeZone:null,cidade:'',lat:null,lon:null},credential:'synthetic-cipher'};
it('controle usa segredo próprio, limita transporte e verifica proprietário',async()=>{
    const http={post:vi.fn(async()=>({data:authorization}))};
    const result=await createControlPlane({url:'https://backend.invalid',secret:'synthetic-secret',http})(device);
    expect(result.revision).toBe(authorization.revision);expect(http.post.mock.calls[0][0]).toBe('https://backend.invalid/api/agro/worker/authorization');
    expect(http.post.mock.calls[0][2]).toMatchObject({timeout:4000,maxRedirects:0,headers:{Authorization:'Bearer synthetic-secret'}});
});
it('resposta de outro usuário ou falha do controle não permite fallback a credencial antiga',async()=>{
    const http={post:async()=>({data:{...authorization,userId:'other'}})};
    await expect(createControlPlane({url:'https://backend.invalid',secret:'synthetic',http})(device)).rejects.toThrow('AGRO_AUTHORIZATION_UNAVAILABLE');
    await expect(createControlPlane({url:'https://backend.invalid',secret:'synthetic',http:{post:async()=>{throw Error('PRIVATE');}}})(device)).rejects.toThrow('AGRO_AUTHORIZATION_UNAVAILABLE');
});
it('trocar o token limpa atualidade e inicia novo histórico sem apagar registros',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:1})),repository=new AgroRepository({query});
    const previous={...device,talhaoId:'plot',config:authorization.config,state:{sensorRevision:'old',authorizationRevision:'old',lastMeasurementAt:new Date(now-60000).toISOString(),value:55}};
    const updated=await repository.syncAuthorization(previous,authorization,new Date(now));
    expect(updated.state.lastMeasurementAt).toBeNull();expect(updated.state.value).toBeNull();expect(updated.state.historySince).toBe(new Date(now).toISOString());
    expect(query.mock.calls.every(([sql])=>!sql.includes('DELETE') && !sql.includes('"User"'))).toBe(true);
    await repository.history('owner','device',now+60000,updated.state.historySince);
    expect(query.mock.calls.at(-1)[1][3]).toEqual(new Date(now));
});
it('revogação desativa somente a cópia agro',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:1})),repository=new AgroRepository({query});
    expect(await repository.syncAuthorization({...device,state:{}},{active:false},new Date(now))).toBeNull();
    expect(query.mock.calls[0][0]).toContain('UPDATE "AgroDevice"');expect(query.mock.calls[0][1]).toEqual(['','device','owner']);
});
