import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { ManagerService } from './manager.service';

@Injectable()
export class BotService implements OnModuleInit {
  private bot: Telegraf;

  constructor(
    private readonly trelloService: TrelloService,
    private readonly githubService: GithubService,
    private readonly managerService: ManagerService,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);
  }

  onModuleInit() {
    this.bot.start((ctx) => {
      ctx.reply('¡Hola, Gestor del Proyecto Lupsi: Angel! Soy tu Agente LUPSI. Sistema ChatOps iniciado y a la espera de tus órdenes. 🚀');
    });

    this.bot.command('ping', (ctx) => {
      ctx.reply('¡Pong! 🏓 El backend en NestJS está vivo, procesando datos y escuchando.');
    });

    // --- NUEVO COMANDO: /estado ---
    this.bot.command('estado', async (ctx) => {
      ctx.reply('⏳ Consultando el tablero de Trello en tiempo real...');
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

    this.bot.launch();
  }
}