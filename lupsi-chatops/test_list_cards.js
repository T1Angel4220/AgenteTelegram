const axios = require('axios');
require('dotenv').config();

async function listCards() {
    try {
        const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
        const res = await axios.get(url);
        res.data.forEach(c => console.log(c.id, c.name));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

listCards();
