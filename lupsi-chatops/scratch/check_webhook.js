const axios = require('axios');

async function checkWebhook() {
  const token = '8650053468:AAHGSsSmugCTKHHR71yLBz1NLny8X4XWKu4';
  const url = `https://api.telegram.org/bot${token}/getWebhookInfo`;
  try {
    const res = await axios.get(url);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err.message);
  }
}

checkWebhook();
