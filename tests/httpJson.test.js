import { it,expect,vi,afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { loader } from './helpers/offline.js';
const fixture=(status,chunks,never=false)=>{
    const request=new EventEmitter();request.destroy=vi.fn();const response=new EventEmitter();response.statusCode=status;response.resume=vi.fn();
    const client={get:(url,options,callback)=>{queueMicrotask(()=>{callback(response);if(!never){for(const chunk of chunks)response.emit('data',chunk);response.emit('end');}});return request;}};
    const service=loader({'node:https':client})('lib/httpJson.js');return {request,response,service};
};
afterEach(()=>vi.useRealTimers());
it('HTTP 429 e JSON inválido são falhas de fonte',async()=>{
    await expect(fixture(429,['{}']).service.getJson('https://fixture.test')).rejects.toThrow('EXTERNAL_HTTP_ERROR');
    await expect(fixture(200,['broken']).service.getJson('https://fixture.test')).rejects.toThrow('EXTERNAL_INVALID_JSON');
});
it('limita corpo e destrói transporte',async()=>{
    const {service,request}=fixture(200,['x'.repeat(20)]);await expect(service.getJson('https://fixture.test',{maxBytes:10})).rejects.toThrow('EXTERNAL_BODY_LIMIT');expect(request.destroy).toHaveBeenCalled();
});
it('prazo total cancela resposta que nunca termina',async()=>{
    vi.useFakeTimers();const {service,request}=fixture(200,[],true);const pending=service.getJson('https://fixture.test',{timeout:100});const assertion=expect(pending).rejects.toThrow('EXTERNAL_TIMEOUT');await vi.advanceTimersByTimeAsync(101);await assertion;expect(request.destroy).toHaveBeenCalled();
});
