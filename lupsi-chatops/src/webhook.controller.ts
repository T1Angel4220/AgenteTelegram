import { Controller, Post, Body, Headers } from '@nestjs/common';
import { BotService } from './bot.service';
import { AiService } from './ai.service';

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly botService: BotService,
    private readonly aiService: AiService
  ) {}

  @Post('github')
  async handleGithubWebhook(@Body() payload: any, @Headers('x-github-event') event: string) {
    if (event === 'push') {
      const repo = payload.repository.full_name;
      const pusher = payload.pusher.name;
      const commits = payload.commits.map(c => c.message).join('\n');

      const prompt = `Analiza estos cambios en GitHub y genera una alerta ejecutiva corta para el Project Manager.
      Repositorio: ${repo}
      Autor: ${pusher}
      Commits: ${commits}`;

      const aiResponse = await this.aiService.chatWithAgent(prompt);
      
      // Notificar al administrador
      await this.botService.notifyAdmin(`🚀 *Nuevos cambios en GitHub*\n\n${aiResponse.text}`);
    }

    return { received: true };
  }
}
