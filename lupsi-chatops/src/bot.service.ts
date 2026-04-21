import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf, Input, Markup } from 'telegraf';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { ManagerService } from './manager.service';
import { AiService } from './ai.service';
import { PdfService } from './pdf.service';
import { DocsService } from './docs.service';
import { AutonomyService } from './autonomy.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BotService implements OnModuleInit {
  private bot: Telegraf;

  // Decisiones en espera de aprobación (en memoria, se borran al aprobar/rechazar)
  private pendingActions: Map<string, any> = new Map();

  // Estado de standup por usuario: chatId → 'waiting' | 'done'
  private standupState: Map<string, boolean> = new Map();

  // Estado para capturar motivos de rechazo: chatId → actionId o detalle de decisión
  private rejectionState: Map<string, any> = new Map();

  constructor(
    private readonly trelloService: TrelloService,
    private readonly githubService: GithubService,
    private readonly managerService: ManagerService,
    private readonly aiService: AiService,
    private readonly pdfService: PdfService,
    private readonly docsService: DocsService,
    private readonly autonomyService: AutonomyService,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);
  }

  onModuleInit() {

    // ── /start ───────────────────────────────────────────────────────────────
    this.bot.start((ctx) => {
      ctx.reply(
        '👋 ¡Hola! Soy *LUPSI*, tu Agente Autónomo de Gestión de Proyectos.\n\n' +
        'Trabajo 24/7 monitoreando el proyecto. Escribe */ayuda* para ver todo lo que puedo hacer.',
        { parse_mode: 'Markdown' }
      );
    });

    // ── /ayuda ───────────────────────────────────────────────────────────────
    this.bot.command('ayuda', (ctx) => {
      ctx.reply(
        '🤖 *Comandos de LUPSI*\n\n' +
        '📊 *Información del Proyecto*\n' +
        '/estado — Estado actual del tablero Trello\n' +
        '/github — Últimos commits y actividad\n' +
        '/analisis — Análisis de salud del proyecto\n' +
        '/contexto — Sprint activo y documentos cargados\n\n' +
        '📄 *Reportes y Análisis*\n' +
        '/reporte — Genera un reporte PDF ejecutivo\n' +
        '/codigo — Análisis técnico del repositorio (3 mensajes)\n\n' +
        '⚙️ *Gestión*\n' +
        '/agente — Motor de decisiones con aprobación humana\n' +
        '/sprint — Actualizar el sprint activo\n' +
        '/vincular — Vincular tu Telegram con Trello\n' +
        '/recargar — Recargar base de conocimiento (PDFs y docs)\n\n' +
        '💬 *Chat Libre*\n' +
        'Escríbeme cualquier pregunta sobre el proyecto y te respondo.\n\n' +
        '🕐 *Ciclos Autónomos (sin que me lo pidas)*\n' +
        '• 08:00 — Alertas de vencimiento (datos reales)\n' +
        '• 09:00 — Standup matutino al equipo\n' +
        '• 10:00 — Resumen del standup + watchdog de bloqueos\n' +
        '• 12:00 — Segunda revisión de bloqueos\n' +
        '• 23:30 — Reporte PDF + análisis de código + propuesta de acción\n' +
        '• Viernes 17:00 — Resumen semanal al equipo',
        { parse_mode: 'Markdown' }
      );
    });

    // ── /estado ──────────────────────────────────────────────────────────────
    this.bot.command('estado', async (ctx) => {
      const msg = await ctx.reply('⏳ Consultando el tablero de Trello...');
      try {
        const reporte = await this.trelloService.getBoardState();
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
        ctx.reply(this.safe(reporte), { parse_mode: 'Markdown' });
      } catch (e) {
        ctx.reply('❌ No pude conectar con Trello. Verifica las credenciales.');
      }
    });

    // ── /github ──────────────────────────────────────────────────────────────
    this.bot.command('github', async (ctx) => {
      const msg = await ctx.reply('⏳ Obteniendo actividad de GitHub...');
      try {
        const res = await this.githubService.getLatestCommits();
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
        ctx.reply(this.safe(res), { parse_mode: 'Markdown' });
      } catch (e) {
        ctx.reply('❌ No pude conectar con GitHub. Verifica el token.');
      }
    });

    // ── /analisis ────────────────────────────────────────────────────────────
    this.bot.command('analisis', async (ctx) => {
      const msg = await ctx.reply('🔍 Analizando la salud del proyecto...');
      try {
        const health = await this.managerService.getHealthCheck();
        const trello = await this.trelloService.getBoardState();
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
        ctx.reply(this.safe(`${health}${trello}`), { parse_mode: 'Markdown' });
      } catch (e) {
        ctx.reply('❌ Error al realizar el análisis.');
      }
    });

    // ── /recargar ────────────────────────────────────────────────────────────
    this.bot.command('recargar', (ctx) => {
      this.docsService.clearCache();
      ctx.reply('🔄 Base de conocimiento recargada. Los PDFs y documentos serán releídos en la próxima consulta.');
    });

    // ── /vincular ────────────────────────────────────────────────────────────
    this.bot.command('vincular', async (ctx) => {
      const trelloName = ctx.message.text.replace('/vincular', '').trim().replace(/"/g, '');
      if (!trelloName) {
        return ctx.reply('❌ Uso: /vincular Tu Nombre En Trello');
      }
      const chatId = ctx.chat.id.toString();
      const equipoPath = path.join(process.cwd(), 'equipo.json');
      let equipo: any[] = [];
      if (fs.existsSync(equipoPath)) {
        equipo = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));
      }
      equipo = equipo.filter(m => m.chatId !== chatId);
      equipo.push({ trelloName, chatId, nombre: ctx.from?.first_name || trelloName });
      fs.writeFileSync(equipoPath, JSON.stringify(equipo, null, 2));
      ctx.reply(`✅ ¡Vinculado! Te reconoceré como *${trelloName}* y podré enviarte alertas y el standup directamente.`, { parse_mode: 'Markdown' });
    });

    // ── /sprint ──────────────────────────────────────────────────────────────
    this.bot.command('sprint', async (ctx) => {
      const texto = ctx.message.text.replace('/sprint', '').trim();
      if (!texto) {
        return ctx.reply(
          '📋 *Uso del comando /sprint:*\n\n' +
          '`/sprint "Nombre" | inicio:YYYY-MM-DD | fin:YYYY-MM-DD | objetivo:"Descripción"`\n\n' +
          '_Ejemplo:_\n`/sprint "Sprint 4" | inicio:2026-04-18 | fin:2026-05-02 | objetivo:"Módulo de pagos"`',
          { parse_mode: 'Markdown' }
        );
      }
      try {
        const conocimientoPath = path.join(process.cwd(), 'conocimiento.json');
        const c = JSON.parse(fs.readFileSync(conocimientoPath, 'utf-8'));
        const m1 = texto.match(/^"([^"]+)"/);
        const m2 = texto.match(/inicio:(\d{4}-\d{2}-\d{2})/);
        const m3 = texto.match(/fin:(\d{4}-\d{2}-\d{2})/);
        const m4 = texto.match(/objetivo:"([^"]+)"/);
        if (m1) c.sprint_actual = m1[1];
        if (m2) c.fecha_inicio = m2[1];
        if (m3) c.fecha_fin = m3[1];
        if (m4) c.objetivo_principal = m4[1];
        fs.writeFileSync(conocimientoPath, JSON.stringify(c, null, 2));
        this.docsService.clearCache();
        this.logHistorial('SPRINT ACTUALIZADO', `${c.sprint_actual} | Fin: ${c.fecha_fin} | Obj: ${c.objetivo_principal}`);
        ctx.reply(
          `✅ *Sprint actualizado:*\n\n📌 *${c.sprint_actual}*\n📅 ${c.fecha_inicio} → ${c.fecha_fin}\n🎯 ${c.objetivo_principal}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        ctx.reply('❌ Error al actualizar el sprint. Revisa el formato.');
      }
    });

    // ── /sincronizar — Sincronizar metadatos desde PDFs ─────────────────────
    this.bot.command('sincronizar', async (ctx) => {
      await ctx.reply('🔄 Analizando documentos de planificación para sincronizar metadatos...');
      try {
        await this.docsService.syncMetadataWithAI();
        ctx.reply('✅ Sincronización completada. Usa /contexto para ver los cambios.');
      } catch (e) {
        ctx.reply('❌ Error al sincronizar metadatos desde los documentos.');
      }
    });

    // ── /contexto — Ver el sprint y documentos activos ───────────────────────
    this.bot.command('contexto', (ctx) => {
      try {
        const conocimientoPath = path.join(process.cwd(), 'conocimiento.json');
        const c = JSON.parse(fs.readFileSync(conocimientoPath, 'utf-8'));
        const docs = this.docsService.getDocumentList();
        const diasRestantes = Math.max(0, Math.round(
          (new Date(c.fecha_fin).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        ));
        ctx.reply(
          this.safe(`📌 *Contexto Activo de LUPSI*\n\n` +
          `🗓 *Sprint:* ${c.sprint_actual}\n` +
          `📅 *Inicio:* ${c.fecha_inicio}\n` +
          `📅 *Fin:* ${c.fecha_fin}\n` +
          `⏳ *Días restantes:* ${diasRestantes}\n` +
          `🎯 *Objetivo:* ${c.objetivo_principal}\n\n` +
          `⚠️ *Riesgos conocidos:*\n${c.riesgos_conocidos || 'Ninguno listado'}\n\n` +
          `📚 *Documentos en base de conocimiento:*\n${docs || 'Ninguno cargado'}`),
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        ctx.reply('❌ No pude leer el contexto del proyecto. Revisa `conocimiento.json`.');
      }
    });

    // ── /codigo ──────────────────────────────────────────────────────────────
    this.bot.command('codigo', async (ctx) => {
      const chatId = ctx.chat.id;
      await ctx.reply('🔍 Analizando el repositorio... recibirás 3 mensajes separados. Un momento ⏳');
      (async () => {
        try {
          const estructura = await this.githubService.getRepoStructure();
          const base = `Eres LUPSI, PM autónomo. SIEMPRE en ESPAÑOL. Repositorio:\n\n${estructura}\n\n`;
          const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

          const r1 = await this.aiService.chatWithAgent(base + `Identifica MÁXIMO 4 problemas de código urgentes. Formato por ítem: Archivo → Problema → Solución. Muy conciso.`);
          await ctx.telegram.sendMessage(chatId, this.safe(`⚡ *OPTIMIZACIONES DE CÓDIGO*\n\n${r1.text}`), { parse_mode: 'Markdown' });
          await delay(2000);

          const r2 = await this.aiService.chatWithAgent(base + `Propón 4 pruebas de software prioritarias que faltan. Formato: Tipo (U/I/E2E) → Qué prueba → Por qué es urgente.`);
          await ctx.telegram.sendMessage(chatId, this.safe(`🧪 *PRUEBAS SUGERIDAS*\n\n${r2.text}`), { parse_mode: 'Markdown' });
          await delay(2000);

          const r3 = await this.aiService.chatWithAgent(base + `Identifica 3 puntos de deuda técnica urgente. Formato: Problema → Impacto → Esfuerzo (Bajo/Medio/Alto).`);
          await ctx.telegram.sendMessage(chatId, this.safe(`🔧 *DEUDA TÉCNICA*\n\n${r3.text}`), { parse_mode: 'Markdown' });
        } catch (e) {
          await ctx.telegram.sendMessage(chatId, '❌ Error al analizar el código.');
        }
      })();
    });

    // ── /reporte ─────────────────────────────────────────────────────────────
    this.bot.command('reporte', async (ctx) => {
      const loadingMsg = await ctx.reply('📄 Generando tu reporte ejecutivo... te lo envío en cuanto esté listo 🔄');
      const chatId = ctx.chat.id;
      (async () => {
        try {
          const prompt = `Actúa como PM experto para SKT Software Solution (Software, Knowledge, and Trust). 
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

          const [result, metrics] = await Promise.all([
            this.aiService.chatWithAgent(prompt),
            this.trelloService.getMetrics(),
          ]);
          
          console.log('📄 REPORT AI RESPONSE:', result.text.substring(0, 200) + '...');

          // Añadir datos de burndown si existen
          const burndownPath = path.join(process.cwd(), 'burndown.json');
          if (fs.existsSync(burndownPath)) {
            metrics.burndown = JSON.parse(fs.readFileSync(burndownPath, 'utf-8'));
          }

          const pdfBuffer = await this.pdfService.generateReport(result.text, metrics);
          await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
          await ctx.telegram.sendDocument(
            chatId,
            Input.fromBuffer(pdfBuffer, `Reporte_LUPSI_${new Date().toISOString().split('T')[0]}.pdf`),
            { caption: '✅ Reporte ejecutivo generado por LUPSI.' }
          );
        } catch (e) {
          console.error('Error generando reporte:', e);
          await ctx.telegram.sendMessage(chatId, '❌ Error al generar el reporte. Intenta de nuevo.');
        }
      })();
    });

    // ── /agente — Motor de decisiones con Human-in-the-Loop ──────────────────
    this.bot.command('agente', async (ctx) => {
      const msg = await ctx.reply('🤖 Analizando el tablero en profundidad...');
      try {
        const trelloTopology = await this.trelloService.getBoardTopologyForAI();
        const githubWorkload = await this.githubService.getLatestCommits();
        const aiResponse = await this.aiService.analyzeAndDecideTasks(trelloTopology, githubWorkload);
        const decisiones = aiResponse.decisiones || [];
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});

        if (decisiones.length === 0) {
          return ctx.reply('✅ Analicé el proyecto en detalle. Todo marcha correctamente, no hay acciones recomendadas en este momento.');
        }

        await ctx.reply(this.safe(`🚨 Detecté *${decisiones.length}* acción(es) que podrían mejorar el proyecto. Presento cada una para tu aprobación:`), { parse_mode: 'Markdown' });

        for (const decision of decisiones) {
          const actionId = Math.random().toString(36).substring(2, 10);
          this.pendingActions.set(actionId, decision);
          const texto = `📌 *ACCIÓN PROPUESTA*\n*Tipo:* ${decision.tipo}\n*Justificación:* ${decision.rationale}\n\n¿Ejecuto esta acción?`;
          await ctx.reply(this.safe(texto), {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Aprobar', `approve_${actionId}`)],
              [Markup.button.callback('❌ Rechazar', `reject_${actionId}`)],
            ]),
          });
        }
      } catch (e) {
        console.error('Error en /agente:', e);
        ctx.reply('❌ Error al procesar las decisiones del agente.');
      }
    });

    // ── Callbacks de aprobación/rechazo ──────────────────────────────────────
    this.bot.action(/^approve_(.+)$/, async (ctx) => {
      const actionId = ctx.match[1];
      const decision = this.pendingActions.get(actionId);
      if (!decision) {
        await ctx.answerCbQuery('Esta acción ya fue procesada o expiró.', { show_alert: true });
        return ctx.editMessageText('❌ Acción expirada o ya procesada.').catch(() => {});
      }
      await ctx.answerCbQuery('Ejecutando...');
      const result = await this.executeDecision(decision);
      if (result.success) {
        this.pendingActions.delete(actionId);
        this.logHistorial('APROBADO', `${decision.tool || decision.tipo} — ${decision.rationale || ''}`);
        await ctx.editMessageText(this.safe(`✅ *Ejecutado correctamente.*\nAcción: ${decision.tool || decision.tipo}`), { parse_mode: 'Markdown' });
      } else {
        await ctx.editMessageText('⚠️ *Fallo al ejecutar la acción.* Analizando el problema...', { parse_mode: 'Markdown' });
        const prompt = `La ejecución de la herramienta ${decision.tool || decision.tipo} falló con este error:\n${result.message}\n\nAnaliza la situación. Si es un error de parámetros (como un nombre de miembro mal escrito), corrígelo. 
        Si propones una acción técnica, DEBES usar la etiqueta <accion>.`;
        const aiResponse = await this.aiService.chatWithAgent(prompt, ctx.chat?.id.toString());
        await ctx.reply(this.safe(`🛠️ *LUPSI Self-Healing:*\n\n${aiResponse.text}`), { parse_mode: 'Markdown' });
        
        const healingActions = (aiResponse as any).actions || [];
        if (healingActions.length > 0) {
           const primaryHealingAction = healingActions[0];
           this.pendingActions.set(actionId, primaryHealingAction); // Reutilizar ID
           await ctx.reply(this.safe(`¿Ejecuto esta nueva acción correctiva? (${primaryHealingAction.tool || primaryHealingAction.tipo})`), {
             parse_mode: 'Markdown',
             ...Markup.inlineKeyboard([[Markup.button.callback('✅ Confirmar', `approve_${actionId}`)], [Markup.button.callback('❌ Cancelar', `reject_${actionId}`)]])
           });
        }
      }
    });

    this.bot.action(/^reject_(.+)$/, async (ctx) => {
      const actionId = ctx.match[1];
      const decision = this.pendingActions.get(actionId);
      this.pendingActions.delete(actionId);
      this.autonomyService.deleteDecision(actionId);
      await ctx.answerCbQuery('Acción rechazada.');
      this.logHistorial('RECHAZADO', `ID: ${actionId}`);
      await ctx.editMessageText('❌ *Acción rechazada por el PM.*', { parse_mode: 'Markdown' });
      
      // Activar estado de aprendizaje activo
      this.rejectionState.set(ctx.chat?.id.toString() || 'unknown', decision || { id: actionId });
      await ctx.reply('🧠 Si deseas que aprenda de este rechazo, responde a este mensaje explicando el motivo. (Si no, simplemente ignóralo)');
    });

    this.bot.action(/^approve_auto_(.+)$/, async (ctx) => {
      const id = ctx.match[1];
      const pending = this.autonomyService.getPendingDecisions();
      const decision = pending.find(d => d.id === id);
      if (!decision) return ctx.answerCbQuery('Esta decisión ya no está pendiente.');
      await ctx.answerCbQuery('Ejecutando...');
      const result = await this.executeDecision(decision);
      if (result.success) {
        this.autonomyService.deleteDecision(id);
        this.logHistorial('APROBADO MANUAL', `${decision.tool || 'acción'}`);
        await ctx.editMessageText('✅ *Decisión aprobada y ejecutada.* Registrada en el historial.', { parse_mode: 'Markdown' });
      } else {
        await ctx.editMessageText('⚠️ *Fallo al ejecutar la acción.* Analizando el problema...', { parse_mode: 'Markdown' });
        const prompt = `La ejecución de la herramienta ${decision.tool || decision.tipo} falló con este error:\n${result.message}\n\nAnaliza la situación. Si es un error de parámetros (como un nombre de miembro mal escrito), corrígelo. 
        Si propones una acción técnica, DEBES usar la etiqueta <accion>.`;
        const aiResponse = await this.aiService.chatWithAgent(prompt, ctx.chat?.id.toString());
        await ctx.reply(this.safe(`🛠️ *LUPSI Self-Healing:*\n\n${aiResponse.text}`), { parse_mode: 'Markdown' });
      }
    });

    this.bot.action(/^reject_auto_(.+)$/, async (ctx) => {
      const id = ctx.match[1];
      const pending = this.autonomyService.getPendingDecisions();
      const decision = pending.find(d => d.id === id);
      this.autonomyService.deleteDecision(id);
      await ctx.answerCbQuery('Rechazado.');
      this.logHistorial('RECHAZADO', `ID autónomo: ${id}`);
      await ctx.editMessageText('❌ *Acción rechazada.* Eliminada de la cola.', { parse_mode: 'Markdown' });

      // Activar estado de aprendizaje activo
      this.rejectionState.set(ctx.chat?.id.toString() || 'unknown', decision || { id });
      await ctx.reply('🧠 Si deseas que aprenda de este rechazo, responde a este mensaje explicando el motivo. (Si no, simplemente ignóralo)');
    });

    // ── Listener de texto: Chat IA + procesamiento de standup ─────────────────
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      const chatId = ctx.chat.id.toString();

      // Si el usuario está en modo standup, guardar su respuesta
      if (this.standupState.get(chatId)) {
        this.standupState.delete(chatId);
        const standupPath = path.join(process.cwd(), 'standup_hoy.json');
        let standup: any[] = [];
        if (fs.existsSync(standupPath)) standup = JSON.parse(fs.readFileSync(standupPath, 'utf-8'));

        const equipoPath = path.join(process.cwd(), 'equipo.json');
        let nombre = 'Miembro';
        if (fs.existsSync(equipoPath)) {
          const equipo = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));
          const miembro = equipo.find(m => m.chatId === chatId);
          if (miembro) nombre = miembro.trelloName;
        }

        standup = standup.filter(s => s.chatId !== chatId);
        standup.push({ chatId, nombre, respuesta: ctx.message.text, hora: new Date().toISOString() });
        fs.writeFileSync(standupPath, JSON.stringify(standup, null, 2));

        return ctx.reply('✅ ¡Gracias! Registré tu actualización del día. ¡Éxito con tus tareas! 💪');
      }

      // Si el usuario está dando un motivo de rechazo
      if (this.rejectionState.has(chatId)) {
        const decisionRejected = this.rejectionState.get(chatId);
        this.rejectionState.delete(chatId);
        
        const conocimientoPath = path.join(process.cwd(), 'conocimiento.json');
        try {
          const c = JSON.parse(fs.readFileSync(conocimientoPath, 'utf-8'));
          if (!c.reglas_aprendidas) c.reglas_aprendidas = [];
          
          c.reglas_aprendidas.push({
            fecha: new Date().toISOString().split('T')[0],
            accion_rechazada: decisionRejected.tool || decisionRejected.tipo || 'Acción desconocida',
            motivo: ctx.message.text
          });
          
          fs.writeFileSync(conocimientoPath, JSON.stringify(c, null, 2));
          return ctx.reply('🧠 ¡Entendido! He guardado esta regla en mi base de conocimiento. La tendré en cuenta para mis futuras decisiones.');
        } catch (e) {
          console.error('Error guardando regla:', e);
          return ctx.reply('⚠️ Lo siento, no pude guardar la regla en conocimiento.json.');
        }
      }

      // Chat normal con la IA
      const thinkingMsg = await ctx.reply('🧠 Analizando...');
      const result = await this.aiService.chatWithAgent(ctx.message.text, chatId);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
      await ctx.reply(this.safe(result.text), { parse_mode: 'Markdown' });

      // ── Detección proactiva de tarjeta mencionada ─────────────────────────
      // Si el mensaje contiene palabras clave de búsqueda de tarea, intentar 
      // encontrarla y enviar su link + adjuntos automáticamente
      const msgLower = ctx.message.text.toLowerCase();
      const buscaTarea = /tarea|card|tarjeta|ticket|historia|entregable|adjunto|archivo/i.test(ctx.message.text);

      if (buscaTarea) {
        // Extraer posible nombre de tarea del mensaje o de la respuesta de la IA
        // Buscar patrones como "tarea X", "la tarea 'X'", comillas, etc.
        const patronesBusqueda = [
          /tarea\s+"([^"]+)"/i,
          /tarea\s+'([^']+)'/i,
          /tarea\s+([\w\s]{3,40}?)(?:\s*\?|$|\.|,)/i,
          /card\s+"([^"]+)"/i,
          /"([^"]{3,50})"/,
          /'([^']{3,50})'/,
        ];

        let terminoBusqueda: string | null = null;
        for (const patron of patronesBusqueda) {
          const match = ctx.message.text.match(patron);
          if (match?.[1]) { terminoBusqueda = match[1].trim(); break; }
        }

        if (terminoBusqueda) {
          await this.enviarDetallesTarjeta(ctx, terminoBusqueda);
        }
      }

      // Si la IA también solicitó GET_CARD_DETAILS como acción
      const actions = (result as any).actions || [];
      const getCardAction = actions.find(a => a.tool === 'GET_CARD_DETAILS');
      if (getCardAction) {
        await this.enviarDetallesTarjeta(ctx, getCardAction.args?.searchTerm || '');
      }

      if (actions.length > 0) {
        for (const action of actions) {
          if (action.tool === 'GET_CARD_DETAILS') continue; // Ya manejado arriba
          
          const actionId = Math.random().toString(36).substring(2, 10);
          this.pendingActions.set(actionId, action);
          
          let detail = '';
          if (action.tool === 'NOTIFY_MEMBER') {
            const dest = action.args?.trelloNames || action.args?.trelloName || action.args?.name || 'Equipo';
            detail = `\nPara: *${dest}*`;
          }

          const toolName = action.tool || action.tipo || 'acción';
          await ctx.reply(
            this.safe(`🤖 *Acción requerida*\nDeseo ejecutar: *${toolName}*${detail}\n¿Autorizas esta operación?`),
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar', `approve_${actionId}`)],
                [Markup.button.callback('❌ Cancelar', `reject_${actionId}`)],
              ]),
            }
          );
        }
      }
    });

    this.bot.launch();
    console.log('🤖 Agente LUPSI conectado a Telegram exitosamente...');
  }

  // ── Activar modo standup para un usuario ────────────────────────────────
  activarModoStandup(chatId: string) {
    this.standupState.set(chatId, true);
    setTimeout(() => this.standupState.delete(chatId), 2 * 60 * 60 * 1000);
  }

  // ── Buscar tarjeta y enviar detalles + adjuntos al chat ──────────────────
  async enviarDetallesTarjeta(ctx: any, searchTerm: string) {
    if (!searchTerm?.trim()) return;
    const chatId = ctx.chat.id;

    try {
      const detalles = await this.trelloService.getCardDetails(searchTerm);

      if (!detalles.found || !detalles.card) {
        // Silencioso si no se encuentra — no interrumpir el flujo normal
        return;
      }

      const { card, url, attachments } = detalles;

      // Mensaje con info de la tarjeta
      const info =
        `📌 *${card.nombre}*\n` +
        `📂 Lista: ${card.lista}\n` +
        `👤 Asignado a: ${card.asignados}\n` +
        `📅 Vencimiento: ${card.vencimiento} | Completada: ${card.completada}\n` +
        `🏷 Etiquetas: ${card.labels}\n\n` +
        `📝 *Descripción:*\n${card.descripcion.substring(0, 500)}\n\n` +
        `🔗 [Ver en Trello](${url})`;

      await ctx.telegram.sendMessage(chatId, this.safe(info), {
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      });

      // Enviar adjuntos
      if (attachments && attachments.length > 0) {
        await ctx.telegram.sendMessage(chatId, `📎 *Adjuntos de esta tarjeta (${attachments.length}):*`, { parse_mode: 'Markdown' });

        for (const att of attachments.slice(0, 5)) { // máx 5 adjuntos
          if (att.esArchivo && att.url) {
            // Es un archivo subido a Trello — enviarlo directamente por URL
            try {
              await ctx.telegram.sendDocument(chatId, att.url, {
                caption: `📄 ${att.nombre}`,
              });
            } catch (e) {
              // Si Telegram no puede descargar directamente, enviar el link
              await ctx.telegram.sendMessage(chatId,
                this.safe(`📄 *${att.nombre}*\n🔗 [Descargar](${att.url})`),
                { parse_mode: 'Markdown' }
              );
            }
          } else {
            // Es un link externo
            await ctx.telegram.sendMessage(chatId,
              this.safe(`🔗 *${att.nombre}*\n${att.url}`),
              { parse_mode: 'Markdown' }
            );
          }
        }

        if (attachments.length > 5) {
          await ctx.telegram.sendMessage(chatId,
            `_...y ${attachments.length - 5} adjunto(s) más. Ver todos en Trello: ${url}_`,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        await ctx.telegram.sendMessage(chatId, '_Esta tarjeta no tiene adjuntos._', { parse_mode: 'Markdown' });
      }

    } catch (e) {
      console.error('Error enviando detalles de tarjeta:', e.message);
    }
  }

  // ── Ejecución de decisiones (Trello / GitHub) ────────────────────────────
  async executeDecision(decision: any): Promise<{success: boolean, message?: string}> {
    console.log('🤖 LUPSI EJECUTANDO ACCIÓN:', JSON.stringify(decision, null, 2));
    try {
      const { tool, args, cardId, memberId, targetListId, tipo } = decision;
      if (tipo === 'MOVE_CARD' || tool === 'MOVE_CARD') {
        await this.trelloService.moveCard(cardId || args?.cardId, targetListId || args?.listId);
      } else if (tipo === 'REASSIGN_CARD' || tool === 'ASSIGN_USER') {
        await this.trelloService.assignUser(cardId || args?.cardId, memberId || args?.memberId);
      } else if (tool === 'CREATE_CARD') {
        await this.trelloService.createCard(args.listId, args.name, args.desc, args.idMembers, args.idLabels, args.due, args.start);
      } else if (tool === 'ADD_COMMENT') {
        await this.trelloService.addComment(args.cardId, args.text);
      } else if (tool === 'CREATE_ISSUE') {
        await this.githubService.createIssue(args.title, args.body);
      } else if (tool === 'NOTIFY_MEMBER') {
        const nombresRaw = args.trelloNames || args.trelloName || args.name || args.member || '';
        const texto = args.text || args.message;
        
        // Si hay múltiples nombres separados por coma
        const listaNombres = nombresRaw.split(',').map(n => n.trim()).filter(n => n.length > 0);
        
        let alMenosUnoEnviado = false;
        let errores: string[] = [];

        for (const nombre of listaNombres) {
          const successNotify = await this.notifyMember(nombre, texto);
          if (successNotify) {
            alMenosUnoEnviado = true;
          } else {
            errores.push(nombre);
          }
        }

        if (!alMenosUnoEnviado && listaNombres.length > 0) {
          throw new Error(`No se pudo encontrar a ninguno de los miembros especificados: ${errores.join(', ')}`);
        }
        
        if (errores.length > 0) {
          return { success: true, message: `Enviado a algunos, pero no se encontró a: ${errores.join(', ')}` };
        }
      } else {
        return { success: false, message: `Herramienta desconocida: ${tool || tipo}` };
      }
      return { success: true };
    } catch (e) {
      console.error('Error ejecutando decisión:', e.message);
      return { success: false, message: e.message };
    }
  }

  // ── Notificaciones ────────────────────────────────────────────────────────
  async notifyAdmin(text: string) {
    const adminChatId = process.env.TELEGRAM_CHAT_ID;
    if (adminChatId) {
      await this.bot.telegram.sendMessage(adminChatId, this.safe(text), { parse_mode: 'Markdown' }).catch(console.error);
    }
  }

  async notifyMember(trelloName: string, text: string): Promise<boolean> {
    const equipoPath = path.join(process.cwd(), 'equipo.json');
    if (!fs.existsSync(equipoPath)) return false;
    const equipo = JSON.parse(fs.readFileSync(equipoPath, 'utf-8'));
    
    // Búsqueda flexible: por coincidencia exacta, parcial o insensible a mayúsculas
    const nameLower = trelloName.toLowerCase();
    const member = equipo.find(m => 
      m.trelloName === trelloName || 
      m.trelloName.toLowerCase().includes(nameLower) ||
      nameLower.includes(m.trelloName.toLowerCase())
    );
    
    if (!member) return false;
    await this.bot.telegram.sendMessage(member.chatId, this.safe(text), { parse_mode: 'Markdown' }).catch(console.error);
    return true;
  }

  async notifyMemberStandup(chatId: string, mensaje: string) {
    await this.bot.telegram.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' }).catch(console.error);
  }

  getBotInstance(): Telegraf {
    return this.bot;
  }

  // ── Historial estructurado ────────────────────────────────────────────────
  logHistorial(tipo: string, detalle: string) {
    const historialPath = path.join(process.cwd(), 'historial.txt');
    const fecha = new Date().toLocaleString('es-ES');
    const linea = `[${fecha}] [${tipo}] ${detalle}\n`;
    fs.appendFileSync(historialPath, linea);
  }

  // ── Escape Markdown seguro ────────────────────────────────────────────────
  // Escapa solo caracteres que rompen el parse_mode Markdown de Telegram
  private safe(text: string): string {
    if (!text) return '';
    let t = text;
    // Truncar si supera límite de Telegram
    if (t.length > 3900) {
      t = t.substring(0, 3900) + '\n\n_[Mensaje truncado]_';
    }
    
    // Escapar guiones bajos siempre (causan muchos problemas con Markdown V1)
    // exceptuando si ya están escapados
    t = t.replace(/(?<!\\)_/g, '\\_');
    
    // No escapar asteriscos si vienen en pareja (para negritas)
    // Solo escapar si hay un número impar de asteriscos en el mensaje (muy básico)
    const asteriskCount = (t.match(/\*/g) || []).length;
    if (asteriskCount % 2 !== 0) {
      t = t.replace(/\*/g, '\\*');
    }

    return t;
  }
}