import { Injectable, forwardRef, Inject } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const SESIONES_PATH = path.join(process.cwd(), 'sesiones.json');
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { DocsService } from './docs.service';
import { SupabaseService } from './supabase.service';

@Injectable()
export class AiService {
    private sessionMemory: Map<string, Array<{role: string, content: string}>> = new Map();
    private keys: string[] = [];
    private models: string[] = [];
    private currentKeyIndex = 0;
    private currentModelIndex = 0;

    // Cache para evitar cuellos de botella y "colgadas"
    private cache: Map<string, { data: any, timestamp: number }> = new Map();
    private readonly CACHE_TTL = 1000 * 60 * 5; // 5 minutos

    constructor(
        private trello: TrelloService,
        private github: GithubService,
        @Inject(forwardRef(() => DocsService))
        private docs: DocsService,
        private supabase: SupabaseService
    ) {
        const envKeys = process.env.AI_KEYS || process.env.OPENROUTER_API_KEY;
        this.keys = envKeys ? envKeys.split(',').map(k => k.trim()) : [];
        const envModels = process.env.AI_MODELS;
        this.models = envModels ? envModels.split(',').map(m => m.trim()) : ['openrouter/free'];
        this.loadSessions();
    }

    private async loadSessions() {
        try {
            // 1. Intentar cargar desde Supabase (Prioridad)
            const remoteSessions = await this.supabase.getAllSessions();
            if (Object.keys(remoteSessions).length > 0) {
                for (const [chatId, msgs] of Object.entries(remoteSessions)) {
                    this.sessionMemory.set(chatId, msgs);
                }
                console.log(`🧠 Memoria cargada desde Supabase (${Object.keys(remoteSessions).length} sesiones).`);
                return;
            }

            // 2. Fallback a archivo local
            if (fs.existsSync(SESIONES_PATH)) {
                const raw = JSON.parse(fs.readFileSync(SESIONES_PATH, 'utf-8'));
                for (const [chatId, msgs] of Object.entries(raw)) {
                    this.sessionMemory.set(chatId, msgs as any[]);
                }
            }
        } catch (e) { }
    }

