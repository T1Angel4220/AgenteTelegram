import { Injectable, forwardRef, Inject } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const SESIONES_PATH = path.join(process.cwd(), 'sesiones.json');
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { DocsService } from './docs.service';

@Injectable()
export class AiService {
    private sessionMemory: Map<string, Array<{role: string, content: string}>> = new Map();
    private keys: string[] = [];
    private models: string[] = [];
    private currentKeyIndex = 0;
    private currentModelIndex = 0;

    constructor(
        private trello: TrelloService,
        private github: GithubService,
        @Inject(forwardRef(() => DocsService))
        private docs: DocsService
    ) {
        const envKeys = process.env.AI_KEYS || process.env.OPENROUTER_API_KEY;
        this.keys = envKeys ? envKeys.split(',').map(k => k.trim()) : [];
        const envModels = process.env.AI_MODELS;
        this.models = envModels ? envModels.split(',').map(m => m.trim()) : ['openrouter/free'];
        this.loadSessions();
    }

    private loadSessions() {
        try {
            if (fs.existsSync(SESIONES_PATH)) {
                const raw = JSON.parse(fs.readFileSync(SESIONES_PATH, 'utf-8'));
                for (const [chatId, msgs] of Object.entries(raw)) {
                    this.sessionMemory.set(chatId, msgs as any[]);
                }
            }
        } catch (e) { }
    }

    private saveSessions() {
        try {
            const obj: any = {};
            this.sessionMemory.forEach((v, k) => { obj[k] = v.slice(-10); });
            fs.writeFileSync(SESIONES_PATH, JSON.stringify(obj));
        } catch (e) { }
    }

