import { Injectable } from '@nestjs/common';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import axios from 'axios';

@Injectable()
export class ManagerService {
  constructor(
    private trello: TrelloService,
    private github: GithubService
  ) {}

  async getHealthCheck(): Promise<string> {
    // 1. Obtenemos datos crudos de GitHub para ver la última fecha
    const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
    const githubData = await axios.get(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    
    const lastCommitDate = new Date(githubData.data[0].commit.author.date);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - lastCommitDate.getTime()) / (1000 * 3600 * 24));

    let alert = '';
    if (diffDays >= 2) {
      alert = `⚠️ *ALERTA DE ATRASO*: No ha habido código nuevo en ${diffDays} días. El equipo podría estar bloqueado.\n\n`;
    } else {
      alert = `✅ *FLUJO SANO*: Último cambio hace menos de 24h.\n\n`;
    }

    return alert;
  }
}