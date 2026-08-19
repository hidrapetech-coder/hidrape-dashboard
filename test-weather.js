const https = require('https');

const geolocate = (cidade, estado) => {
    return new Promise((resolve) => {
        // Structured search is much safer
        const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(estado)}&country=Brazil&format=json&limit=1`;

        https.get(url, { headers: { 'User-Agent': 'Hidrape-IoT-SaaS/1.0' } }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const data = JSON.parse(body);
                console.log('Geolocate result:', data);
                if (data && data.length > 0) resolve({ lat: data[0].lat, lon: data[0].lon });
                else resolve({ lat: '-23.5505', lon: '-46.6333' });
            });
        }).on('error', () => resolve({ lat: '-23.5505', lon: '-46.6333' }));
    });
};

const fetchOpenMeteo = (lat, lon) => {
    return new Promise((resolve, reject) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${parseFloat(lat)}&longitude=${parseFloat(lon)}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`;

        console.log('Fetching:', url);
        https.get(url, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
};

async function test() {
    const geo = await geolocate("Piracicaba", "SP");
    console.log("Coords:", geo);
    const clima = await fetchOpenMeteo(geo.lat, geo.lon);
    console.log("Clima:", clima);
}

test();