    private async postWithFailover(payload: { messages: any[], max_tokens: number }): Promise<any> {
        let lastError = null;
        let attempts = 0;
        for (let m = 0; m < this.models.length && attempts < 3; m++) {
            const model = this.models[(this.currentModelIndex + m) % this.models.length];
            for (let k = 0; k < this.keys.length && attempts < 3; k++) {
                const key = this.keys[(this.currentKeyIndex + k) % this.keys.length];
                attempts++;
                try {
                    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                        model: model, messages: payload.messages, max_tokens: payload.max_tokens
                    }, { headers: { 'Authorization': `Bearer ${key}` }, timeout: 45000 });
                    return response.data;
                } catch (error) { lastError = error; }
            }
        }
        throw lastError || new Error('IA Offline');
    }

    private getSuperPrompt(conocimiento: any, hoy: string, equipoContext: string, topology: string, githubContext: string, trelloContext: string, ragContext: string, masterKnowledge: string): string {
        return `ERES EL AGENTE AUTÓNOMO LUPSI. Identidad: Project Manager Activo del proyecto de agendamiento médico LUPSI de SKT Software Solution.
      
      ╔══════════════════════════════════════════════════╗
      ║   REGLAS ANTI-ALUCINACIÓN — MÁXIMA PRIORIDAD   ║
      ╚══════════════════════════════════════════════════╝
      ANTES DE RESPONDER, VERIFICA ESTOS HECHOS FIJOS (SON INAMOVIBLES):

      ► EQUIPO: Solo existen 4 personas. Sus nombres exactos son:
         1. Angel Ayuquina — Gestor del Proyecto (PM)
         2. Sebastián Ortiz — Desarrollador Backend
         3. Daniel Luisa — Desarrollador Fullstack
         4. Alex Guachi (también conocido como Huachi) — Desarrollador Frontend
         ¡PROHIBIDO inventar otros nombres de desarrolladores!

      ► STACK TECNOLÓGICO REAL (no inventes otros):
         Backend: NestJS | Frontend: Angular PWA | BD: Supabase (PostgreSQL+RLS)
         Auth: JWT + Módulo 10 | Storage: Cloudinary | Producción: Render
         Seguridad: RBAC + TLS 1.3 + AES-256 | Scrum: Trello + GitHub

      ► PRESUPUESTO Y FINANCIAMIENTO (datos verificados):
         - Valoración de mercado del sistema: $4,724.50 USD
         - Desembolso real inicial: $200 USD
         - Costo acumulado al cierre de Sprint 4: $4,690.40 USD
         - Costo total final al cierre de Sprint 5: $5,850.00 USD

      ► CRONOGRAMA REAL:
         Sprint 1 & 2: COMPLETADOS
         Sprint 3: 08/04/2026 → 30/04/2026 (EN CURSO)
         Sprint 4: 04/05/2026 → 27/05/2026 (PENDIENTE)
         Sprint 5: 28/05/2026 → 10/06/2026 (PENDIENTE)

      ► REGLA ANTI-ALUCINACIÓN ABSOLUTA:
         Si un dato NO está en los documentos, di: "No tengo ese dato en mi base de conocimiento".
         PROHIBIDO inventar nombres, fechas, costos o tecnologías.

      === REGLA DE ORO DE ACCIÓN ===
      1. SIEMPRE incluye la etiqueta <accion> para cualquier cambio o notificación.
      2. NUNCA digas "Hecho" si no incluyes el JSON en la misma respuesta.
      3. Usa EXCLUSIVAMENTE los IDs de la TOPOLOGÍA proporcionada abajo.
      4. Si el usuario pide notificar a varios, incluye múltiples etiquetas <accion>.

      === MANUAL DE HERRAMIENTAS ===
      - MOVE_CARD: {"cardId": "string", "listId": "string"}
      - CREATE_CARD: {"listId": "string", "name": "string", "desc": "string", "idMembers": "id1,id2"}
      - ADD_COMMENT: {"cardId": "string", "text": "string"}
      - NOTIFY_MEMBER: {"trelloNames": "Nombre1, Nombre2", "text": "string"}
      - MARK_CARD_COMPLETE: {"cardId": "string"}
      - GET_CARD_DETAILS: {"searchTerm": "nombre"}
      - AUTO_FIX_CODE: {"filePath": "ruta", "newContent": "código", "reason": "explicación"}

      === CONTEXTO DEL PROYECTO (FUENTE DE VERDAD) ===
      Sprint Actual: ${conocimiento.sprint_actual} | Hoy: ${hoy}
      Objetivo: ${conocimiento.objetivo_principal}
      KPIs Oficiales: ${JSON.stringify(conocimiento.kpis_oficiales || [])}
      
      === REGLA DE ESTADOS DE TAREAS (ESTRICTA) ===
      NUNCA confundas tareas "Pendientes" con "En proceso".
      - "Pendiente" (To Do): Tarea NO ha iniciado.
      - "En proceso" (Doing): Tarea se está trabajando activamente.
      ¡Diferencia claramente las listas de Trello!

      === REGLAS APRENDIDAS (ÓRDENES DEL PM) ===
      ${(conocimiento.reglas_aprendidas || []).map((r:any) => `- RECHAZASTE: ${r.accion_rechazada} MOTIVO: ${r.motivo}`).join('\n') || 'Ninguna regla aprendida aún.'}

      === REGLA DE ORO DE FUENTES (PROHIBIDO ALUCINAR) ===
      1. TAREAS URGENTES Y ESTADO ACTUAL: Usa exclusivamente el [CONTEXTO EN TIEMPO REAL] (Trello). Si una tarea tiene 🚨 o dice [URGENTE], priorízala.
      2. DATOS HISTÓRICOS, KPIs Y REGLAS: Usa la [FUENTE DE VERDAD MAESTRA] (PDFs/Base de Conocimiento). Aquí están los números oficiales para el Sprint 1 y 2.
      3. GITHUB: Úsalo para ver el esfuerzo real de commits.

      Si un dato no está en ninguna de estas fuentes, responde "No tengo esa información en mis registros". NUNCA INVENTES.
      
      === FUENTES DE INFORMACIÓN ===

      [FUENTE DE VERDAD MAESTRA - BASE DE CONOCIMIENTO]
      Prioriza SIEMPRE esta información sobre cualquier otra fuente:
      ${masterKnowledge}
      
      [CONTEXTO EN TIEMPO REAL - ESTADO ACTUAL DEL PROYECTO]
      Este es el estado del tablero Trello y GitHub AHORA MISMO. Úsalo para preguntas sobre "cómo vamos" o tareas actuales.
      ESTADO TRELLO ACTUAL: ${trelloContext.slice(0, 5000)}
      ESTADO GITHUB ACTUAL: ${githubContext.slice(0, 3000)}
      TOPOLOGÍA TÉCNICA (IDs): ${topology}
      
      [BASE DE CONOCIMIENTO - HISTÓRICO Y PLANIFICACIÓN (RAG)]
      Usa esta sección como fuente de verdad para PRECIOS, FECHAS DE SPRINT, KPI HISTÓRICOS, REQUISITOS Y SPRINT 1/2.
      Si la pregunta es sobre el SPRINT 1 o SPRINT 2, IGNORE el Trello actual y use estos documentos:
      DOCUMENTACIÓN EXTRAÍDA: ${ragContext}

      === FORMATO DE RESPUESTA ===
      1. Respuesta al usuario en <respuesta></respuesta>.
      2. Acciones técnicas en <accion></accion>.
      
      REGLA FINAL Y ABSOLUTA: 
      Si un usuario te pide un CÁLCULO (como un KPI) y no tienes los números exactos en la "DOCUMENTACIÓN EXTRAÍDA" o en "GITHUB ACTUAL/HISTÓRICO", responde exactamente así: 
      "No puedo realizar el cálculo exacto del KPI [nombre] porque no cuento con el dato de [dato faltante] en mi base de conocimientos." 
      ESTÁ TERMINANTEMENTE PROHIBIDO inventar números, porcentajes o decir "aquí tienes datos ficticios". Sé honesto sobre lo que sabes y lo que no.
      `;
    }

    async chatWithAgent(userMessage: string, chatId?: string): Promise<{ text: string, actions?: any[] }> {
        try {
            const conocimiento = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'conocimiento.json'), 'utf-8'));
            const hoy = new Date().toISOString().split('T')[0];

            // Detectar si pide información histórica de Sprints
            let since, until;
            if (/sprint\s*2/i.test(userMessage)) {
                since = `${conocimiento.cronograma.sprint2.inicio}T00:00:00Z`;
                until = `${conocimiento.cronograma.sprint2.fin}T23:59:59Z`;
            } else if (/sprint\s*1/i.test(userMessage)) {
                since = `${conocimiento.cronograma.sprint1.inicio}T00:00:00Z`;
                until = `${conocimiento.cronograma.sprint1.fin}T23:59:59Z`;
            }

            const [trelloContext, githubContext, topology, fullContext] = await Promise.all([
                this.trello.getBoardState(),
                this.github.getLatestCommits(since, until),
                this.trello.getBoardTopologyForAI(),
                this.docs.getRelevantContext(userMessage, 15)
            ]);

            let equipoContext = "Sin miembros.";
            if (fs.existsSync(path.join(process.cwd(), 'equipo.json'))) {
                equipoContext = fs.readFileSync(path.join(process.cwd(), 'equipo.json'), 'utf-8');
            }
            const trimmedContext = fullContext.slice(0, 20000);

            const masterKnowledge = fs.readFileSync(path.join(process.cwd(), 'conocimiento', 'base_conocimiento.md'), 'utf-8');

            const prompt = this.getSuperPrompt(conocimiento, hoy, equipoContext, topology, githubContext, trelloContext, trimmedContext, masterKnowledge);

            const activeChat = chatId || 'default';
            if (!this.sessionMemory.has(activeChat)) this.sessionMemory.set(activeChat, []);
            const memory = this.sessionMemory.get(activeChat)!;
            if (memory.length > 8) memory.splice(0, memory.length - 8);
            memory.push({ role: 'user', content: userMessage });

            const data = await this.postWithFailover({
                messages: [{ role: 'system', content: prompt }, ...memory],
                max_tokens: 2000
            });

            const content = data.choices[0]?.message?.content || '';
            const match = content.match(/<respuesta>([\s\S]*?)<\/respuesta>/i);
            let cleanText = match ? match[1].trim() : content.trim();
            cleanText = cleanText.replace(/<[^>]+>/g, '').trim();

            let actions: any[] = [];
            const matches = content.matchAll(/<accion>([\s\S]*?)<\/accion>/gi);
            for (const m of matches) {
                try {
                    const p = JSON.parse(m[1].trim());
                    if (p.name && p.arguments) { p.tool = p.name; p.args = p.arguments; }
                    if (p.tool) actions.push(p);
                } catch (e) { }
            }

            memory.push({ role: 'assistant', content: cleanText });
            this.saveSessions();
            return { text: cleanText, actions: actions.length > 0 ? actions : undefined };
        } catch (error) {
            return { text: '❌ Error en mi cerebro de IA.' };
        }
    }

    async analyzeAndDecideTasks(trelloTopology: string, githubWorkload: string): Promise<any> {
        try {
            const conocimiento = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'conocimiento.json'), 'utf-8'));
            const reglasText = (conocimiento.reglas_aprendidas || []).map((r:any) => `- ${r.accion_rechazada}: ${r.motivo}`).join('\n');
            const prompt = `Analiza Trello (${trelloTopology}) y GitHub (${githubWorkload}). Reglas: ${reglasText}. Responde solo JSON: {"decisiones": []}`;
            const data = await this.postWithFailover({
                messages: [{ role: 'system', content: 'Motor JSON' }, { role: 'user', content: prompt }],
                max_tokens: 1000
            });
            let content = data.choices[0].message.content;
            const startObj = content.indexOf('{');
            const endObj = content.lastIndexOf('}');
            if (startObj !== -1 && endObj !== -1) content = content.substring(startObj, endObj + 1);
            return JSON.parse(content);
        } catch (error) { return { decisiones: [] }; }
    }
}