import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf, Input, Markup } from 'telegraf';import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { ManagerService } from './manager.service';
import { AiService } from './ai.service';
import { PdfService } from './pdf.service';


@Injectable()
export class BotService implements OnModuleInit {
  private bot: Telegraf;

  constructor(
    private readonly trelloService: TrelloService,
    private readonly githubService: GithubService,
    private readonly managerService: ManagerService,
    private readonly aiService: AiService,
    private readonly pdfService: PdfService
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
      ctx.reply(reporte, { parse_mode: 'Markdown' });
    });

    this.bot.command('github', async (ctx) => {
      const res = await this.githubService.getLatestCommits();
      ctx.reply(res, { parse_mode: 'Markdown' });
    });

    this.bot.command('analisis', async (ctx) => {
      ctx.reply('🧐 Analizando la salud del proyecto...');
      const health = await this.managerService.getHealthCheck();
      const trello = await this.trelloService.getBoardState();
      ctx.reply(`${health}${trello}`, { parse_mode: 'Markdown' });
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
// COMANDO DE PRUEBA: Simular una decisión del Agente
    this.bot.command('simular_decision', async (ctx) => {
      // El agente detecta algo y te pide permiso (Sistema de Confianza - Nivel Amarillo)
      const mensaje = `⚠️ *Agente LUPSI - Motor de Decisiones*\n\n` +
                      `He detectado que la tarea "API Pagos" lleva 3 días en 'Doing' sin commits.\n` +
                      `*Explicabilidad:* Pedro tiene 80% de carga. Juan está libre.\n\n` +
                      `¿Qué acción deseas que ejecute?`;

      // Generamos botones interactivos en Telegram
      await ctx.reply(mensaje, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Reasignar a Juan', 'action_reasignar')],
          [Markup.button.callback('⛔ Mover a Bloqueados', 'action_bloquear')],
          [Markup.button.callback('❌ Ignorar por ahora', 'action_ignorar')]
        ])
      });
    });

    // --- ESCUCHADORES DE LOS BOTONES (WEBHOOKS INTERNOS) ---
    this.bot.action('action_reasignar', async (ctx) => {
      await ctx.answerCbQuery('Reasignando tarea...'); // Quita el icono de carga del botón
      // Aquí en el futuro llamaremos a this.trelloService.assignUser()
      await ctx.editMessageText('✅ *Acción ejecutada:* La tarea "API Pagos" ha sido reasignada a Juan. He notificado al equipo.', { parse_mode: 'Markdown' });
    });

    this.bot.action('action_bloquear', async (ctx) => {
      await ctx.answerCbQuery('Moviendo en Trello...');
      // Reemplaza 'ID_DE_TU_LISTA_BLOQUEADOS' con un ID real de tu Trello para que funcione
      // await this.trelloService.moveCard('ID_DE_LA_TARJETA', 'ID_DE_TU_LISTA_BLOQUEADOS');
      await ctx.editMessageText('⛔ *Acción ejecutada:* La tarea ha sido movida a la lista de Bloqueados en Trello.', { parse_mode: 'Markdown' });
    });

    this.bot.action('action_ignorar', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText('👁️ Entendido. Seguiré monitoreando la tarea sin intervenir.');
    });
    // --- LA ASPIRADORA DE TEXTO NORMAL VA CASI AL FINAL ---
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      const thinkingMsg = await ctx.reply('🧠 Analizando datos del proyecto...');
      const reply = await this.aiService.chatWithAgent(ctx.message.text);

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id);
      } catch (e) { }

      ctx.reply(reply, { parse_mode: 'Markdown' });
    });

    // --- EL LAUNCH VA ESTRICTAMENTE AL FINAL ---
    this.bot.launch();
    console.log('🤖 Agente LUPSI conectado a Telegram exitosamente...');
  }
}