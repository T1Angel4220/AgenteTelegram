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

    // Keys que agotaron su cuota diaria de OpenRouter — se omiten automáticamente
    // Se limpian a medianoche UTC (cuando OpenRouter resetea la cuota)
    private exhaustedKeys: Map<string, number> = new Map(); // key -> timestamp de cuándo se agotó
    private readonly QUOTA_RESET_HOUR_UTC = 0; // Medianoche UTC

    // Cache para evitar cuellos de botella y "colgadas"
    private cache: Map<string, { data: any, timestamp: number }> = new Map();
    private readonly CACHE_TTL = 0; // Cache deshabilitada para depuración y máxima precisión real-time

    private nvidiaKey: string = '';
    private nvidiaModels: string[] = [];

    constructor(
        private trello: TrelloService,
        private github: GithubService,
        @Inject(forwardRef(() => DocsService))
        private docs: DocsService,
        private supabase: SupabaseService
    ) {
        // Cargar NVIDIA (Primario)
        this.nvidiaKey = process.env.NVIDIA_API_KEY || '';
        const nvidiaEnvModels = process.env.NVIDIA_MODELS;
        // Solo modelos verificados como funcionales con esta key (probados el 01/05/2026)
        this.nvidiaModels = nvidiaEnvModels ? nvidiaEnvModels.split(',').map(m => m.trim()) : [
            'nvidia/llama-3.3-nemotron-super-49b-v1',  // ✅ Potente, rápido
            'meta/llama-3.3-70b-instruct',             // ✅ Robusto
            'qwen/qwen3-next-80b-a3b-instruct',        // ✅ Muy capaz
            'nvidia/llama-3.1-nemotron-nano-8b-v1',   // ✅ Ligero, fallback rápido
        ];

        // Cargar OpenRouter (Fallback con Saldo Pagado)
        const envKeys = process.env.AI_KEYS || process.env.OPENROUTER_API_KEY;
        this.keys = envKeys ? envKeys.split(',').map(k => k.trim()) : [];
        this.models = [
            'anthropic/claude-3.5-sonnet',  // ✅ Claude 3.5 Sonnet (Pagado - Máxima obediencia a reglas de formato)
            'deepseek/deepseek-chat',       // ✅ DeepSeek V3 (Pagado - Fallback secundario)
            'google/gemma-3-12b-it:free',
            'google/gemma-4-31b-it:free'
        ];

        console.log(`🚀 AI Inicializada: NVIDIA (${this.nvidiaModels.length} modelos) + OpenRouter (${this.keys.length} llaves).`);
        
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

    /**
     * Verifica si una key agotó su cuota diaria y ya fue reseteada por OpenRouter (medianoche UTC).
     * Si ya pasó la medianoche desde que se agotó, la libera automáticamente.
     */
    private isKeyExhausted(key: string): boolean {
        const exhaustedAt = this.exhaustedKeys.get(key);
        if (!exhaustedAt) return false;

        const now = new Date();
        const exhaustedDate = new Date(exhaustedAt);

        // Calcular la próxima medianoche UTC después de que se agotó la key
        const nextMidnightUTC = new Date(Date.UTC(
            exhaustedDate.getUTCFullYear(),
            exhaustedDate.getUTCMonth(),
            exhaustedDate.getUTCDate() + 1, // siguiente día
            0, 0, 0, 0  // medianoche exacta UTC
        ));

        if (now >= nextMidnightUTC) {
            // La cuota se resetea — liberar la key automáticamente
            this.exhaustedKeys.delete(key);
            const keyPreview = key.slice(-8);
            console.log(`🔓 Key [...${keyPreview}] liberada: nueva cuota diaria disponible.`);
            return false;
        }

        return true; // Sigue agotada
    }

    private async postWithFailover(payload: { messages: any[], max_tokens: number }): Promise<any> {
        let lastError = null;

        const totalKeys = this.keys.length;
        const totalModels = this.models.length;

        // --- FASE 1: OpenRouter PAID (Prioridad Absoluta) ---
        // Intentamos el modelo pagado con todas las llaves disponibles primero
        const primaryModel = 'openai/gpt-4o';
        for (let k = 0; k < totalKeys; k++) {
            const keyIdx = (this.currentKeyIndex + k) % totalKeys;
            const key = this.keys[keyIdx];
            
            // Si tiene saldo, no debería estar agotada, pero verificamos por si acaso
            if (this.isKeyExhausted(key)) continue;

            try {
                console.log(`🔄 [PRIORIDAD] Intentando ${primaryModel} key[${keyIdx + 1}/${totalKeys}]...`);
                const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: primaryModel,
                    messages: payload.messages,
                    max_tokens: payload.max_tokens
                }, {
                    headers: { 'Authorization': `Bearer ${key}` },
                    timeout: 45000
                });

                this.currentKeyIndex = (keyIdx + 1) % totalKeys;
                console.log(`✅ [EXITO] Respuesta de ${primaryModel} (Pagado)`);
                return response.data;
            } catch (error) {
                lastError = error;
                const errMsg = error.response?.data?.error?.message || error.message;
                const statusCode = error.response?.status;
                console.warn(`⚠️  [Fallo Prioridad] ${primaryModel} key[${keyIdx + 1}] (${statusCode}): ${errMsg?.slice(0, 60)}`);
                
                if (statusCode === 429 && errMsg?.includes('free-models-per-day')) {
                    this.exhaustedKeys.set(key, Date.now());
                } else if (statusCode === 429) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        // --- FASE 2: NVIDIA (Respaldo Premium Gratuito) ---
        if (this.nvidiaKey) {
            console.log('🔄 [NVIDIA] Iniciando respaldo de alta potencia...');
            for (const model of this.nvidiaModels) {
                try {
                    console.log(`🔄 [NVIDIA] Intentando modelo=${model}...`);
                    const response = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
                        model: model,
                        messages: payload.messages,
                        max_tokens: payload.max_tokens,
                        temperature: 0.5,
                        top_p: 1,
                        stream: false
                    }, {
                        headers: { 'Authorization': `Bearer ${this.nvidiaKey}` },
                        timeout: 60000
                    });
                    console.log(`✅ [NVIDIA] Respuesta de: ${model}`);
                    return response.data;
                } catch (error) {
                    lastError = error;
                    const errMsg = error.response?.data?.error?.message || error.message;
                    console.warn(`⚠️  [NVIDIA] Falló ${model}: ${errMsg?.slice(0, 80)}`);
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }

        // --- FASE 3: OpenRouter Fallbacks (Último recurso) ---
        console.log('🔄 [Fallback Final] Probando modelos gratuitos de OpenRouter...');
        for (let m = 0; m < totalModels; m++) {
            const model = this.models[m];
            if (model === primaryModel) continue; // Ya lo probamos al inicio

            for (let k = 0; k < totalKeys; k++) {
                const keyIdx = (this.currentKeyIndex + k) % totalKeys;
                const key = this.keys[keyIdx];
                if (this.isKeyExhausted(key)) continue;

                try {
                    console.log(`🔄 [Fallback] Intentando ${model} key[${keyIdx + 1}]`);
                    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                        model: model,
                        messages: payload.messages,
                        max_tokens: payload.max_tokens
                    }, {
                        headers: { 'Authorization': `Bearer ${key}` },
                        timeout: 45000
                    });
                    return response.data;
                } catch (error) {
                    lastError = error;
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }


        console.error('🚨 Todos los modelos y llaves fallaron.');
        throw lastError || new Error('IA Offline');
    }

    private getSuperPrompt(conocimiento: any, hoy: string, equipoContext: string, topology: string, githubContext: string, trelloContext: string, ragContext: string, masterKnowledge: string, manual: string, userName?: string): string {
        return `ERES LUPSI, AGENTE AUTÓNOMO DE SKT SOFTWARE SOLUTION.
Identidad: Senior Project Manager del sistema de agendamiento médico LUPSI. Tono profesional, claro, proactivo y analítico.

═══════════════════════════════════════
 [ESTADO TRELLO - TIEMPO REAL]
═══════════════════════════════════════
${trelloContext}

[TOPOLOGÍA TÉCNICA]
${topology}

[ACTIVIDAD GITHUB]
${githubContext}

═══════════════════════════════════════
 REGLAS DE ORO (MÁXIMA PRIORIDAD)
═══════════════════════════════════════
1. TRELLO ES LA ÚNICA VERDAD PARA EL PROGRESO:
   - PROHIBIDO inventar porcentajes basados en la documentación estática (RAG). 
   - SIEMPRE calcula el progreso basándote en la cantidad de tareas completadas vs pendientes del bloque [ESTADO TRELLO].
   - Muestra el conteo real (ej. "2 de 5 tareas completadas") junto a cualquier porcentaje.
   - AL REPORTAR INACTIVIDAD: Lee el campo "INACTIVIDAD" de la tarea. SIEMPRE indica el rango de fechas exacto (ej. "desde el 10/05/2026 hasta hoy") y el número de días transcurridos. NUNCA digas solo "lleva días sin actividad".
2. FLUJO OBLIGATORIO DE ACCIÓN:
   - NUNCA digas "He enviado" o "He notificado". SIEMPRE usa <accion>.
3. PROHIBICIÓN DE TABLAS Y IDs EN LA RESPUESTA AL USUARIO:
   - PROHIBIDO usar | o --- para tablas. Usa listas con guiones (-).
   - PROHIBIDO mostrar IDs técnicos de 24 caracteres en el texto de tu respuesta. (PERO SÍ DEBES usarlos internamente dentro de las etiquetas <accion> cuando llames a una herramienta).
4. EXHAUSTIVIDAD EN LISTAS Y CONCISIÓN EN EXPLICACIONES:
   - Si el usuario pide listar tareas (ej. "prioridad media"), DEBES listar TODAS las que existan en el tablero sin omitir ninguna, incluso si son muchas.
   - Para explicaciones generales, mantén la respuesta concisa (máximo 2 párrafos). Cero emojis.
5. OBEDIENCIA ABSOLUTA A ÓRDENES DIRECTAS:
   - Si el usuario te ordena explícitamente mover una tarjeta, asignar un usuario, crear algo o notificar, DEBES OBEDECER INMEDIATAMENTE usando la etiqueta <accion>. NO cuestiones la lógica del proyecto, el estado o las fases. La orden del usuario es absoluta.
6. GESTIÓN DE ENTREGABLES Y ADJUNTOS:
   - Si el usuario menciona un archivo, entregable o adjunto en Trello, DEBES usar GET_CARD_DETAILS para obtener su URL.
   - Si detectas un entregable finalizado en Trello (tarjeta en Done con adjunto), sugiere usar SAVE_DELIVERABLE para guardarlo en la base de conocimiento.
   - La base de conocimiento está organizada por FASES y TAREAS (ej: "conocimiento/Fase 1.../Nombre Tarea - Responsable/").
   - Todos los entregables guardados se indexan automáticamente para consultas futuras vía RAG.
7. RETRASOS Y TAREAS VENCIDAS (MÁXIMA PRIORIDAD ABSOLUTA):
   - Si el bloque [ESTADO TRELLO] contiene "!!ALERTAS CRITICAS!!" o "!!VENCIDA!!", DEBES mencionarlo EN PRIMER LUGAR en tu respuesta, ANTES de cualquier otro resumen.
   - NUNCA ocultes un retraso bajo un reporte genérico positivo. El PM NECESITA saber esto.
   - Para cada tarea vencida indica: nombre, responsable, días de retraso, y propón una de estas acciones: notificar al responsable (NOTIFY_MEMBER), comentar en la tarjeta (ADD_COMMENT) o crear un issue en GitHub (CREATE_ISSUE).
   - Ejemplo de respuesta CORRECTA: "ALERTA: La tarea X lleva N días de retraso (venció el DD/MM). Responsable: Y. ¿Quieres que le notifique ahora?"
8. MÉTRICAS PREDICTIVAS Y EVM (Earned Value Management):
   - Cuando el usuario pida un reporte general o estado del proyecto, DEBES incluir siempre el diagnóstico del bloque [ANÁLISIS PREDICTIVO EVM].
   - Explica el valor del SPI (Schedule Performance Index) como todo un Senior Project Manager: si es menor a 1.0, advierte sobre el retraso real y sugiere reasignar cargas; si es 1.0 o mayor, confirma el buen ritmo.

EJEMPLO DE RESPUESTA CORRECTA:
**Avance de Fase 5**
- Elaboración de manuales: 0% (Pendiente).
- Tareas completadas: 0 de 3 en esta fase.
¿Deseas que asigne un responsable a los manuales?
═══════════════════════════════════════

MAPEO DE MIEMBROS:
- Sebastián = Sebastián Alejandro Ortiz Bustos
- Angel = Angel Ayuquina
- Alex = ALEX
- Daniel = Daniel Alexander
═══════════════════════════════════════

► FECHA ACTUAL: ${hoy}
► USUARIO: ${userName || 'Miembro del equipo'}.

[DOCUMENTACIÓN ANTIGUA / RAG]
${ragContext}

═══════════════════════════════════════
 MANUAL DE ACCIÓN (HERRAMIENTAS)
═══════════════════════════════════════
- SIEMPRE usa <respuesta>texto</respuesta> para hablar con el usuario.
- Usa <accion>{"tool": "NOMBRE", "args": {}}</accion> para ejecutar herramientas.
- Herramientas disponibles: 
  1. NOTIFY_TEAM: {"tool": "NOTIFY_TEAM", "args": {"message": "Mensaje para todo el equipo"}}
  2. NOTIFY_MEMBER: {"tool": "NOTIFY_MEMBER", "args": {"trelloNames": ["Nombre"], "text": "Mensaje privado"}}
  3. MOVE_CARD: {"tool": "MOVE_CARD", "args": {"cardId": "ID", "listId": "ID Destino"}}
  4. CREATE_CARD: {"tool": "CREATE_CARD", "args": {"listId": "ID", "name": "Título", "desc": "Descripción"}}
  5. ADD_COMMENT: {"tool": "ADD_COMMENT", "args": {"cardId": "ID", "text": "Comentario"}}
  6. ASSIGN_USER: {"tool": "ASSIGN_USER", "args": {"cardId": "ID", "memberId": "ID Miembro"}}
  7. MARK_CARD_COMPLETE: {"tool": "MARK_CARD_COMPLETE", "args": {"cardId": "ID"}}
  8. CREATE_ISSUE: {"tool": "CREATE_ISSUE", "args": {"title": "Título", "body": "Descripción"}}
  9. AUTO_FIX_CODE: {"tool": "AUTO_FIX_CODE", "args": {"filePath": "ruta", "newContent": "código", "reason": "motivo"}}
  10. SAVE_DELIVERABLE: {"tool": "SAVE_DELIVERABLE", "args": {"url": "URL del adjunto", "filename": "nombre_archivo.ext"}}
  11. GET_CARD_DETAILS: {"tool": "GET_CARD_DETAILS", "args": {"searchTerm": "nombre de la tarea"}}
  12. LIST_DOCUMENTS: {"tool": "LIST_DOCUMENTS", "args": {}}
- ¡NUNCA DIGAS QUE NO TIENES ACCESO! Si el usuario te pide notificar o crear algo, genera inmediatamente la etiqueta <accion> correspondiente.

═══════════════════════════════════════
 CONTEXTO DEL PROYECTO
═══════════════════════════════════════
Sprint Actual: ${conocimiento.sprint_actual}

[BASE DE CONOCIMIENTO MAESTRA] (General, NO usar para estados)
${masterKnowledge}

[TOPOLOGÍA TÉCNICA]
${topology}

[DOCUMENTACIÓN ANTIGUA / RAG] (Contexto histórico, NO usar para estados)
${ragContext}

═══════════════════════════════════════
 ESTADO REAL Y EN VIVO (ÚNICA FUENTE DE VERDAD DE TAREAS)
═══════════════════════════════════════
⏰ Datos capturados a las: ${hoy}
ESTADO TRELLO: ${trelloContext}
ESTADO GITHUB: ${githubContext}
`;
    }

    async chatWithAgent(userMessage: string, chatId?: string, userName?: string): Promise<{ text: string, actions?: any[] }> {
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
                // Detectar intenciones (Mejorado: solo si el mensaje es corto y es un saludo)
                const cleanMsg = userMessage.trim().toLowerCase();
                const isGreeting = (cleanMsg.length < 15) && /^(hola|buenos dias|buenas tardes|saludos|hey|oe|agente|buen dia)/i.test(cleanMsg);
                const isStatusQuery = /\b(estado|progreso|proceso|avance|haciendo|hace|vence|quien|que hay|github|repositorio|git|commit|equipo|van|va|archivos|codigo|pull request|pr|merge)\b/i.test(userMessage);
                
                [trelloContext, githubContext, topology, fullContext] = await Promise.all([
                    this.trello.getBoardState(),
                    isStatusQuery ? Promise.all([
                        this.github.getLatestCommits(since, until),
                        this.github.getRepoStructure()
                    ]).then(([commits, repo]) => `${commits}\n\n${repo}`) : Promise.resolve(''),
                    isStatusQuery ? this.trello.getBoardTopologyForAI() : Promise.resolve(''),
                    (isStatusQuery || isGreeting) ? Promise.resolve('') : this.docs.getRelevantContext(userMessage, 5)
                ]);

                if (isGreeting && !isStatusQuery) {
                    trelloContext = "El usuario solo está saludando. Responde brevemente y profesionalmente. No des un reporte de estado.";
                }
                
                console.log('--- DEBUG: RAG CONTEXT SOURCED ---');
                console.log(fullContext ? fullContext.substring(0, 500) + '...' : 'EMPTY');
                console.log('--- END DEBUG ---');
                console.log('--- DEBUG: TRELLO CONTEXT SENT TO AI ---');
                console.log(trelloContext);
                console.log('--- END DEBUG ---');
                this.cache.set(cacheKey, { 
                    data: { trelloContext, githubContext, topology, fullContext }, 
                    timestamp: Date.now() 
                });
                // Invalida la caché inmediatamente si Trello falló para no quedarse atascado
                if (typeof trelloContext === 'string' && trelloContext.includes('❌')) {
                    this.cache.delete(cacheKey);
                }
            }

            let equipoContext = "Sin miembros.";
            if (fs.existsSync(path.join(process.cwd(), 'equipo.json'))) {
                equipoContext = fs.readFileSync(path.join(process.cwd(), 'equipo.json'), 'utf-8');
            }
            // Límites estrictos para no exceder 32K tokens del modelo
            // Budget: ~4000 (base) + ~400 (manual) + ~750 (trello) + ~250 (github) + ~2000 (rag) + ~750 (topology) + ~500 (otros) + 2000 (output) = ~10.650 tokens → bien dentro del límite
            const trimmedContext = fullContext.slice(0, 8000);  // ~2000 tokens
            const trelloCapped = trelloContext.slice(0, 20000);  // ~5000 tokens
            const githubCapped = githubContext.slice(0, 3000);  // ~750 tokens
            const topologyCapped = topology.slice(0, 3000);     // ~750 tokens

            const masterKnowledge = fs.readFileSync(path.join(process.cwd(), 'conocimiento', 'base_conocimiento.md'), 'utf-8');
            const manualComportamiento = fs.readFileSync(path.join(process.cwd(), 'conocimiento', 'manual_comportamiento.md'), 'utf-8');

            const prompt = this.getSuperPrompt(conocimiento, hoy, equipoContext, topologyCapped, githubCapped, trelloCapped, trimmedContext, masterKnowledge, manualComportamiento, userName);

            // Log para monitoreo de tamaño
            const promptTokensEstimated = Math.round(prompt.length / 4);
            console.log(`📊 Prompt size: ~${promptTokensEstimated} tokens (${prompt.length} chars)`);
            if (promptTokensEstimated > 28000) {
                console.warn(`⚠️  Prompt cerca del límite! ${promptTokensEstimated} tokens`);
            }

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
            console.log('🤖 RAW LLM RESPONSE:', content);
            const match = content.match(/<respuesta>([\s\S]*?)<\/respuesta>/i);
            let cleanText = match ? match[1].trim() : content.trim();
            cleanText = cleanText.replace(/<accion>[\s\S]*?<\/accion>/gi, '').trim();
            cleanText = cleanText.replace(/<task_complete>([\s\S]*?)<\/task_complete>/gi, '$1').trim(); // Limpiar etiqueta basura de Qwen
            cleanText = cleanText.replace(/\\([.\-])/g, '$1'); // Limpiar escapes innecesarios que hace la IA

            let actions: any[] = [];
            const matches = content.matchAll(/<accion>([\s\S]*?)<\/accion>/gi);
            for (const m of matches) {
                try {
                    // Sanear JSON: quitar barras invertidas inválidas antes de letras o símbolos que no las requieran
                    let jsonStr = m[1].trim();
                    jsonStr = jsonStr.replace(/\\(?!["\\/bfnrt])/g, '');
                    const p = JSON.parse(jsonStr);
                    if (p.name && p.arguments) { p.tool = p.name; p.args = p.arguments; }
                    if (p.tool) actions.push(p);
                } catch (e) {
                    console.error("Error parseando accion JSON:", e);
                }
            }

            if (cleanText === '' && content.trim() !== '') {
                // Solo restauramos el texto si falló totalmente el parseo de acciones
                if (actions.length === 0) {
                    cleanText = content.trim();
                }
            }

            memory.push({ role: 'assistant', content: cleanText });
            await this.saveSessions(activeChat);
            return { text: cleanText, actions: actions.length > 0 ? actions : undefined };
        } catch (error) {
            const errDetail = error.response?.data?.error?.message || error.message || String(error);
            console.error('🚨 AI Error:', errDetail);
            return { text: `😔 Lo siento, tuve un error temporal conectando con mi IA (${errDetail?.slice(0, 60)}). Por favor intenta de nuevo en unos segundos.` };
        }
    }

    /**
     * Consulta ligera a la IA sin cargar contexto completo (Trello/GitHub/docs).
     * Ideal para análisis internos del cron donde ya se tiene el contexto como string.
     */
    async quickAsk(systemPrompt: string, userMessage: string, maxTokens = 800): Promise<string> {
        try {
            const data = await this.postWithFailover({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: maxTokens
            });
            const content = data.choices[0]?.message?.content || '';
            // Extraer <respuesta> si existe, si no devolver el contenido limpio
            const match = content.match(/<respuesta>([\s\S]*?)<\/respuesta>/i);
            return match ? match[1].trim() : content.trim();
        } catch (error) {
            const errDetail = error.response?.data?.error?.message || error.message || String(error);
            console.error('🚨 quickAsk Error:', errDetail);
            throw error;
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