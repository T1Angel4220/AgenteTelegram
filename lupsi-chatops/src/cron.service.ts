import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiService } from './ai.service';
import { Telegraf, Markup } from 'telegraf'; // <-- Asegúrate de importar Markup
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CronService {
  private bot: Telegraf;

  constructor(private readonly aiService: AiService) {
    this.bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);
  }

  // Ejecución diaria a las 11:30 PM (o EVERY_MINUTE si quieres probarlo ahora)
  @Cron('30 23 * * *') 
  async enviarReporteNocturno() {
    console.log('⏰ Ejecutando Reporte y Motor de Decisiones...');
    const chatId = process.env.TELEGRAM_CHAT_ID as string;

    try {
      await this.bot.telegram.sendMessage(chatId, '🔔 *Agente LUPSI analizando el cierre del día...*', { parse_mode: 'Markdown' });

      // 1. EL PROMPT DEL MOTOR DE DECISIONES
      const prompt = `Eres el Project Manager Autónomo. Analiza el cierre del día con Trello, GitHub y el Historial.
      Haz un reporte ejecutivo MUY BREVE (3 líneas).
      REGLA VITAL: Si detectas que hay tareas urgentes estancadas o alguien tiene demasiada carga de commits, DEBES agregar exactamente la etiqueta [REQUIERE_ACCION] al final de tu respuesta. Si todo va bien, no la agregues.`;
      
      const reporteDiario = await this.aiService.chatWithAgent(prompt);

      // 2. Guardar en memoria (Diario)
      const historialPath = path.join(process.cwd(), 'historial.txt');
      const fecha = new Date().toLocaleDateString('es-ES');
      fs.appendFileSync(historialPath, `\n[DÍA ${fecha}] ${reporteDiario.replace('[REQUIERE_ACCION]', '')}\n`);

      // 3. LA LÓGICA DE DECISIÓN (Intervención del Backend)
      if (reporteDiario.includes('[REQUIERE_ACCION]')) {
        // La IA detectó un problema, limpiamos el texto
        const textoLimpio = reporteDiario.replace('[REQUIERE_ACCION]', '').trim();
        
        // Enviamos el mensaje CON LOS BOTONES DE ACCIÓN
        await this.bot.telegram.sendMessage(chatId, 
          `🚨 *ALERTA DEL MOTOR DE DECISIONES*\n\n${textoLimpio}\n\n*He pausado la ejecución automática. ¿Qué medidas correctivas aplico en Trello?*`, 
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Reasignar carga', 'action_reasignar')],
              [Markup.button.callback('⛔ Bloquear tareas', 'action_bloquear')],
              [Markup.button.callback('👁️ Solo monitorear', 'action_ignorar')]
            ])
          }
        );
      } else {
        // Todo está bien, solo enviamos el texto normal
        await this.bot.telegram.sendMessage(chatId, `✅ *Cierre del día sano:*\n\n${reporteDiario}`, { parse_mode: 'Markdown' });
      }
      
    } catch (error) {
      console.error('Error al ejecutar el Cron:', error);
    }
  }
}