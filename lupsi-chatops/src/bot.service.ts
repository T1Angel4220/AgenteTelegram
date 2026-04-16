import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf, Input, Markup } from 'telegraf';import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { ManagerService } from './manager.service';
import { AiService } from './ai.service';
import { PdfService } from './pdf.service';
import { DocsService } from './docs.service';


@Injectable()
export class BotService implements OnModuleInit {
  private bot: Telegraf;
  // Almacena temporalmente las decisiones pendientes de aprobación
  // Clave: ID corto de la acción (ej. acta1b2), Valor: Objeto con la decisión
  private pendingActions: Map<string, any> = new Map();

  constructor(
    private readonly trelloService: TrelloService,
    private readonly githubService: GithubService,
    private readonly managerService: ManagerService,
    private readonly aiService: AiService,
    private readonly pdfService: PdfService,
    private readonly docsService: DocsService
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);
  }

  onModuleInit() {
    this.bot.start((ctx) => {
      ctx.reply('¡Hola, Gestor del Proyecto Lupsi: Angel! Soy tu Agente LUPSI. Sistema ChatOps iniciado y a la espera de tus órdenes. 🚀');
    });

    this.bot.command('estado', async (ctx) => {
      ctx.reply('⏳ Consultando el tablero de Trello...');
      const reporte = await this.trelloService.getBoardState();
      ctx.reply(this.escapeMarkdown(reporte), { parse_mode: 'Markdown' });
    });

    this.bot.command('github', async (ctx) => {
      const res = await this.githubService.getLatestCommits();
      ctx.reply(this.escapeMarkdown(res), { parse_mode: 'Markdown' });
    });

    this.bot.command('analisis', async (ctx) => {
      ctx.reply('🧐 Analizando la salud del proyecto...');
      const health = await this.managerService.getHealthCheck();
      const trello = await this.trelloService.getBoardState();
      ctx.reply(this.escapeMarkdown(`${health}${trello}`), { parse_mode: 'Markdown' });
    });

    this.bot.command('recargar', async (ctx) => {
      this.docsService.clearCache();
      ctx.reply('🔄 Base de conocimiento reiniciada. Los documentos se volverán a leer en la próxima consulta.');
    });

    // --- EL COMANDO REPORTE VA AQUÍ, ARRIBA DEL TEXTO NORMAL ---
    this.bot.command('reporte', async (ctx) => {
      const loadingMsg = await ctx.reply('📄 Recopilando datos y maquetando el PDF. Esto tomará unos segundos...');

      try {
        const prompt = "Actúa como Project Manager. Escribe un reporte ejecutivo formal y detallado del proyecto LUPSI basándote en los datos actuales de Trello y GitHub. No uses emojis, usa un tono estrictamente profesional.";
        const textoReporte = await this.aiService.chatWithAgent(prompt);

        const pdfBuffer = await this.pdfService.generateReport(textoReporte);

        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        } catch (e) {
          console.log('Mensaje temporal no borrado (ignorar)');
        }

        await ctx.replyWithDocument(
          Input.fromBuffer(pdfBuffer, `Reporte_LUPSI_${new Date().toISOString().split('T')[0]}.pdf`),
          { caption: '✅ Aquí tienes tu reporte ejecutivo en formato PDF.' }
        );

      } catch (error) {
        console.error(error);
        ctx.reply('❌ Hubo un error al generar el documento.');
      }
    });
    // COMANDO AGENTE REAL: Motor de Decisiones Inteligentes (Human in the Loop)
    this.bot.command('agente', async (ctx) => {
      const msg = await ctx.reply('🤖 Analizando profundamente el estado de Trello y la carga de los desarrolladores...');
      
      try {
        const trelloTopology = await this.trelloService.getBoardTopologyForAI();
        const githubWorkload = await this.githubService.getLatestCommits();
        
        const aiResponse = await this.aiService.analyzeAndDecideTasks(trelloTopology, githubWorkload);
        const decisiones = aiResponse.decisiones || [];

        try { await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id); } catch(e){}

        if (decisiones.length === 0) {
          return ctx.reply('✅ He analizado el proyecto y todo marcha correctamente. No tengo recomendaciones de movimiento de tarjetas por ahora.');
        }

        await ctx.reply(this.escapeMarkdown(`🚨 He detectado *${decisiones.length}* acciones necesarias. Te las presento para tu aprobación:`), { parse_mode: 'Markdown' });

        for (const decision of decisiones) {
           const actionId = Math.random().toString(36).substring(2, 10); // ID corto aleatorio
           this.pendingActions.set(actionId, decision);

           // Creamos el mensaje a mostrar
           const texto = `📌 *ACCIÓN PROPUESTA*\n` + 
                         `*Tipo:* ${decision.tipo}\n` + 
                         `*Justificación:* ${decision.rationale}\n\n` +
                         `¿Ejecuto esta acción en Trello?`;

           await ctx.reply(this.escapeMarkdown(texto), {
             parse_mode: 'Markdown',
             ...Markup.inlineKeyboard([
               [Markup.button.callback('✅ Aprobar Ejecución', `approve_${actionId}`)],
               [Markup.button.callback('❌ Rechazar', `reject_${actionId}`)]
             ])
           });
        }
      } catch (error) {
        console.error('Error en /agente:', error);
        ctx.reply('❌ Ocurrió un error al procesar las decisiones del Agente.');
      }
    });

    // --- ESCUCHADORES DINÁMICOS DE APROBACIÓN / RECHAZO ---
    this.bot.action(/^approve_(.+)$/, async (ctx) => {
      const actionId = ctx.match[1];
      const decision = this.pendingActions.get(actionId);

      if (!decision) {
         await ctx.answerCbQuery('Esta acción ya expiró o fue procesada.', { show_alert: true });
         return ctx.editMessageText('❌ _Esta acción ya expiró o no existe._', { parse_mode: 'Markdown' });
      }

      await ctx.answerCbQuery('Ejecutando en Trello...');

      let success = false;
      if (decision.tipo === 'MOVE_CARD') {
         success = await this.trelloService.moveCard(decision.cardId, decision.targetListId);
      } else if (decision.tipo === 'REASSIGN_CARD') {
         success = await this.trelloService.assignUser(decision.cardId, decision.memberId);
      }

      if (success) {
         this.pendingActions.delete(actionId);
         await ctx.editMessageText(this.escapeMarkdown(`✅ *Aprobado y Ejecutado.*\n` +
                                   `*Acción:* ${decision.tipo}\n` +
                                   `*Justificación:* ${decision.rationale}`), { parse_mode: 'Markdown' });
      } else {
         await ctx.editMessageText(`⚠️ Error al intentar ejecutar la acción en Trello. Por favor verifica los permisos del bot o actualiza los datos.`);
      }
    });

    this.bot.action(/^reject_(.+)$/, async (ctx) => {
      const actionId = ctx.match[1];
      this.pendingActions.delete(actionId);
      await ctx.answerCbQuery('Acción descartada.');
      await ctx.editMessageText(`❌ *Acción Rechazada por el Administrador.*`, { parse_mode: 'Markdown' });
    });
    // --- LA ASPIRADORA DE TEXTO NORMAL VA CASI AL FINAL ---
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      const thinkingMsg = await ctx.reply('🧠 Analizando datos del proyecto...');
      const reply = await this.aiService.chatWithAgent(ctx.message.text);

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id);
      } catch (e) { }

      ctx.reply(this.escapeMarkdown(reply), { parse_mode: 'Markdown' });
    });

    // --- EL LAUNCH VA ESTRICTAMENTE AL FINAL ---
    this.bot.launch();
    console.log('🤖 Agente LUPSI conectado a Telegram exitosamente...');
  }

  // Método para limpiar el texto y evitar errores de Telegram Markdown
  private escapeMarkdown(text: string): string {
    let safeText = text;
    if (safeText.length > 3900) {
      safeText = safeText.substring(0, 3900) + '...';
      
      const asterisks = (safeText.match(/\*/g) || []).length;
      if (asterisks % 2 !== 0) {
         safeText += '*'; // Cerramos el asterisco si quedó huérfano por el recorte
      }
      safeText += '\n\n[Mensaje truncado por límite de Telegram]';
    }
    
    // Escapamos guiones bajos que no están cerrados (muy común en nombres de archivos)
    // En Markdown estándar de Telegram, el guion bajo es problemático si no hay pareja.
    // Reemplazamos guiones bajos dentro de palabras para que no se tomen como cursiva.
    return safeText
      .replace(/_/g, '\\_') // Escapa todos los guiones bajos
      .replace(/\[/g, '\\[') // Escapa corchetes
      .replace(/\]/g, '\\]');
  }
}