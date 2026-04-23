const axios = require('axios');
require('dotenv').config();

async function testTrello() {
    const cardId = "69baa9aaa127c9b58f637501"; // Wait, I need the ID of the card.
    // The previous screenshot showed the ID of "Backend: Motor de Reservas" as 69baaa85f44a95ed69ff3819
    const targetCardId = "69baaa85f44a95ed69ff3819";
    
    try {
        const url = `https://api.trello.com/1/cards/${targetCardId}?dueComplete=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
        const res = await axios.put(url);
        console.log("Success:", res.status);
    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
}

testTrello();
