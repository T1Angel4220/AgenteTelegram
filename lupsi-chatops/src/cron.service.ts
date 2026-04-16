import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AiService } from './ai.service';
import { PdfService } from './pdf.service';
import { Telegraf, Markup, Input } from 'telegraf'; // <-- Asegúrate de importar Markup e Input
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CronService {
  private bot: Telegraf;

  constructor(
    private readonly aiService: AiService,
    private readonly pdfService: PdfService,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);
  }

  // Ejecución diaria a las 11:30 PM (o EVERY_MINUTE si quieres probarlo ahora)
  @Cron('30 23 * * *') 
  async enviarReporteNocturno() {
    console.log('⏰ Ejecutando Reporte y Motor de Decisiones...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;

    try {
      await this.bot.telegram.sendMessage(chatId, '🔔 Agente LUPSI generando reporte nocturno...');

      // 1) REPORTE EJECUTIVO COMPLETO (tu informe nocturno)
      const promptReporte = `Actúa como Project Manager.
Genera un reporte ejecutivo formal y detallado del proyecto LUPSI basándote en el estado actual de Trello, GitHub y tu base de conocimiento (documentos).
REQUISITOS:
- No uses emojis.
- Usa máximo 6 secciones o apartados.
- Incluye: estado por listas en Trello, hallazgos relevantes en GitHub, riesgos y recomendaciones accionables.
- Si encuentras estancamiento (por ejemplo tareas urgentes en Doing sin actividad) incluye una recomendación concreta.
- Si no hay problemas, incluye igualmente 2-3 recomendaciones preventivas.
- IDIOMA: Responde absolutamente en ESPAÑOL. NO generes razonamientos internos ni pienses en voz alta ("Let me see..."). Escribe directo el reporte final.`;

      const reporteTexto = await this.aiService.chatWithAgent(promptReporte);

      // 2) Convertimos el reporte a PDF y lo enviamos
      const pdfBuffer = await this.pdfService.generateReport(reporteTexto);
      const filename = `Reporte_LUPSI_${new Date().toISOString().split('T')[0]}.pdf`;

      await this.bot.telegram.sendDocument(
        chatId,
        Input.fromBuffer(pdfBuffer, filename),
        { caption: '✅ Aquí tienes tu reporte nocturno (PDF).' },
      );

      // 3) MOTOR DE DECISIONES (además del reporte)
      const promptDecision = `Eres el Project Manager Autónomo.
Usa Trello, GitHub y la memoria histórica para revisar el cierre del día.
Haz un resumen MUY BREVE (máximo 5 líneas) e incluye recomendaciones concretas.
REGLA VITAL: Si detectas que hay tareas urgentes estancadas o alguien tiene demasiada carga de commits, DEBES agregar exactamente la etiqueta [REQUIERE_ACCION] al final de tu respuesta. Si todo va bien, no la agregues.
IDIOMA Y FORMA: Responde 100% en ESPAÑOL. Sin divagar, NO incluyas textos explicatorios previos ("Okay, let me..."). Ve directo a la respuesta.`;

      const decisionTexto = await this.aiService.chatWithAgent(promptDecision);

      // 4) Guardar en memoria (Diario)
      const historialPath = path.join(process.cwd(), 'historial.txt');
      const fecha = new Date().toLocaleDateString('es-ES');
      fs.appendFileSync(
        historialPath,
        `\n[DÍA ${fecha}] ${decisionTexto.replace('[REQUIERE_ACCION]', '').trim()}\n`,
      );

      // 5) Si requiere acción, mandamos alerta con botones
      if (decisionTexto.includes('[REQUIERE_ACCION]')) {
        const textoLimpio = decisionTexto.replace('[REQUIERE_ACCION]', '').trim();
        await this.bot.telegram.sendMessage(
          chatId,
          this.escapeMarkdown(
            `🚨 ALERTA DEL MOTOR DE DECISIONES\n\n${textoLimpio}\n\n¿Qué medidas correctivas aplico en Trello?`,
          ),
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Reasignar carga', 'action_reasignar')],
              [Markup.button.callback('⛔ Bloquear tareas', 'action_bloquear')],
              [Markup.button.callback('👁️ Solo monitorear', 'action_ignorar')],
            ]),
          },
        );
      } else {
        await this.bot.telegram.sendMessage(
          chatId,
          `✅ Cierre del día sano.\n\n${this.escapeMarkdown(decisionTexto)}`,
          { parse_mode: 'Markdown' },
        );
      }
      
    } catch (error) {
      console.error('Error al ejecutar el Cron:', error);
    }
  }

  private escapeMarkdown(text: string): string {
    let safeText = text;
    if (safeText.length > 4000) {
      safeText = safeText.substring(0, 4000) + '...\n\n[Mensaje truncado]';
    }
    // Telegram Markdown (no V2) tiene varios caracteres especiales; los escapamos para evitar fallos.
    return safeText.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}