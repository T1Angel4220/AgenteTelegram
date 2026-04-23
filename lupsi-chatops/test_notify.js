require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

function safe(text) {
    if (!text) return '';
    let t = text;
    if (t.length > 3900) {
      t = t.substring(0, 3900) + '\n\n_[Mensaje truncado]_';
    }
    t = t.replace(/(?<!\\)_/g, '\\_');
    const asteriskCount = (t.match(/\*/g) || []).length;
    if (asteriskCount % 2 !== 0) {
      t = t.replace(/\*/g, '\\*');
    }
    return t;
}

async function notifyMember(trelloName, text) {
    const equipoPath = path.join(process.cwd(), 'equipo.json');
    if (!fs.existsSync(equipoPath)) return false;
    const equipo = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));

    const nameLower = trelloName.toLowerCase();
    const member = equipo.find(m =>
      m.trelloName === trelloName ||
      m.trelloName.toLowerCase().includes(nameLower) ||
      nameLower.includes(m.trelloName.toLowerCase())
    );

    console.log(`[DEBUG] Buscando a '${trelloName}'... Match encontrado:`, member ? member.trelloName : 'Ninguno');

    if (!member) {
        console.log(`[DEBUG] No se encontró el miembro ${trelloName}`);
        return false;
    }
    try {
      console.log(`[DEBUG] Enviando mensaje a ${member.trelloName} al chatId ${member.chatId}...`);
      await bot.telegram.sendMessage(member.chatId, safe(text), { parse_mode: 'Markdown' });
      console.log(`[DEBUG] ¡Mensaje enviado con éxito a ${member.trelloName}!`);
      return true;
    } catch (e) {
      console.error(`[DEBUG] Error de Telegram al enviar a ${trelloName}:`, e.message);
      return false;
    }
}

async function test() {
    console.log("=== INICIANDO TEST CON DANIEL ===");
    await notifyMember("Daniel Alexander", "Prueba interna desde el script idéntico al bot.");
    console.log("=== TEST TERMINADO ===");
}

test();
