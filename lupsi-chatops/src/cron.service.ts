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
  private bot: Telegraf;

  constructor(
    private readonly aiService: AiService,
    private readonly pdfService: PdfService,
    private readonly autonomyService: AutonomyService,
    private readonly botService: BotService,
    private readonly trelloService: TrelloService,
    private readonly docsService: DocsService,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);
  }

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

    for (const miembro of equipo) {
      try {
        await this.bot.telegram.sendMessage(
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

    await this.bot.telegram.sendMessage(
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

      await this.bot.telegram.sendMessage(
        chatId,
        this.escapeMarkdown(`☀️ *Resumen del Standup — ${new Date().toLocaleDateString('es-ES')}*\n\n${result.text}${resumenEquipo}`),
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

      await this.bot.telegram.sendMessage(
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

      await this.bot.telegram.sendMessage(
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
      await this.bot.telegram.sendMessage(chatId, '🔔 LUPSI iniciando auditoría de cierre de día...');

      // 1) REPORTE EJECUTIVO (PDF con gráficos)
      const promptReporte = `Actúa como PM experto para SKT Software Solution (Software, Knowledge, and Trust). 
Genera un REPORTE DE ESTADO DEL PROYECTO PROFESIONAL en ESPAÑOL con estas secciones EXACTAS:

ESTADO GENERAL:
[Escribe exactamente el color del semáforo (VERDE, AMARILLO, ROJO) y una justificación breve en la misma línea].

1. RESUMEN EJECUTIVO:
[Incluye una lista de los Top 3 Hitos Alcanzados y una lista de Bloqueos Actuales].

2. ANÁLISIS DE FLUJO DE TRABAJO:
[Métricas del Periodo: Tareas Planificadas, Completadas y Pasadas.
Distribución de Carga: Una lista por miembro indicando Rol, Miembro, Estado de Carga (Normal/Sobrecargado) y Tareas (Activas/Pendientes)].

3. SALUD DEL CÓDIGO Y REPOSITORIO:
[Métricas de PRs (Abiertos/Fusionados), Issues (Reportados/Resueltos) y Estado de Ramas (Main/Develop)].

4. AUDITORÍA DE DOCUMENTACIÓN:
[Lista de documentos principales (Diccionario de Datos, API Endpoints, Manual de Despliegue). Formato: Documento | Estado | Acción].

5. MATRIZ DE RIESGOS:
[Lista de riesgos. Formato: Riesgo | Impacto | Mitigación | Responsable].

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

      await this.bot.telegram.sendDocument(
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
          await this.bot.telegram.sendMessage(
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
        `Eres LUPSI, Senior PM autónomo. ESPAÑOL.
Revisa el tablero, los commits y la base de conocimiento del proyecto.
¿Hay algún cuello de botella o riesgo que requiera una acción en Trello o GitHub?
Si sí, genera <accion> JSON con la herramienta correspondiente.
Si afecta a un miembro específico, incluye "notifyMember" con su nombre de Trello.
Explica tu razón en la <respuesta> de forma muy concisa.`
      );

      const actions = (resultDecision as any).actions || [];
      if (actions.length > 0) {
        const primaryAction = actions[0];
        const actionId = this.autonomyService.saveDecision(primaryAction);

        // Guardar en historial
        const historialPath = path.join(process.cwd(), 'historial.txt');
        fs.appendFileSync(historialPath, `\n[${new Date().toLocaleDateString('es-ES')}] PROPUESTA: ${resultDecision.text}\n`);

        await this.bot.telegram.sendMessage(
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
        await this.bot.telegram.sendMessage(chatId, `✅ Sin acciones estratégicas pendientes por hoy. ¡Buen trabajo equipo!`);
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

      await this.bot.telegram.sendMessage(
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
            await this.bot.telegram.sendMessage(
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
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}