    private async saveSessions(chatId?: string) {
        try {
            // 1. Guardar en Supabase (si se provee chatId)
            if (chatId) {
                const memory = this.sessionMemory.get(chatId);
                if (memory) await this.supabase.saveSession(chatId, memory);
            }

            // 2. Mantener archivo local por seguridad
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

    private getSuperPrompt(conocimiento: any, hoy: string, equipoContext: string, topology: string, githubContext: string, trelloContext: string, ragContext: string, masterKnowledge: string, manual: string): string {
        return `ERES LUPSI, AGENTE AUTÓNOMO DE SKT SOFTWARE SOLUTION.
      Identidad: Senior Project Manager del sistema de agendamiento médico LUPSI.
      
      ╔══════════════════════════════════════════════════╗
      ║   MANUAL DE COMPORTAMIENTO Y ESTILO            ║
      ╚══════════════════════════════════════════════════╝
      ${manual}

      ╔══════════════════════════════════════════════════╗
      ║   PROTOCOLO DE PENSAMIENTO (RAZONAMIENTO)      ║
      ╚══════════════════════════════════════════════════╝
      Antes de generar la respuesta final, realiza internamente estos pasos:
      1. ANALIZAR: ¿Qué busca el usuario?
      2. VERIFICAR: ¿Qué dice TRELLO sobre responsables y estado? ¿Qué dice el PDF/JSON?
      3. RESOLVER CONFLICTO: Trello es TIEMPO REAL. Si el PDF dice que "Daniel" es el responsable pero Trello dice que es "Angel", responde que es "Angel". Ignora la planificación antigua ante cambios en Trello.
      4. SINTETIZAR: Responde con veracidad total basada en el PRESENTE.

      === JERARQUÍA DE VERDAD ABSOLUTA ===
      1. ASIGNACIONES (Quién hace qué): EXCLUSIVAMENTE lo que diga el bloque [ESTADO TRELLO]. La sección "entregables" de los documentos es PLANIFICACIÓN INICIAL y puede estar obsoleta.
      2. ESTADOS (Doing/Done): EXCLUSIVAMENTE lo que diga el bloque [ESTADO TRELLO].
      3. HALLUCINATION CHECK: NO inventes IDs como "T-01". Usa los nombres de las tareas tal cual aparecen en Trello. NO digas que no tienes acceso en tiempo real; el bloque de abajo se actualizó hace milisegundos.

      ╔══════════════════════════════════════════════════╗
      ║   REGLAS ANTI-ALUCINACIÓN (CERO TOLERANCIA)    ║
      ╚══════════════════════════════════════════════════╝
      ► FECHA ACTUAL: ${hoy}
      ► EQUIPO: Angel Ayuquina (PM), Sebastián Ortiz (Backend), Daniel Luisa (Fullstack), Alex Guachi (Frontend).
      ► RESPONSABLES: Si en Trello la tarea "Portal del Paciente" tiene asignado a "Angel", ese es el responsable actual. Punto.

      === MANUAL DE ACCIÓN (ETIQUETAS) ===
      - SIEMPRE usa <respuesta>texto</respuesta> para hablar con el usuario.
      - Usa <accion>{"tool": "NOMBRE", "args": {}}</accion> para ejecutar herramientas.
      - Herramientas: NOTIFY_TEAM, NOTIFY_MEMBER, MOVE_CARD, CREATE_CARD, ADD_COMMENT, GET_CARD_DETAILS.
      - IMPORTANTE: SÍ tienes capacidad de enviar notificaciones. No digas "no puedo". Si te piden notificar al equipo, usa NOTIFY_TEAM. Si es a alguien específico, usa NOTIFY_MEMBER.

      === CONTEXTO DEL PROYECTO (FUENTES DE VERDAD) ===
      Sprint Actual: ${conocimiento.sprint_actual}
      
      [BASE DE CONOCIMIENTO MAESTRA]
      ${masterKnowledge}
      
      [ESTADO EN TIEMPO REAL (TRELLO/GITHUB)]
      ESTADO TRELLO: ${trelloContext.slice(0, 4500)}
      ESTADO GITHUB: ${githubContext.slice(0, 2000)}
      
      [DOCUMENTACIÓN ESPECÍFICA (RAG - PLANIFICACIÓN)]
      ${ragContext}
      
      [TOPOLOGÍA TÉCNICA (IDs)]
      ${topology}

      REGLA DE ORO: Prioriza la realidad de Trello sobre la teoría de los documentos.`;
    }

    async chatWithAgent(userMessage: string, chatId?: string): Promise<{ text: string, actions?: any[] }> {
        try {
            const conocimiento = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'conocimiento.json'), 'utf-8'));
            const hoy = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });

            // Detectar si pide información histórica de Sprints
            let since, until;
            if (/sprint\s*2/i.test(userMessage)) {
                since = `${conocimiento.cronograma.sprint2.inicio}T00:00:00Z`;
                until = `${conocimiento.cronograma.sprint2.fin}T23:59:59Z`;
            } else if (/sprint\s*1/i.test(userMessage)) {
                since = `${conocimiento.cronograma.sprint1.inicio}T00:00:00Z`;
                until = `${conocimiento.cronograma.sprint1.fin}T23:59:59Z`;
            }

            // Uso de cache para evitar "colgadas"
            const cacheKey = `context_${since || 'now'}_${until || 'now'}`;
            const cachedData = this.cache.get(cacheKey);
            let trelloContext, githubContext, topology, fullContext;

            if (cachedData && (Date.now() - cachedData.timestamp < this.CACHE_TTL)) {
                ({ trelloContext, githubContext, topology, fullContext } = cachedData.data);
            } else {
                [trelloContext, githubContext, topology, fullContext] = await Promise.all([
                    this.trello.getBoardState(),
                    this.github.getLatestCommits(since, until),
                    this.trello.getBoardTopologyForAI(),
                    this.docs.getRelevantContext(userMessage, 10) // Reducido de 15 a 10 para mayor precisión
                ]);
                this.cache.set(cacheKey, { 
                    data: { trelloContext, githubContext, topology, fullContext }, 
                    timestamp: Date.now() 
                });
            }

            let equipoContext = "Sin miembros.";
            if (fs.existsSync(path.join(process.cwd(), 'equipo.json'))) {
                equipoContext = fs.readFileSync(path.join(process.cwd(), 'equipo.json'), 'utf-8');
            }
            const trimmedContext = fullContext.slice(0, 20000);

            const masterKnowledge = fs.readFileSync(path.join(process.cwd(), 'conocimiento', 'base_conocimiento.md'), 'utf-8');
            const manualComportamiento = fs.readFileSync(path.join(process.cwd(), 'conocimiento', 'manual_comportamiento.md'), 'utf-8');

            const prompt = this.getSuperPrompt(conocimiento, hoy, equipoContext, topology, githubContext, trelloContext, trimmedContext, masterKnowledge, manualComportamiento);

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
            await this.saveSessions(activeChat);
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