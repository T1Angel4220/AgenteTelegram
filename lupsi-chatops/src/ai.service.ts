import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { DocsService } from './docs.service';

@Injectable()
export class AiService {
    constructor(
        private trello: TrelloService,
        private github: GithubService,
        private docs: DocsService
    ) { }

    async chatWithAgent(userMessage: string): Promise<string> {
        try {
            const trelloContext = await this.trello.getBoardState();
            const githubContext = await this.github.getLatestCommits();
            const knowledgeBase = await this.docs.getKnowledgeBase();

            // 1. Leemos el conocimiento estático (Fechas del sprint)
            const conocimientoPath = path.join(process.cwd(), 'conocimiento.json');
            const conocimientoRaw = fs.readFileSync(conocimientoPath, 'utf-8');
            const conocimiento = JSON.parse(conocimientoRaw);
            const hoy = new Date().toISOString().split('T')[0];

            // 2. Leemos la memoria histórica del equipo
            let historialContext = "No hay datos históricos previos aún.";
            const historialPath = path.join(process.cwd(), 'historial.txt');
            if (fs.existsSync(historialPath)) {
                const rawHistory = fs.readFileSync(historialPath, 'utf-8');
                historialContext = rawHistory.slice(-1500);
            }

            // 3. El Súper-Prompt Definitivo
            const prompt = `Eres el Project Manager IA del proyecto LUPSI. 
      
      === REGLAS DEL JUEGO ===
      Cierre del Sprint: ${conocimiento.fecha_fin} (HOY ES: ${hoy})
      Objetivo: ${conocimiento.objetivo_principal}

      === BASE DE CONOCIMIENTO COMPLETA (PDFs/LaTeX/Documentos) ===
      ${knowledgeBase}

      === ESTADO ACTUAL (TRELLO - DETALLADO) ===
      ${trelloContext}

      === ESTADO ACTUAL (GITHUB - RAMA DEVELOP) ===
      ${githubContext}

      === MEMORIA HISTÓRICA ===
      ${historialContext}
      
      === USUARIO ===
      "${userMessage}"
      
      INSTRUCCIONES CRÍTICAS: 
      1. Tienes acceso a TODA la documentación del proyecto. TU MISIÓN es extraer SOLAMENTE la respuesta específica a la duda del usuario.
      2. PROHIBIDO: No copies ni pegues párrafos largos de los documentos. No hagas un "volcado" de información.
      3. SÍNTESIS: Procesa lo que leíste y responde de forma ejecutiva (máximo 2-3 párrafos o una lista de puntos clave).
      4. Si preguntan por "puntos abiertos", "estatus" o "pendientes", busca en los documentos de seguimiento y extrae solo esos puntos.
      5. Sé analítico, profesional y muy directo. Si la respuesta no está en los documentos, dilo claramente.
      
      === REGLA DE ORO ===
      Puedes arrojar todo tu razonamiento paso a paso, pero AL FINAL, tu respuesta oficial en ESPAÑOL DEBE estar encerrada EXACTAMENTE en etiquetas <respuesta> y </respuesta>.
      Ejemplo:
      <respuesta>Esta es la síntesis de la respuesta en español.</respuesta>`;

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'openrouter/free',
                messages: [
                    { role: 'system', content: 'Eres el Agente de IA LUPSI, un Project Manager. Respondes SIEMPRE en Español, NUNCA en inglés.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 2000
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            let content = response.data.choices[0].message.content;
            
            // Extracción resiliente de la respuesta final
            const match = content.match(/<respuesta>([\s\S]*?)<\/respuesta>/i);
            if (match) {
                return match[1].trim();
            }
            
            return content.trim(); // Fallback si olvidó las etiquetas
        } catch (error) {
            console.error('Error en IA:', error?.response?.data || error.message);
            return '❌ Mi cerebro de IA está fuera de línea por ahora.';
        }
    }

    async analyzeAndDecideTasks(trelloTopology: string, githubWorkload: string): Promise<any> {
        try {
            const prompt = `Eres un Agente Autónomo (Project Manager). 
Debes analizar la siguiente topología de Trello (en JSON) y la carga de GitHub.

Topología Trello (IDs reales):
${trelloTopology}

Carga GitHub:
${githubWorkload}

TU MISIÓN:
Identifica problemas como tareas estancadas, personas sobrecargadas o tarjetas sin asgignar a punto de vencer.

REGLA ESTRICTA: Tu respuesta DEBE ser EXCLUSIVAMENTE un objeto JSON válido, sin delimitadores Markdown ni texto extra.
Formato requerido:
{
  "decisiones": [
    {
      "tipo": "MOVE_CARD",
      "cardId": "string",
      "targetListId": "string",
      "rationale": "Justificación corta en español para que el usuario entienda."
    },
    {
      "tipo": "REASSIGN_CARD",
      "cardId": "string",
      "memberId": "string",
      "rationale": "Justificación corta en español."
    }
  ]
}
Si no hay decisiones, devuelve {"decisiones": []}. Responde solo con JSON.

=== ÚLTIMA REGLA / FINAL RULE ===
ALL TEXT INSIDE "rationale" MUST BE IN SPANISH. NO INGLÉS. NO PENSAMIENTOS. SOLO JSON PURO.`;

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'openrouter/free',
                messages: [
                    { role: 'system', content: 'Eres un motor JSON. Responde siempe en Español.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 1500
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            let content = response.data.choices[0].message.content;
            
            // Extracción ultra-resiliente de JSON por si el modelo genera pensamientos antes de la llave.
            const startObj = content.indexOf('{');
            const endObj = content.lastIndexOf('}');
            if (startObj !== -1 && endObj !== -1) {
                content = content.substring(startObj, endObj + 1);
            }
            
            return JSON.parse(content);
        } catch (error) {
            console.error('Error en AI JSON:', error?.response?.data || error.message);
            return { decisiones: [] };
        }
    }
}