const axios = require('axios');
require('dotenv').config();

async function testTrello() {
    const targetCardId = "69baaa85f44a95ed69ff3819";
    
    try {
        const url = `https://api.trello.com/1/cards/${targetCardId}?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
        const res = await axios.get(url);
        console.log("Card name:", res.data.name);
        console.log("Due:", res.data.due);
        console.log("DueComplete:", res.data.dueComplete);
    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
}

testTrello();
