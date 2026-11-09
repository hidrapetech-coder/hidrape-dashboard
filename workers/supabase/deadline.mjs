import axios from 'axios';

// Prazo total da coleta e janela separada de limpeza/registro. Sem corrida abandonada.
export const createDeadlineResources = ({Pool,now=Date.now,workMs=90000,cleanupMs=10000}) => {
    const controller=new AbortController(),finishAt=now()+workMs+cleanupMs,clients=new Set();
    let closed=false;
    const closeClients=()=>{for(const client of [...clients])client.release(true);};
    controller.signal.addEventListener('abort',closeClients,{once:true});
    const workTimer=setTimeout(()=>controller.abort(),workMs);
    const finishTimer=setTimeout(()=>{closed=true;closeClients();},workMs+cleanupMs);
    const remaining=()=>{const value=finishAt-now();if(closed || value<=0)throw Error('AGRO_EDGE_DEADLINE');return Math.min(5000,value);};
    class DeadlinePool {
        constructor(options){this.pool=new Pool({...options,connectionTimeoutMillis:remaining(),query_timeout:5000,statement_timeout:5000});}
        on(...args){return this.pool.on(...args);}
        async connect(){
            remaining();const native=await this.pool.connect();let released=false;
            const client={query:(text,values=[])=>{
                if(released)throw Error('AGRO_EDGE_CONNECTION_CLOSED');
                return native.query({text,values,query_timeout:remaining()});
            },release:(destroy=false)=>{if(released)return;released=true;clients.delete(client);native.release(destroy);}};
            try {remaining();clients.add(client);return client;}
            catch(error){client.release(true);throw error;}
        }
        end(){return this.pool.end();}
    }
    const http=Object.fromEntries(['get','post'].map(method=>[method,(url,...args)=>{
        const options=method==='get'?(args[0]||{}):(args[1]||{});
        const joined=AbortSignal.any([controller.signal,options.signal].filter(Boolean));
        return method==='get'?axios.get(url,{...options,signal:joined}):axios.post(url,args[0],{...options,signal:joined});
    }]));
    const bounded=async operation=>{
        if(controller.signal.aborted)throw Error('AGRO_EDGE_DEADLINE');
        let abort;
        const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('AGRO_EDGE_DEADLINE'));controller.signal.addEventListener('abort',abort,{once:true});});
        try {return await Promise.race([operation(),cancelled]);}
        finally {controller.signal.removeEventListener('abort',abort);}
    };
    return {DeadlinePool,http,bounded,signal:controller.signal,shouldContinue:()=>!controller.signal.aborted,
        dispose:()=>{clearTimeout(workTimer);clearTimeout(finishTimer);controller.signal.removeEventListener('abort',closeClients);}};
};
