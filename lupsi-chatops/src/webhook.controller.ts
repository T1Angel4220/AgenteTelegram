import { Controller, Post, Body, Headers, Head } from '@nestjs/common';
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
    // 1. Push Event
    if (event === 'push') {
      const repo = payload.repository.full_name;
      const pusher = payload.pusher.name;
      const commits = payload.commits.map(c => c.message).join('\n');

      const prompt = `Analiza estos cambios en GitHub y genera una alerta ejecutiva corta para el Project Manager.
      Repositorio: ${repo}
      Autor: ${pusher}
      Commits: ${commits}`;

      const aiResponse = await this.aiService.chatWithAgent(prompt);
      await this.botService.notifyAdmin(`🚀 *Nuevos cambios en GitHub*\n\n${aiResponse.text}`);
    }

    // 2. Pull Request Event
    if (event === 'pull_request') {
      const action = payload.action;
      const pr = payload.pull_request;
      const author = pr.user.login;

      const prompt = `Se ha ${action === 'opened' ? 'abierto' : action === 'closed' ? 'cerrado' : 'actualizado'} un Pull Request en GitHub.
      PR: ${pr.title}
      Autor: ${author}
      URL: ${pr.html_url}
      Genera un resumen ejecutivo corto sobre este movimiento.`;

      const aiResponse = await this.aiService.chatWithAgent(prompt);
      await this.botService.notifyAdmin(`🔀 *Movimiento de PR*\n\n${aiResponse.text}\n🔗 [Ver PR](${pr.html_url})`);
    }

    // 3. Issue Event
    if (event === 'issues') {
      const action = payload.action;
      const issue = payload.issue;
      
      const prompt = `Se ha ${action} un Issue en GitHub.
      Título: ${issue.title}
      Autor: ${issue.user.login}
      Genera una notificación corta.`;

      const aiResponse = await this.aiService.chatWithAgent(prompt);
      await this.botService.notifyAdmin(`🎫 *Issue en GitHub*\n\n${aiResponse.text}\n🔗 [Ver Issue](${issue.html_url})`);
    }

    // 4. CI/CD Failures
    if (event === 'workflow_run' && payload.action === 'completed') {
      const workflow = payload.workflow_run;
      if (workflow.conclusion === 'failure') {
        const repo = payload.repository.full_name;
        const actor = workflow.actor.login;
        const url = workflow.html_url;

        const prompt = `Un workflow de CI/CD llamado "${workflow.name}" acaba de fallar en GitHub para el repositorio ${repo}. 
        El autor del commit que rompió el build es ${actor}. 
        Genera una alerta roja, urgente y corta indicando el fallo y pidiendo revisión.`;

        const aiResponse = await this.aiService.chatWithAgent(prompt);
        const mensaje = `🚨 *ALERTA DE CI/CD - BUILD ROTO*\n\n${aiResponse.text}\n🔗 [Ver error en GitHub](${url})`;
        
        await this.botService.notifyAdmin(mensaje);
        await this.botService.notifyMember(actor, mensaje);
      }
    }

    return { received: true };
  }

  @Post('trello')
  async handleTrelloWebhook(@Body() payload: any) {
    // Trello envía el evento en la propiedad 'action'
    if (!payload.action) return { received: true };

    const action = payload.action;
    const type = action.type; // e.g., 'updateCard', 'createCard', 'commentCard'
    const member = action.memberCreator.fullName;
    const cardName = action.data.card?.name || 'una tarjeta';

    let message = '';

    if (type === 'updateCard' && action.data.listAfter) {
      const listBefore = action.data.listBefore.name;
      const listAfter = action.data.listAfter.name;
      message = `📋 *Trello: Movimiento de Tarea*\n${member} movió *${cardName}* de [${listBefore}] a [${listAfter}].`;
    } else if (type === 'commentCard') {
      const comment = action.data.text;
      message = `💬 *Trello: Nuevo Comentario*\n${member} comentó en *${cardName}*:\n"${comment}"`;
    } else if (type === 'createCard') {
      message = `🆕 *Trello: Nueva Tarea*\n${member} creó *${cardName}* en la lista [${action.data.list.name}].`;
    }

    if (message) {
      await this.botService.notifyAdmin(message);
    }

    return { received: true };
  }

  @Post('telegram')
  async handleTelegramWebhook(@Body() update: any) {
    await this.botService.bot.handleUpdate(update);
    return { ok: true };
  }

  // Trello requiere un endpoint HEAD para validar el Webhook al crearlo
  @Head('trello')
  async verifyTrelloWebhook() {
    return "";
  }
}
