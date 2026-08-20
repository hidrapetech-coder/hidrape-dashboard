const { Client } = require('pg');

const regions = ['sa-east-1', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'];
const projectRef = 'ydlvhejbivcuwvcjxlsx';
const password = 'bjpcuiudos2424';

async function testConnection(region) {
    const connStr = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
    const client = new Client({ connectionString: connStr });
    try {
        await client.connect();
        console.log(`✅ Success with region: ${region}`);
        await client.end();
        return connStr;
    } catch (e) {
        console.log(`❌ Failed with region ${region}`);
        return null;
    }
}

async function run() {
    for (const region of regions) {
        const url = await testConnection(region);
        if (url) {
            console.log("Found URL:", url);
            process.exit(0);
        }
    }
    console.log("Could not guess the region.");
    process.exit(1);
}

run();
