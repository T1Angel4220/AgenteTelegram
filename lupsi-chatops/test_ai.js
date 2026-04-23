require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

async function testAI() {
    const relevantContext = fs.readFileSync('relevant_context.txt', 'utf-8');
    const hoyStr = '2026-04-23';
    
    const prompt = `Analiza este conocimiento (fragmentos de PDFs/TeX del proyecto):
        
        ${relevantContext}
        
        Tu tarea es extraer los metadatos del SPRINT ACTUAL del proyecto.
        FECHA DE HOY: ${hoyStr}
        
        REGLAS CRÍTICAS DE EXTRACCIÓN:
        1. Debes identificar en qué Sprint nos encontramos basándote en que la FECHA DE HOY (${hoyStr}) esté comprendida entre el inicio y fin de ese Sprint.
        2. NO INVENTES FECHAS. Si no encuentras una fecha exacta, revisa las tablas de cronograma (ej. "08/04 al 30/04" o fechas de tareas).
        3. El inicio del sprint es la fecha de inicio de la primera tarea, y el fin del sprint es la fecha de entrega final o cierre.
        4. NUNCA inventes periodos de 2 semanas al azar. Lee el documento.
        
        Responde ÚNICAMENTE con un JSON válido (sin Markdown, sin explicaciones):
        {
          "sprint_actual": "Nombre del sprint y tema",
          "fecha_inicio": "YYYY-MM-DD",
          "fecha_fin": "YYYY-MM-DD",
          "objetivo_principal": "Resumen del objetivo (máx 2 líneas)",
          "riesgos_conocidos": "Riesgos mencionados en la planificación"
        }`;

    const envKeys = process.env.OPENROUTER_API_KEY || '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'; // fallback just in case or use local env
    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'google/gemini-2.5-flash-preview',
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
        });
        
        console.log(response.data.choices[0].message.content);
    } catch (e) {
        console.error(e.message);
    }
}

testAI();
