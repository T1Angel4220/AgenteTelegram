import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { DocsService } from './docs.service';

@Injectable()
export class AiService {
    private sessionMemory: Map<string, Array<{role: string, content: string}>> = new Map();

    constructor(
        private trello: TrelloService,
        private github: GithubService,
        private docs: DocsService
    ) { }

    async chatWithAgent(userMessage: string, chatId?: string): Promise<{ text: string, action?: any }> {
        try {
            const trelloContext = await this.trello.getBoardState();
            const githubContext = await this.github.getLatestCommits();
            const knowledgeBase = await this.docs.getKnowledgeBase();
            const topology = await this.trello.getBoardTopologyForAI();

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

            // 3. El Súper-Prompt Definitivo (Restructurado para Rigidez)
            const prompt = `ERES EL AGENTE AUTÓNOMO LUPSI. Identidad: Project Manager Activo.
      
      === REGLA DE ORO DE ACCIÓN ===
      1. NO eres un tutor. NO des comandos de terminal (CLI) ni expliques cómo hacer las cosas.
      2. Si el usuario pide una acción, TU DEBER es ejecutar la herramienta mediante la etiqueta <accion>.
      3. Si faltan datos para una tarjeta, PREGUNTA. No inventes datos.
      4. Usa EXCLUSIVAMENTE los IDs de la TOPOLOGÍA proporcionada abajo.

      === MANUAL DE HERRAMIENTAS (OBLIGATORIO) ===
      Para actuar, escribe: <accion>{"tool": "NOMBRE", "args": {...}}</accion>
      Herramientas disponibles:
      - MOVE_CARD: {"cardId": "string", "listId": "string"}
      - CREATE_CARD: {"listId": "string", "name": "string", "desc": "string", "idMembers": "id1,id2", "idLabels": "id1,id2", "due": "ISO_DATE", "start": "ISO_DATE"}
      - ADD_COMMENT: {"cardId": "string", "text": "string"}
      - CREATE_ISSUE: {"title": "string", "body": "string"}
      - ASSIGN_USER: {"cardId": "string", "memberId": "string"}

      === EJEMPLO DE RESPUESTA CORRECTA ===
      Usuario: "Crea un issue de bug"
      Respuesta: "<respuesta>Con gusto, voy a preparar el reporte de error en GitHub.</respuesta> <accion>{\"tool\": \"CREATE_ISSUE\", \"args\": {\"title\": \"Bug reportado\", \"body\": \"...\"}}</accion>"

      === CONTEXTO DEL PROYECTO ===
      Fecha Fin Sprint: ${conocimiento.fecha_fin} | Hoy: ${hoy}
      Objetivo: ${conocimiento.objetivo_principal}
      
      TOPOLOGÍA TÉCNICA (USA ESTOS IDs):
      ${topology}
      
      ESTADO ACTUAL (GITHUB):
      ${githubContext}
      
      ESTADO TRELLO:
      ${trelloContext}
      
      DOCUMENTACIÓN (BASE DE CONOCIMIENTO):
      ${knowledgeBase}

      REGLA DE FORMATO FINAL: 
      La respuesta legible al usuario DEBE ir en <respuesta></respuesta> en ESPAÑOL.
      La acción técnica (opcional) DEBE ir en <accion></accion> como JSON.`;

            const activeChat = chatId || 'default';
            if (!this.sessionMemory.has(activeChat)) {
                this.sessionMemory.set(activeChat, []);
            }
            const memory = this.sessionMemory.get(activeChat) || [];
            
            memory.push({ role: 'user', content: userMessage });
            if (memory.length > 20) memory.splice(0, memory.length - 20);

            const messages = [
                { role: 'system', content: prompt },
                ...memory
            ];

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'openrouter/free',
                messages: messages,
                max_tokens: 2000
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data.choices[0]?.message?.content;
            if (!content) {
                return { text: '❌ La IA no devolvió ninguna respuesta (vacío). Intenta de nuevo.' };
            }
            
            // Extracción resiliente de la respuesta final
            const match = content.match(/<respuesta>([\s\S]*?)<\/respuesta>/i);
            const cleanText = match ? match[1].trim() : content.trim();

            // Extracción de acciones JSON
            let action = null;
            const actionMatch = content.match(/<accion>([\s\S]*?)<\/accion>/i);
            if (actionMatch) {
                try {
                    action = JSON.parse(actionMatch[1].trim());
                } catch (e) {
                    console.error('Error al parsear JSON de acción:', e.message);
                }
            }
            
            memory.push({ role: 'assistant', content: cleanText });
            
            return { text: cleanText, action };
        } catch (error) {
            console.error('Error en IA:', error?.response?.data || error.message);
            return { text: '❌ Mi cerebro de IA está fuera de línea por ahora.' };
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