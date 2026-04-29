const axios = require('axios');
async function run() {
  const res = await axios.get('https://openrouter.ai/api/v1/models');
  const freeModels = res.data.data.filter(m => m.pricing.prompt === "0" && m.pricing.completion === "0");
  console.log(freeModels.map(m => m.id).join('\n'));
}
run();
