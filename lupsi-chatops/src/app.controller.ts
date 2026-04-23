import { Controller, Get } from '@nestjs/common';
import { TrelloService } from './trello.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class AppController {
  constructor(private readonly trelloService: TrelloService) {}

  @Get()
  getHello(): string {
    return '🚀 LUPSI API is running';
  }

  @Get('metrics')
  async getMetrics() {
    const trelloMetrics = await this.trelloService.getMetrics();
    
    // Leer burndown histórico
    const burndownPath = path.join(process.cwd(), 'burndown.json');
    let burndown = [];
    if (fs.existsSync(burndownPath)) {
      burndown = JSON.parse(fs.readFileSync(burndownPath, 'utf-8'));
    }

    // Leer conocimiento (sprint info)
    const conocimientoPath = path.join(process.cwd(), 'conocimiento.json');
    let conocimiento = {};
    if (fs.existsSync(conocimientoPath)) {
      conocimiento = JSON.parse(fs.readFileSync(conocimientoPath, 'utf-8'));
    }

    return {
      trello: trelloMetrics,
      burndown: burndown,
      proyecto: conocimiento,
      timestamp: new Date().toISOString()
    };
  }
}
