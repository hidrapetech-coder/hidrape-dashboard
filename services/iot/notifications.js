const axios = require('axios');
const sendWhatsApp = async (secrets,decision) => {
    const params=new URLSearchParams({phone:secrets.whatsappPhone,apikey:secrets.callmebotApiKey,text:`HIDRAPE: ${decision.explanation.join(' ')}`});
    await axios.get(`https://api.callmebot.com/whatsapp.php?${params}`,{timeout:4000,maxRedirects:0,maxContentLength:65536});
};
module.exports={sendWhatsApp};
