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

    if (event === 'workflow_run' && payload.action === 'completed') {
      const workflow = payload.workflow_run;
      if (workflow.conclusion === 'failure') {
        const repo = payload.repository.full_name;
        const actor = workflow.actor.login;
        const url = workflow.html_url;

        const prompt = `Un workflow de CI/CD llamado "${workflow.name}" acaba de fallar en GitHub para el repositorio ${repo}. 
        El autor del commit que rompió el build es ${actor}. 
        Genera una alerta roja, urgente y corta (estilo PM enojado pero constructivo) indicando el fallo y pidiendo revisión.`;

        const aiResponse = await this.aiService.chatWithAgent(prompt);
        
        const mensaje = `🚨 *ALERTA DE CI/CD - BUILD ROTO*\n\n${aiResponse.text}\n🔗 [Ver error en GitHub](${url})`;
        
        // Notificar al administrador
        await this.botService.notifyAdmin(mensaje);
        // Intentar notificar al dev si su usuario de github coincide con trelloName (o avisar genérico)
        await this.botService.notifyMember(actor, mensaje);
      }
    }

    return { received: true };
  }
}
