import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AiService } from './ai.service';
import { PdfService } from './pdf.service';
import { AutonomyService } from './autonomy.service';
import { BotService } from './bot.service';
import { TrelloService } from './trello.service';
import { DocsService } from './docs.service';
import { Telegraf, Markup, Input } from 'telegraf';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CronService {

  constructor(
    private readonly aiService: AiService,
    private readonly pdfService: PdfService,
    private readonly autonomyService: AutonomyService,
    private readonly botService: BotService,
    private readonly trelloService: TrelloService,
    private readonly docsService: DocsService,
  ) {}

  // ══════════════════════════════════════════════════════
  // CICLO 1 — STANDUP MATUTINO (09:00 AM — Lunes a Viernes)
  // Pregunta a cada miembro vinculado qué hará hoy y si tiene bloqueos.
  // No requiere que nadie le pregunte. LUPSI lo hace solo.
  // ══════════════════════════════════════════════════════
  @Cron('0 9 * * 1-5')
  async enviarStandupMatutino() {
    console.log('⏰ Enviando standup matutino al equipo...');
    const adminChatId = process.env.TELEGRAM_CHAT_ID as string;

    const equipoPath = path.join(process.cwd(), 'equipo.json');
    if (!fs.existsSync(equipoPath)) return;

    const equipo: any[] = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));
    if (equipo.length === 0) return;

    const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    const bot = this.botService.getBotInstance();
    for (const miembro of equipo) {
      try {
        await bot.telegram.sendMessage(
          miembro.chatId,
          `👋 ¡Buenos días, *${miembro.trelloName}*!\n\n` +
          `Es el *${hoy}*. Soy LUPSI, tu gestor de proyecto.\n\n` +
          `Cuéntame brevemente:\n` +
          `1️⃣ ¿En qué trabajarás hoy?\n` +
          `2️⃣ ¿Tienes algún bloqueo o necesitas algo del equipo?\n\n` +
          `_Responde aquí directamente._`,
          { parse_mode: 'Markdown' }
        );
        // Activar modo standup para capturar la respuesta
        this.botService.activarModoStandup(miembro.chatId);
      } catch (e) {
        console.error(`Error enviando standup a ${miembro.trelloName}:`, e.message);
      }
    }

    await bot.telegram.sendMessage(
      adminChatId,
      `📢 *Standup enviado* al equipo (${equipo.length} miembro${equipo.length > 1 ? 's' : ''}).\nRecopilaré sus respuestas y te presentaré el resumen a las 10:00 AM.`,
      { parse_mode: 'Markdown' }
    );
  }

  // ══════════════════════════════════════════════════════
  // CICLO 2 — RECOPILACIÓN DEL STANDUP (10:00 AM — Lunes a Viernes)
  // LUPSI analiza el estado del tablero y alerta si alguien no respondió.
  // ══════════════════════════════════════════════════════
  @Cron('0 10 * * 1-5')
  async recopilarStandup() {
    console.log('⏰ Recopilando estado matutino del proyecto...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;

    try {
      // Leer respuestas reales del standup si existen
      const standupPath = path.join(process.cwd(), 'standup_hoy.json');
      let resumenEquipo = '';
      let climaEmocional = "Neutral (Sin datos)";

      if (fs.existsSync(standupPath)) {
        const respuestas: any[] = JSON.parse(fs.readFileSync(standupPath, 'utf-8'));
        const hoy = new Date().toLocaleDateString('es-ES');

        // Filtrar solo las respuestas de hoy
        const respuestasHoy = respuestas.filter(r => {
          const fechaRespuesta = new Date(r.hora).toLocaleDateString('es-ES');
          return fechaRespuesta === hoy;
        });

        if (respuestasHoy.length > 0) {
          resumenEquipo = `\n\n*Respuestas del equipo:*\n` +
            respuestasHoy.map(r => `• *${r.nombre}:* ${r.respuesta}`).join('\n');
          
          // 1. ANÁLISIS DE SENTIMIENTO (Fase 3: Inteligencia Emocional)
          const sentimentPrompt = `Analiza el tono emocional de estas respuestas de standup del equipo:
          ${respuestasHoy.map(r => r.respuesta).join('\n')}
          
          Responde ÚNICAMENTE con una de estas opciones y un emoji:
          - 🔋 Alta Energía (Positivo/Motivado)
          - 😐 Estable (Neutral/Enfocado)
          - ⚠️ Estrés Detectado (Cansancio/Frustración)
          - 🆘 Alerta Crítica (Bloqueo emocional/Desmotivación)`;
          
          const sentimentResult = await this.aiService.chatWithAgent(sentimentPrompt);
          climaEmocional = sentimentResult.text.trim();
        } else {
          resumenEquipo = '\n\n_Ningún miembro respondió el standup aún._';
        }

        // Limpiar el archivo para el día siguiente
        fs.writeFileSync(standupPath, '[]');
      }

      const prompt = `Eres LUPSI, PM autónomo. En ESPAÑOL. MUY CORTO.
Revisa el tablero de Trello y genera un resumen matutino del proyecto con:
- ¿Qué está en progreso hoy?
- ¿Hay bloqueos visibles en el tablero?
- ¿Alguna tarea próxima a vencer hoy o mañana?
Máximo 4 puntos concisos. Sin introducciones.`;

      const result = await this.aiService.chatWithAgent(prompt);
      const bot = this.botService.getBotInstance();

      await bot.telegram.sendMessage(
        chatId,
        this.escapeMarkdown(`☀️ *Resumen del Standup — ${new Date().toLocaleDateString('es-ES')}*\n\n` +
        `🌡 *Clima del Equipo:* ${climaEmocional}\n\n` +
        `${result.text}${resumenEquipo}`),
        { parse_mode: 'Markdown' }
      );

      // Watchdog: detectar tareas bloqueadas
      await this.detectarTareasBloqueadas();

    } catch (error) {
      console.error('Error en recopilación del standup:', error);
    }
  }

  // ══════════════════════════════════════════════════════
  // CICLO 3 — WATCHDOG DE BLOQUEOS (12:00 PM — Todos los días)
  // LUPSI revisa si hay tareas "estancadas" y avisa al PM y al dev.
  // ══════════════════════════════════════════════════════
  @Cron('0 12 * * *')
  async watchdogBloqueos() {
    console.log('🔍 Watchdog: revisando tareas bloqueadas...');
    await this.detectarTareasBloqueadas();
  }

  private async detectarTareasBloqueadas() {
    const chatId = process.env.TELEGRAM_CHAT_ID as string;
    try {
      // Datos REALES de Trello — no adivina, mide timestamps reales
      const bloqueadas = await this.trelloService.getStuckCards(2);

      if (bloqueadas.length === 0) return; // Sin ruido innecesario

      const lista = bloqueadas
        .map(c => `• *${c.nombre}* (${c.lista})\n  👤 ${c.asignados} | 📅 Lleva *${c.diasBloqueada} día${c.diasBloqueada !== 1 ? 's' : ''}* sin actividad | Vence: ${c.vencimiento}`)
        .join('\n\n');

      const bot = this.botService.getBotInstance();
      await bot.telegram.sendMessage(
        chatId,
        this.escapeMarkdown(`⚠️ *Watchdog LUPSI — Tareas Bloqueadas*\n\n${lista}\n\n💡 ¿Quieres que mueva o reasigne alguna? Dime.`),
        { parse_mode: 'Markdown' }
      );

      // Notificar individualmente a los devs afectados
      const equipoPath = path.join(process.cwd(), 'equipo.json');
      if (fs.existsSync(equipoPath)) {
        const equipo: any[] = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));
        for (const card of bloqueadas) {
          for (const miembro of equipo) {
            if (card.asignados.includes(miembro.trelloName)) {
              await this.botService.notifyMember(
                miembro.trelloName,
                `⚠️ Hola *${miembro.trelloName}* — LUPSI detectó que *"${card.nombre}"* lleva ${card.diasBloqueada} día(s) sin actividad.\n\n¿Hay algún bloqueo? El PM Angel puede ayudarte.`
              ).catch(() => {});
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error en watchdog:', e.message);
    }
  }


  // ══════════════════════════════════════════════════════
  // CICLO NUEVO — BALANCE DE CARGAS (15:00 — Lunes a Viernes)
  // Evalúa autónomamente quién está sobrecargado y quién inactivo.
  // ══════════════════════════════════════════════════════
  @Cron('0 15 * * 1-5')
  async analisisDeSobrecarga() {
    console.log('⚖️ Evaluando balance de cargas del equipo...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;
    const bot = this.botService.getBotInstance();
    
    try {
      const topologyRaw = await this.trelloService.getBoardTopologyForAI();
      if (!topologyRaw || topologyRaw === '{}') return;
      const topology = JSON.parse(topologyRaw);

      const equipoPath = path.join(process.cwd(), 'equipo.json');
      if (!fs.existsSync(equipoPath)) return;
      const equipo: any[] = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));
      
      const listasProcesoIds = topology.listas
        .filter((l: any) => /doing|progreso|proceso|wip/i.test(l.name))
        .map((l: any) => l.id);
        
      const listasPendientesIds = topology.listas
        .filter((l: any) => /todo|pendiente|backlog/i.test(l.name))
        .map((l: any) => l.id);

      const tareasPendientes = topology.tarjetas.filter((c: any) => listasPendientesIds.includes(c.idList)).length;

      let mensajePM = `⚖️ *Auditoría de Cargas LUPSI (15:00)*\n\n`;
      let alertasGeneradas = 0;

      for (const miembro of equipo) {
        // Encontrar ID de Trello del miembro basado en su nombre
        const trelloMember = topology.miembros.find((m: any) => 
            m.fullName.toLowerCase() === miembro.trelloName.toLowerCase().trim() ||
            m.fullName.toLowerCase().includes(miembro.trelloName.toLowerCase().trim())
        );

        if (!trelloMember) continue;

        const enProceso = topology.tarjetas.filter((c: any) => 
            listasProcesoIds.includes(c.idList) && c.idMembers.includes(trelloMember.id)
        );

        mensajePM += `👤 *${miembro.trelloName}*: ${enProceso.length} en proceso\n`;

        if (enProceso.length >= 3) {
            await this.botService.notifyMember(
                miembro.trelloName,
                `⚠️ *ALERTA DE SOBRECARGA*\n\nHola ${miembro.nombre || miembro.trelloName}, soy LUPSI. He detectado que tienes *${enProceso.length} tareas activas simultáneamente*.\n\nPor favor, cierra o bloquea tareas actuales antes de empezar nuevas para evitar el context-switching. 🛑`
            ).catch(() => {});
            alertasGeneradas++;
        } else if (enProceso.length === 0 && tareasPendientes > 0) {
            await this.botService.notifyMember(
                miembro.trelloName,
                `🔔 *SUGERENCIA DE TRABAJO*\n\nHola ${miembro.nombre || miembro.trelloName}. Veo que no tienes tareas en progreso en este momento, pero hay *${tareasPendientes} tareas pendientes* en el tablero.\n\nPor favor, revisa el tablero y asígnate una nueva tarea. 🚀`
            ).catch(() => {});
            alertasGeneradas++;
        }
      }

      mensajePM += `\n🤖 *Acciones Autónomas:* LUPSI ha enviado ${alertasGeneradas} mensajes directos (DMs) al equipo corrigiendo la carga laboral.`;

      await bot.telegram.sendMessage(chatId, this.escapeMarkdown(mensajePM), { parse_mode: 'Markdown' });

    } catch (e) {
      console.error('Error en análisis de sobrecarga:', e.message);
    }
  }

  // ══════════════════════════════════════════════════════
  // CICLO 4 — ALERTAS DE VENCIMIENTO (08:00 AM — Todos los días)
  // Si una tarjeta vence en las próximas 48h, LUPSI avisa al dev asignado.
  // ══════════════════════════════════════════════════════
  @Cron('0 8 * * *')
  async alertasVencimiento() {
    console.log('⏰ Revisando vencimientos reales de Trello...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;
    try {
      const proximasAVencer = await this.trelloService.getCardsDueSoon(48);
      if (proximasAVencer.length === 0) return;

      const lista = proximasAVencer
        .map(c => `• *${c.nombre}*\n  👤 ${c.asignados} | 🕐 ${c.horasRestantes}h restantes | 📅 ${c.vencimiento}`)
        .join('\n\n');

      const bot = this.botService.getBotInstance();
      await bot.telegram.sendMessage(
        chatId,
        this.escapeMarkdown(`📅 *Vencimientos en 48h — LUPSI*\n\n${lista}`),
        { parse_mode: 'Markdown' }
      );

      const equipoPath = path.join(process.cwd(), 'equipo.json');
      if (fs.existsSync(equipoPath)) {
        const equipo: any[] = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));
        for (const card of proximasAVencer) {
          for (const miembro of equipo) {
            if (card.asignados.includes(miembro.trelloName)) {
              await this.botService.notifyMember(
                miembro.trelloName,
                `📅 ¡Ojo, *${miembro.trelloName}*!\n\nTienes *"${card.nombre}"* que vence en *${card.horasRestantes} horas* (${card.vencimiento}).\n\n¡A darle! 💪`
              ).catch(() => {});
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error en alertas de vencimiento:', error);
    }
  }



  // ══════════════════════════════════════════════════════
  // CICLO 5 — AUDITORÍA NOCTURNA + REPORTE PDF (23:30 — Todos los días)
  // Reporte completo, análisis de código proactivo y propuesta de acciones.
  // ══════════════════════════════════════════════════════
  @Cron('30 23 * * *')
  async enviarReporteNocturno() {
    console.log('⏰ Ejecutando Auditoría Nocturna completa...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;

    try {
      const bot = this.botService.getBotInstance();
      await bot.telegram.sendMessage(chatId, '🔔 LUPSI iniciando auditoría de cierre de día...');

      // 1) REPORTE EJECUTIVO (PDF con gráficos)
      const promptReporte = `Actúa como PM experto para SKT Software Solution (Software, Knowledge, and Trust). 
Genera un REPORTE DE ESTADO DEL PROYECTO PROFESIONAL en ESPAÑOL con estas secciones EXACTAS:

ESTADO GENERAL:
[Escribe exactamente el color del semáforo (VERDE, AMARILLO, ROJO) y una justificación breve en la misma línea].

1. RESUMEN EJECUTIVO:
[Incluye una lista de los Top 3 Hitos Alcanzados y una lista de Bloqueos Actuales].

2. EVALUACIÓN DE RENDIMIENTO DEL EQUIPO (¡MUY IMPORTANTE!):
[Sé MUY estricto y explícito. Menciona con NOMBRE Y APELLIDO a los miembros que están atrasando el flujo de trabajo o bloqueando tarjetas. También menciona a los que han cerrado tareas eficientemente. No seas diplomático, señala el rendimiento real].

3. ANÁLISIS DE FLUJO DE TRABAJO:
[Métricas del Periodo: Tareas Planificadas, Completadas y Pasadas.
Distribución de Carga: Una lista por miembro indicando Rol, Miembro, Estado de Carga (Normal/Sobrecargado) y Tareas (Activas/Pendientes)].

4. SALUD DEL CÓDIGO Y REPOSITORIO:
[Métricas de PRs (Abiertos/Fusionados), Issues (Reportados/Resueltos) y Estado de Ramas (Main/Develop)].

5. MATRIZ DE RIESGOS:
[Lista de riesgos. Formato: Riesgo | Impacto | Mitigación | Responsable Directo asignado para solucionarlo hoy/mañana].

6. RECOMENDACIONES Y PRÓXIMOS PASOS:
[Ajustes al Proceso y Top 3 Prioridades para la próxima semana].

Sin emojis. Sin introducciones. Empieza exactamente con "ESTADO GENERAL:".`;

      const [resultReporte, metrics] = await Promise.all([
        this.aiService.chatWithAgent(promptReporte),
        this.trelloService.getMetrics()
      ]);

      // ── REGISTRO PARA EL BURNDOWN CHART ──
      // Sumar tarjetas en listas que NO sean "Done" o "Completado"
      let tareasPendientes = 0;
      for (const [nombreLista, conteo] of Object.entries(metrics.listas || {})) {
        if (!/done|completado|terminado|hecho/i.test(nombreLista)) {
          tareasPendientes += conteo as number;
        }
      }

      const burndownPath = path.join(process.cwd(), 'burndown.json');
      let burndownData: any[] = [];
      if (fs.existsSync(burndownPath)) {
        burndownData = JSON.parse(fs.readFileSync(burndownPath, 'utf-8'));
      }
      
      const hoyStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      // Evitar duplicados del mismo día
      if (burndownData.length === 0 || burndownData[burndownData.length - 1].fecha !== hoyStr) {
        burndownData.push({ fecha: hoyStr, pendientes: tareasPendientes });
        fs.writeFileSync(burndownPath, JSON.stringify(burndownData, null, 2));
      }

      // Añadimos el historial del burndown a las métricas para el PDF
      metrics.burndown = burndownData;

      const pdfBuffer = await this.pdfService.generateReport(resultReporte.text, metrics);
      const filename = `Reporte_LUPSI_${new Date().toISOString().split('T')[0]}.pdf`;

      await bot.telegram.sendDocument(
        chatId,
        Input.fromBuffer(pdfBuffer, filename),
        { caption: '📊 Reporte ejecutivo nocturno generado.' },
      );

      // 2) ANÁLISIS PROACTIVO DE CÓDIGO (secuencial para evitar Rate Limit de OpenRouter)
      try {
        const baseCtx = `Eres LUPSI, PM autónomo del equipo. Hablas SIEMPRE en ESPAÑOL. Eres conciso y directo.`;
        
        const opt = await this.aiService.chatWithAgent(baseCtx + ` Identifica MÁXIMO 3 optimizaciones de código urgentes. Formato: archivo → problema → solución. MUY CORTO.`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay 2s
        
        const test = await this.aiService.chatWithAgent(baseCtx + ` Propón 3 pruebas de software prioritarias que faltan. Formato: tipo → qué prueba → urgencia.`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const debt = await this.aiService.chatWithAgent(baseCtx + ` Los 2 puntos de deuda técnica más urgentes. Formato: problema → impacto → esfuerzo (Bajo/Medio/Alto).`);

        for (const [emoji, titulo, res] of [
          ['⚡', 'OPTIMIZACIONES DETECTADAS', opt],
          ['🧪', 'PRUEBAS QUE FALTAN', test],
          ['🔧', 'DEUDA TÉCNICA', debt],
        ] as [string, string, any][]) {
          await bot.telegram.sendMessage(
            chatId,
            this.escapeMarkdown(`${emoji} *${titulo}*\n\n${res.text}`),
            { parse_mode: 'Markdown' }
          );
        }
      } catch (e) {
        console.error('Error en análisis de código nocturno:', e.message);
      }

      // 3) ANÁLISIS ESTRATÉGICO — Propone acción, espera aprobación del PM
      const resultDecision = await this.aiService.chatWithAgent(
        `Eres LUPSI, Senior PM autónomo experto. ESPAÑOL.
Revisa la base de conocimiento (sprint actual, fecha de fin) y la topología del tablero.
Debes proponer UNA acción estratégica obligatoria evaluando estos 3 pilares:
1. GESTIÓN DE TIEMPO (RENUNCIA ESTRATÉGICA): Si faltan pocos días para el fin del Sprint y hay tareas grandes/bloqueadas, PROPÓN APLAZARLAS al siguiente Sprint usando la herramienta MOVE_CARD para moverla al Backlog o lista futura.
2. GESTIÓN DE RECURSOS (REASIGNACIÓN): Si detectas sobrecarga en un miembro, sugiere explícitamente reasignar su tarea a otro miembro disponible. Usa NOTIFY_MEMBER para avisarles del cambio propuesto.
3. PRIORIZACIÓN: Si hay tareas críticas, sugiere pausar el resto.

Genera SIEMPRE un JSON <accion> con la herramienta correspondiente (ej. MOVE_CARD, NOTIFY_MEMBER, CREATE_ISSUE).
Si la acción afecta a alguien, incluye el campo extra "notifyMember": "Nombre del Trello" dentro del JSON para avisarle.
En la <respuesta>, explica MUY brevemente tu razonamiento estratégico de forma autoritaria.`
      );

      const actions = (resultDecision as any).actions || [];
      if (actions.length > 0) {
        const primaryAction = actions[0];
        const actionId = this.autonomyService.saveDecision(primaryAction);

        // Guardar en historial
        const historialPath = path.join(process.cwd(), 'historial.txt');
        fs.appendFileSync(historialPath, `\n[${new Date().toLocaleDateString('es-ES')}] PROPUESTA: ${resultDecision.text}\n`);

        await bot.telegram.sendMessage(
          chatId,
          this.escapeMarkdown(`🧐 *ACCIÓN PROPUESTA POR LUPSI:*\n\n${resultDecision.text}\n\n👆 Tu aprobación es requerida. LUPSI no ejecutará nada hasta que confirmes.`),
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Aprobar', `approve_auto_${actionId}`)],
              [Markup.button.callback('❌ Rechazar', `reject_auto_${actionId}`)],
            ]),
          }
        );

        if (primaryAction.notifyMember) {
          await this.botService.notifyMember(
            primaryAction.notifyMember,
            `Hola 👋 LUPSI ha detectado una situación con tus tareas. El PM la revisará pronto.`
          );
        }
      } else {
        await bot.telegram.sendMessage(chatId, `✅ Sin acciones estratégicas pendientes por hoy. ¡Buen trabajo equipo!`);
      }

    } catch (error) {
      console.error('Error en auditoría nocturna:', error);
    }
  }

  // ══════════════════════════════════════════════════════
  // CICLO 6 — RESUMEN SEMANAL (Viernes 17:00)
  // Comparativa de lo planificado vs lo logrado esta semana.
  // ══════════════════════════════════════════════════════
  @Cron('0 17 * * 5')
  async resumenSemanal() {
    console.log('📋 Generando resumen semanal de sprint...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;

    try {
      const prompt = `Eres LUPSI, PM autónomo. SIEMPRE en ESPAÑOL.
Tienes acceso a la planificación del sprint y al estado actual del tablero.
Genera el RESUMEN SEMANAL del equipo con estas secciones:

LOGROS DE LA SEMANA:
[Qué tareas se completaron. Máximo 5 puntos.]

PENDIENTE PARA LA SEMANA SIGUIENTE:
[Qué quedó sin completar. Máximo 5 puntos.]

CUMPLIMIENTO DEL SPRINT:
[% estimado de cumplimiento vs lo planificado. ¿Vamos bien o hay atraso?]

MENSAJE MOTIVACIONAL:
[Una frase corta de ánimo para el equipo, en español.]

Sin introducciones. Directo.`;

      const result = await this.aiService.chatWithAgent(prompt);

      const bot = this.botService.getBotInstance();
      await bot.telegram.sendMessage(
        chatId,
        this.escapeMarkdown(`📋 *Resumen Semanal — ${new Date().toLocaleDateString('es-ES')}*\n\n${result.text}`),
        { parse_mode: 'Markdown' }
      );

      // Notificar también al equipo
      const equipoPath = path.join(process.cwd(), 'equipo.json');
      if (fs.existsSync(equipoPath)) {
        const equipo: any[] = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));
        for (const miembro of equipo) {
          try {
            await bot.telegram.sendMessage(
              miembro.chatId,
              `🎉 *¡Fin de semana, ${miembro.trelloName}!*\n\nSemana cerrada. Buen trabajo.\nEl lunes a las 9:00 AM te escribiré para el próximo standup. ¡Descansa! 💪`,
              { parse_mode: 'Markdown' }
            );
          } catch (e) {
            console.error(`Error notificando a ${miembro.trelloName}:`, e.message);
          }
        }
      }
    } catch (error) {
      console.error('Error en resumen semanal:', error);
    }
  }

  // ══════════════════════════════════════════════════════
  // CICLO 6 — ACTUALIZACIÓN DE BURNDOWN (23:59 — Todos los días)
  // Registra el número de tareas pendientes para el gráfico histórico.
  // ══════════════════════════════════════════════════════
  @Cron('59 23 * * *')
  async actualizarBurndown() {
    console.log('📉 Actualizando registro de burndown histórico...');
    try {
      const metrics = await this.trelloService.getMetrics();
      const pendientes = metrics.total;
      const burndownPath = path.join(process.cwd(), 'burndown.json');
      let data: any[] = [];
      if (fs.existsSync(burndownPath)) {
        data = JSON.parse(fs.readFileSync(burndownPath, 'utf-8'));
      }
      const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      const index = data.findIndex(d => d.fecha === hoy);
      if (index !== -1) {
        data[index].pendientes = pendientes;
      } else {
        data.push({ fecha: hoy, pendientes });
      }
      if (data.length > 15) data.shift();
      fs.writeFileSync(burndownPath, JSON.stringify(data, null, 2));
      console.log(`✅ Burndown actualizado: ${hoy} -> ${pendientes} tareas.`);
    } catch (error) {
      console.error('Error actualizando burndown:', error);
    }
  }

  private escapeMarkdown(text: string): string {
    // Escapa solo caracteres que rompen el Markdown pero permite * para negritas y _ para cursivas
    return text.replace(/([\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}