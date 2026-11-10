import { it,expect,vi } from 'vitest';
import { loader,response,history,now,weather } from './helpers/offline.js';
it('Blynk rejeita valores brutos antes de escrever no banco ou avisar',async()=>{
    const create=vi.fn(), axios={get:vi.fn().mockResolvedValueOnce({data:true}).mockResolvedValueOnce({data:'1023raw'})};
    const controller=loader({axios,'lib/prisma.js':{user:{findUnique:async()=>({id:'owner',blynkToken:'cipher'})},sensor:{create}}})('controllers/sensorController.js');
    const res=response();await controller.getLiveSystem({user:{id:'owner'}},res);expect(res.statusCode).toBe(503);expect(create).not.toHaveBeenCalled();
});
it.each(['',null,undefined,'20abc',-1,101,Infinity,{},[]])('parser Blynk rejeita %s',value=>{
    const parse=loader()('controllers/sensorController.js').parseSensorValue;expect(()=>parse(value)).toThrow();
});
it('Blynk preserva zero e aceita decimal completo',()=>{
    const parse=loader()('controllers/sensorController.js').parseSensorValue;expect(parse('0')).toBe(0);expect(parse(' 45.5 ')).toBe(45.5);
});
it('paginação inválida e consulta mensal malformada retornam 400',async()=>{
    const sensor=loader()('controllers/sensorController.js'), report=loader()('controllers/reportController.js');
    for(const query of [{limit:'100000'},{page:'-2'},{limit:'2.5'},{limit:'20abc'}]){const res=response();await sensor.getHistorico({user:{id:'owner'},query},res);expect(res.statusCode).toBe(400);}
    const res=response();await report.getMonthlyReport({user:{id:'owner'},query:{year:'2026',month:'99'}},res);expect(res.statusCode).toBe(400);
});
it('relatório não transforma clima parcial em total ou null em zero',()=>{
    const aggregate=loader()('controllers/reportController.js').aggregateClimate;
    const raw={daily:{time:['2026-09-01','2026-09-02'],precipitation_sum:[1,null],et0_fao_evapotranspiration:[2,3],temperature_2m_mean:[null,25]}};
    const result=aggregate(raw,'2026-09-01','2026-09-02');expect(result.rain).toBeNull();expect(result.eto).toBeNull();expect(result.rows[1].chuva).toBeNull();expect(result.covered).toBe(1);
});
it('clima falha e motor responde com diagnóstico determinístico e log aguardado',async()=>{
    const fixtures = history(30).map(r => ({...r,data:new Date(Date.now() - now + r.data.getTime())}));
    const events=[],db={user:{findUnique:vi.fn(async()=>({id:'owner',tipoPlantacao:'Milho',cidade:'Recife',lat:-8,lon:-35}))},sensor:{findMany:vi.fn(async()=>fixtures)},agroLog:{create:async()=>{await Promise.resolve();events.push('log');}}};
    const controller=loader({'lib/prisma.js':db,'services/weatherService.js':{fetchWeather:async()=>null},'services/satelliteService.js':{fetchSateliteData:async()=>null}})('controllers/agroController.js');
    const res=response();await controller.getClimaEDashboard({user:{id:'owner'},query:{}},res);events.push('response');
    expect(res.statusCode).toBe(200);expect(res.body.previsao.engineData.confidence.level).toBe('MEDIUM');expect(events).toEqual(['log','response']);expect(db.sensor.findMany.mock.calls[0][0].where.userId).toBe('owner');
});
it('snapshot ID não permite acessar resultado de outro usuário',async()=>{
    const keys=[],controller=loader({'lib/prisma.js':{user:{findUnique:async()=>({id:'owner'})}},'lib/cache.js':{read:async key=>{keys.push(key);throw Error('cache unavailable');}}})('controllers/agroController.js');
    const res=response();await controller.getInsightsIA({user:{id:'owner'},query:{snapshotId:'a'.repeat(64),userId:'victim'}},res);
    expect(keys).toEqual([`agro:snapshot:owner:${'a'.repeat(64)}`]);
});
it('cidade não configurada evita consultas meteorológicas',async()=>{
    const getJson=vi.fn();const weather=loader({'lib/httpJson.js':{getJson,validCoordinates:()=>true}})('services/weatherService.js');
    expect(await weather.fetchWeather({id:'u',lat:0,lon:0,cidade:''})).toBeNull();expect(getJson).not.toHaveBeenCalled();
});
it('sessão de usuário removido não autoriza requisição',async()=>{
    const next=vi.fn(),middleware=loader({'jsonwebtoken':{verify:()=>({user:{id:'deleted'},iat:1})},'lib/prisma.js':{user:{findUnique:async()=>null}}})('middleware/auth.js');
    const res=response();await middleware({cookies:{token:'synthetic'}},res,next);expect(res.statusCode).toBe(401);expect(next).not.toHaveBeenCalled();
});
it('token em cabeçalho não contorna cookie HttpOnly',async()=>{
    const middleware=loader()('middleware/auth.js'),res=response(),next=vi.fn();await middleware({header:()=> 'legacy-token'},res,next);expect(res.statusCode).toBe(401);expect(next).not.toHaveBeenCalled();
});
it('configuração preserva números e permite remover integrações não nulas',async()=>{
    const update=vi.fn(async({data})=>({id:'u',...data}));
    const controller=loader({'lib/prisma.js':{user:{findUnique:async()=>({id:'u',tipoPlantacao:'Milho',minIdeal:null,maxIdeal:null}),update}},'lib/httpJson.js':{getJson:async()=>[{lat:'-8.1',lon:'-34.8'}],validCoordinates:(a,b)=>Number.isFinite(a)&&Number.isFinite(b)}})('controllers/authController.js');
    const res=response();await controller.updateConfig({user:{id:'u'},body:{cidade:'Recife',estado:'PE',blynkToken:'',callmebotApiKey:''}},res);
    expect(res.statusCode).toBe(200);expect(update.mock.calls[0][0].data).toMatchObject({lat:-8.1,lon:-34.8,blynkToken:'',callmebotApiKey:''});expect(res.body.hasBlynkToken).toBe(false);expect(res.body.blynkToken).toBeUndefined();
});
it('cadastro exige cidade; configuração rejeita tamanho e fuso inválidos',()=>{
    const {registerSchema,updateSchema}=loader()('middleware/validation.js');
    expect(registerSchema.safeParse({nome:'Teste',email:'test@example.test',senha:'12345678'}).success).toBe(false);
    expect(updateSchema.safeParse({timeZone:'???'}).success).toBe(false);expect(updateSchema.safeParse({tamanhoFazenda:'Infinity'}).success).toBe(false);
    expect(updateSchema.safeParse({timeZone:'America/Recife',minIdeal:30,maxIdeal:70}).success).toBe(true);
});
it('fuso explícito cruza a meia-noite corretamente',()=>{
    const {localDate,timeZoneFor}=loader()('lib/time.js');expect(localDate('2026-10-10T01:00:00Z','America/Recife')).toBe('2026-10-09');expect(timeZoneFor({})).toBe('America/Sao_Paulo');expect(timeZoneFor({timeZone:'invalid-zone'})).toBe('America/Sao_Paulo');expect(timeZoneFor({timeZone:'America/Manaus'})).toBe('America/Manaus');expect(localDate('2026-10-10T01:00:00Z',timeZoneFor({}))).toBe('2026-10-09');
});
it('segredos ausentes ou padrões públicos impedem inicialização sem imprimir valores',()=>{
    const base={DATABASE_URL:'postgresql://dummy:dummy@localhost:5432/dummy',DIRECT_URL:'postgresql://dummy:dummy@localhost:5432/dummy',JWT_SECRET:'synthetic-jwt-secret-of-more-than-32-bytes',ENCRYPTION_KEY:'k'.repeat(32)};
    // undefined remove mock de env, permitindo validar somente dados sintéticos com dotenv stub.
    // A variante sem mock carrega o arquivo via nome equivalente.
    const parse=env=>loader({dotenv:{config:()=>{}}},env)('./lib/env.js');
    expect(()=>parse({})).toThrow('UNMOCKED_SIDE_EFFECT');
    expect(()=>parse({...base,JWT_SECRET:'default_secret_key_12345'})).toThrow();expect(()=>parse({...base,ENCRYPTION_KEY:'12345678901234567890123456789012'})).toThrow();
    expect(parse(base).JWT_SECRET).toBe(base.JWT_SECRET);
});
it('login entrega sessão somente por cookie, sem token no JSON',async()=>{
    const controller=loader({'jsonwebtoken':{sign:(payload,key,options,cb)=>cb(null,'synthetic-jwt')},'bcryptjs':{compare:async()=>true},'lib/prisma.js':{user:{findUnique:async()=>({id:'u',senha:'synthetic-hash',failedLoginAttempts:0,tipoPlantacao:'Milho'})}}})('controllers/authController.js');
    const res=response();res.cookie=vi.fn();await controller.login({body:{email:'fixture@example.test',senha:'fixture'}},res);
    expect(res.statusCode).toBe(200);expect(res.body.token).toBeUndefined();expect(res.cookie).toHaveBeenCalledWith('token','synthetic-jwt',expect.objectContaining({httpOnly:true,sameSite:'strict'}));
});
it('geocodificação incompleta não converte null em coordenada zero',async()=>{
    const update=vi.fn();const controller=loader({'lib/prisma.js':{user:{findUnique:async()=>({id:'u'}),update}},'lib/httpJson.js':{getJson:async()=>[{lat:null,lon:null}],validCoordinates:()=>true}})('controllers/authController.js');
    const res=response();await controller.updateConfig({user:{id:'u'},body:{cidade:'Recife',estado:'PE'}},res);expect(res.statusCode).toBe(400);expect(update).not.toHaveBeenCalled();
});
