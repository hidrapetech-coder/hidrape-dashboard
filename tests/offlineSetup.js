import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const denied = () => { throw new Error('NETWORK_DISABLED_IN_TESTS'); };
// Guard global: nenhum teste pode abrir socket ou usar fetch real, mesmo por engano.
for (const module of ['node:http','node:https']) {
    require(module).request = denied; require(module).get = denied;
}
require('node:net').Socket.prototype.connect = denied;
require('node:tls').connect = denied;
globalThis.fetch = denied;
