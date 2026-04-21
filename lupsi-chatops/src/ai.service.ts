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
        // Cargar llaves y modelos desde el entorno
        const envKeys = process.env.AI_KEYS || process.env.OPENROUTER_API_KEY;
        this.keys = envKeys ? envKeys.split(',').map(k => k.trim()) : [];
        
        const envModels = process.env.AI_MODELS;
        this.models = envModels ? envModels.split(',').map(m => m.trim()) : ['openrouter/free'];

        console.log(`🔌 IA Service inicializado con ${this.keys.length} llaves y ${this.models.length} modelos.`);

        // Cargar sesiones persistidas al iniciar
        this.loadSessions();
    }

    private loadSessions() {
        try {
            if (fs.existsSync(SESIONES_PATH)) {
                const raw = JSON.parse(fs.readFileSync(SESIONES_PATH, 'utf-8'));
                for (const [chatId, msgs] of Object.entries(raw)) {
                    this.sessionMemory.set(chatId, msgs as any[]);
                }
                console.log(`💾 Sesiones cargadas: ${this.sessionMemory.size} conversación(es) restauradas.`);
            }
        } catch (e) {
            console.warn('No se pudieron cargar sesiones previas:', e.message);
        }
    }

    private saveSessions() {
        try {
            const obj: any = {};
            this.sessionMemory.forEach((v, k) => { obj[k] = v.slice(-10); }); // Últimos 10 mensajes por sesión
            fs.writeFileSync(SESIONES_PATH, JSON.stringify(obj));
        } catch (e) {
            console.warn('No se pudo guardar sesión:', e.message);
        }
    }

    /**
     * Realiza una petición a OpenRouter con soporte para failover (reintento con otras keys/modelos)
     */
    private async postWithFailover(payload: { messages: any[], max_tokens: number }): Promise<any> {
        let lastError = null;
        let attempts = 0;
        const MAX_TOTAL_ATTEMPTS = 3; // Límite total de intentos para no exceder timeouts globales
        
        // Intentar con cada modelo disponible
        for (let m = 0; m < this.models.length && attempts < MAX_TOTAL_ATTEMPTS; m++) {
            const modelIndex = (this.currentModelIndex + m) % this.models.length;
            const model = this.models[modelIndex];

            // Para cada modelo, intentar con cada llave disponible
            for (let k = 0; k < this.keys.length && attempts < MAX_TOTAL_ATTEMPTS; k++) {
                const keyIndex = (this.currentKeyIndex + k) % this.keys.length;
                const key = this.keys[keyIndex];
                attempts++;

                try {
                    console.log(`🤖 [Intento ${attempts}] Modelo: ${model} | Key Index: ${keyIndex}`);
                    
                    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                        model: model,
                        messages: payload.messages,
                        max_tokens: payload.max_tokens
                    }, {
                        headers: {
                            'Authorization': `Bearer ${key}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 20000 // Reducido a 20s para ser más ágil
                    });

                    // Si tuvo éxito, actualizamos los índices actuales para la próxima vez
                    this.currentKeyIndex = keyIndex;
                    this.currentModelIndex = modelIndex;
                    return response.data;
                } catch (error) {
                    const status = error?.response?.status;
                    const errorData = error?.response?.data;
                    console.warn(`⚠️ Fallo intento ${attempts}: Status ${status}`, errorData || error.message);
                    
                    lastError = error;

                    // Si el error es 400 o 404 (Bad Request / Not Found - usualmente modelo inválido), saltamos el modelo
                    if (status === 400 || status === 404) {
                        break; // Probar con el siguiente modelo
                    }

                    // Si es 401, 429 o 402, probamos con la siguiente key
                    if (status === 429 || status === 402 || status === 401) {
                        continue; 
                    } else {
                        break; // Otros errores: probamos con el siguiente modelo
                    }
                }
            }
        }
        
        throw lastError || new Error('No se pudo completar la petición tras varios intentos.');
    }


    async chatWithAgent(userMessage: string, chatId?: string): Promise<{ text: string, actions?: any[] }> {
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

            // 2.5 Leemos los integrantes vinculados
            let equipoContext = "No hay miembros vinculados aún.";
            const equipoPath = path.join(process.cwd(), 'equipo.json');
            if (fs.existsSync(equipoPath)) {
                equipoContext = fs.readFileSync(equipoPath, 'utf-8');
            }

            // 3. El Súper-Prompt Definitivo (Restructurado para Rigidez)
            const prompt = `ERES EL AGENTE AUTÓNOMO LUPSI. Identidad: Project Manager Activo.
      
      === REGLA DE ORO DE ACCIÓN ===
      1. SIEMPRE que debas hacer algo (mover, crear, notificar, etc.), DEBES incluir la etiqueta <accion>.
      2. NUNCA digas "¡Listo! He enviado..." o "Hecho" si no estás incluyendo el JSON de la herramienta en esa misma respuesta.
      3. REGLA DE VERACIDAD: NO INVENTES NADA. Si un dato (fecha, hito, nombre) no está en los documentos o APIs, di que no lo sabes. Prohibido alucinar.
      4. Para notificar a una persona, es OBLIGATORIO usar NOTIFY_MEMBER. No puedes "hablarles" sin usar la herramienta.
      5. Si el usuario pide notificar a varios, incluye múltiples etiquetas <accion> (una por persona).
      6. Usa EXCLUSIVAMENTE los IDs de la TOPOLOGÍA proporcionada abajo.

      === MANUAL DE HERRAMIENTAS (OBLIGATORIO) ===
      Para actuar, escribe: <accion>{"tool": "NOMBRE", "args": {...}}</accion>
      Herramientas disponibles:
      - MOVE_CARD: {"cardId": "string", "listId": "string"}
      - CREATE_CARD: {"listId": "string", "name": "string", "desc": "string", "idMembers": "id1,id2", "idLabels": "id1,id2", "due": "ISO_DATE", "start": "ISO_DATE"}
      - ADD_COMMENT: {"cardId": "string", "text": "string"}
      - CREATE_ISSUE: {"title": "string", "body": "string"}
      - ASSIGN_USER: {"cardId": "string", "memberId": "string"}
      - NOTIFY_MEMBER: {"trelloNames": "Nombre1, Nombre2", "text": "string"} → Úsala para enviar el mismo mensaje a uno o varios miembros a la vez. Si es para todo el equipo, incluye todos los nombres separados por coma.
      - GET_CARD_DETAILS: {"searchTerm": "nombre parcial de la tarea"} → Úsala cuando el usuario pregunte por una tarea específica o pida sus adjuntos/entregables.

      === EJEMPLO DE RESPUESTA CORRECTA ===
      Usuario: "Notifica a ALEX que revise el bug"
      Respuesta: "<respuesta>Entendido, le avisaré a ALEX de inmediato.</respuesta> <accion>{\"tool\": \"NOTIFY_MEMBER\", \"args\": {\"trelloName\": \"ALEX\", \"text\": \"Hola, el PM solicita que revises el bug pendiente.\"}}</accion>"

      Usuario: "Crea un issue de bug"
      Respuesta: "<respuesta>Con gusto, voy a preparar el reporte de error en GitHub.</respuesta> <accion>{\"tool\": \"CREATE_ISSUE\", \"args\": {\"title\": \"Bug reportado\", \"body\": \"...\"}}</accion>"

      === CONTEXTO DEL PROYECTO (FUENTE DE VERDAD ABSOLUTA) ===
      Sprint Actual: ${conocimiento.sprint_actual}
      Fecha Fin Sprint: ${conocimiento.fecha_fin} | Hoy: ${hoy}
      Objetivo: ${conocimiento.objetivo_principal}
      
      REGLA DE VERACIDAD DE SPRINT: Aunque encuentres documentos de otros sprints (ej. Sprint 5, Sprint 4) en la base de conocimiento, DEBES IGNORARLOS si contradicen el campo "Sprint Actual" de arriba. Actualmente estamos ÚNICAMENTE en el ${conocimiento.sprint_actual}. No menciones otros sprints como si fueran el presente.
      
      === REGLAS APRENDIDAS (ÓRDENES DIRECTAS DEL PM) ===
      ${(conocimiento.reglas_aprendidas || []).map(r => `- RECHAZASTE: ${r.accion_rechazada} MOTIVO: ${r.motivo}`).join('\n') || 'Ninguna regla aprendida aún.'}

      EQUIPO VINCULADO (TELEGRAM):
      ${equipoContext}

      TOPOLOGÍA TÉCNICA (USA ESTOS IDs):
      ${topology}
      
      ESTADO ACTUAL (GITHUB):
      ${githubContext}
      
      ESTADO TRELLO:
      ${trelloContext}
      
      DOCUMENTACIÓN (BASE DE CONOCIMIENTO):
      ${knowledgeBase}

      === REGLAS DE FORMATO (OBLIGATORIO) ===
      1. Tu respuesta DEBE estar contenida en etiquetas <respuesta></respuesta>.
      2. CUALQUIER acción técnica DEBE estar en etiquetas <accion></accion>.
      3. Si el usuario pide notificar a varias personas, escribe una etiqueta <accion> POR CADA PERSONA.
      4. NUNCA respondas sin usar <respuesta>.
      5. NUNCA digas que hiciste algo si no pusiste la etiqueta <accion> en este mismo turno.
      
      EJEMPLO GRUPAL:
      Usuario: "Avisa a todo el equipo que hay junta"
      Respuesta: "<respuesta>Entendido, notificaré a Sebastián y ALEX sobre la junta.</respuesta> <accion>{\"tool\": \"NOTIFY_MEMBER\", \"args\": {\"trelloNames\": \"Sebastián Alejandro Ortiz Bustos, ALEX\", \"text\": \"Junta hoy a las 5pm.\"}}</accion>"
      
      EJEMPLO MULTITAREA (ACCIONES DIFERENTES):`;

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

            const data = await this.postWithFailover({
                messages: messages,
                max_tokens: 2000
            });

            const content = data.choices[0]?.message?.content;
            console.log('🤖 RAW AI RESPONSE:', content);
            if (!content) {
                return { text: '❌ La IA no devolvió ninguna respuesta (vacío). Intenta de nuevo.' };
            }
            
            // Extracción resiliente: intenta capturar contenido entre etiquetas <respuesta>
            const match = content.match(/<respuesta>([\s\S]*?)<\/respuesta>/i);
            let cleanText = match ? match[1].trim() : content.trim();

            // Limpieza defensiva: eliminar cualquier etiqueta XML residual que se haya colado
            cleanText = cleanText
                .replace(/<\/?respuesta>/gi, '')
                .replace(/<\/?accion>[\s\S]*?<\/accion>/gi, '')
                .replace(/<accion>[\s\S]*/gi, '') // Si quedó etiqueta sin cerrar
                .replace(/<[^>]+>/g, '')          // Cualquier otra etiqueta HTML/XML
                .trim();

            // Extracción de acciones JSON (Soporte para múltiples etiquetas <accion>)
            let actions: any[] = [];
            const actionMatches = content.matchAll(/<accion>([\s\S]*?)<\/accion>/gi);
            for (const match of actionMatches) {
                try {
                    const parsedAction = JSON.parse(match[1].trim());
                    actions.push(parsedAction);
                } catch (e) {
                    console.error('Error al parsear JSON de acción:', e.message);
                }
            }
            
            memory.push({ role: 'assistant', content: cleanText });
            this.saveSessions(); // Persistir en disco para sobrevivir reinicios
            
            return { text: cleanText, actions: actions.length > 0 ? actions : undefined };
        } catch (error) {
            console.error('Error en IA:', error?.response?.data || error.message);
            return { text: '❌ Mi cerebro de IA está fuera de línea por ahora.' };
        }
    }

    async analyzeAndDecideTasks(trelloTopology: string, githubWorkload: string): Promise<any> {
        try {
            const conocimientoPath = path.join(process.cwd(), 'conocimiento.json');
            const conocimiento = JSON.parse(fs.readFileSync(conocimientoPath, 'utf-8'));
            const reglasText = (conocimiento.reglas_aprendidas || []).map(r => `- Acción rechazada en el pasado: ${r.accion_rechazada}. Motivo del PM: ${r.motivo}`).join('\n');

            const prompt = `Eres un Agente Autónomo (Project Manager). 
Debes analizar la siguiente topología de Trello (en JSON) y la carga de GitHub.

=== REGLAS APRENDIDAS DE TUS ERRORES PASADOS ===
${reglasText || 'Ninguna regla aprendida aún. Eres libre de decidir.'}
¡NO PROPONGAS ACCIONES QUE VAYAN EN CONTRA DE ESTAS REGLAS!

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

            const data = await this.postWithFailover({
                messages: [
                    { role: 'system', content: 'Eres un motor JSON. Responde siempe en Español.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 1500
            });

            let content = data.choices[0].message.content;
            
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