require('dotenv').config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

async function test() {
    try {
        console.log("Intentando enviar a Daniel (8547569637)...");
        await bot.telegram.sendMessage('8547569637', "Mensaje de prueba de LUPSI");
        console.log("¡Éxito!");
    } catch (e) {
        console.error("Error exacto de Telegram:", e);
    }
}

test();
