import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AiService } from './ai.service';
import { PdfService } from './pdf.service';
import { AutonomyService } from './autonomy.service';
import { BotService } from './bot.service';
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
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);
  }

  // --- CICLO 1: PROPUESTA NOCTURNA (23:30) ---
  @Cron('30 23 * * *') 
  async enviarReporteNocturno() {
    console.log('⏰ Ejecutando Reporte y Auditoría Nocturna...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;

    try {
      await this.bot.telegram.sendMessage(chatId, '🔔 Agente LUPSI iniciando auditoría de cierre de día...');

      // 1) REPORTE EJECUTIVO (PDF)
      const promptReporte = `Genera un REPORTE EJECUTIVO DE AVANCE para hoy. 
      Analiza el estado de las listas y los commits. 
      Responde en formato <respuesta>...</respuesta>.`;
      
      const resultReporte = await this.aiService.chatWithAgent(promptReporte);
      const reporteTexto = resultReporte.text;

      const pdfBuffer = await this.pdfService.generateReport(reporteTexto);
      const filename = `Reporte_LUPSI_${new Date().toISOString().split('T')[0]}.pdf`;

      await this.bot.telegram.sendDocument(
        chatId,
        Input.fromBuffer(pdfBuffer, filename),
        { caption: '✅ Reporte de avance diario generado.' },
      );

      // 2) MOTOR DE DECISIONES (AUTONOMÍA)
      const promptDecision = `Actúa como Senior Project Manager. 
      Revisa el tablero. ¿Hay algún cuello de botella o riesgo? 
      Si es necesario actuar, genera una <accion> JSON. 
      Explica tu razón en la <respuesta>.`;

      const resultDecision = await this.aiService.chatWithAgent(promptDecision);
      
      if (resultDecision.action) {
        // Registramos para el Dead-Line de las 9 AM
        const actionId = this.autonomyService.saveDecision(resultDecision.action);
        
        // Guardar en memoria histórica
        const historialPath = path.join(process.cwd(), 'historial.txt');
        fs.appendFileSync(historialPath, `\n[PROPUESTA ${new Date().toLocaleDateString()}] ${resultDecision.text}\n`);

        await this.bot.telegram.sendMessage(
          chatId,
          this.escapeMarkdown(
            `🧐 DECISIÓN ESTRATÉGICA PROPUESTA:\n\n${resultDecision.text}\n\n` +
            `⏳ *PERIODO DE GRACIA:* Tienes hasta las 09:00 AM para aprobar/rechazar. ` +
            `Si no hay respuesta, ejecutaré esta decisión autónomamente.`
          ),
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Aprobar Ahora', `approve_auto_${actionId}`)],
              [Markup.button.callback('❌ Cancelar Acción', `reject_auto_${actionId}`)],
            ]),
          }
        );
      } else {
        await this.bot.telegram.sendMessage(chatId, `✅ Todo en orden. No se requieren ajustes estratégicos por hoy.`);
      }
      
    } catch (error) {
      console.error('Error al ejecutar el Cron nocturno:', error);
    }
  }

  // --- CICLO 2: DEAD-LINE DE GESTIÓN (09:00 AM) ---
  @Cron('0 9 * * *')
  async ejecutarDecisionesAutonomas() {
    console.log('⏰ Verificando Dead-Line de Autonomía (09:00 AM)...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;
    const pending = this.autonomyService.getPendingDecisions();

    if (pending.length === 0) return;

    await this.bot.telegram.sendMessage(chatId, '🌅 Fin del periodo de gracia. Ejecutando decisiones autónomas pendientes...');

    for (const decision of pending) {
      const success = await this.botService.executeDecision(decision, true);
      if (success) {
        const detail = `Autonomía aplicada: ${decision.tool || 'acción estratégica'}`;
        await this.bot.telegram.sendMessage(chatId, `🚀 *${detail}*`);
        
        // Guardar ejecución en historial
        const historialPath = path.join(process.cwd(), 'historial.txt');
        fs.appendFileSync(historialPath, `\n[EJECUCIÓN AUTÓNOMA ${new Date().toLocaleDateString()}] ${detail}\n`);
        
        this.autonomyService.deleteDecision(decision.id);
      }
    }
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}