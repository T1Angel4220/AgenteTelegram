import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GithubService {
  async getLatestCommits(): Promise<string> {
    try {
      const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits`;
      
      const response = await axios.get(url, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });

      const commits = response.data.slice(0, 5); // Tomamos los últimos 5
      let report = '🚀 *ACTIVIDAD RECIENTE EN GITHUB*\n\n';

      commits.forEach(c => {
        const date = new Date(c.commit.author.date).toLocaleDateString();
        report += `👤 *${c.commit.author.name}*: ${c.commit.message} (_${date}_)\n`;
      });

      return report;
    } catch (error) {
      console.error('Error GitHub:', error.message);
      return '❌ No pude conectar con GitHub. Revisa el repo y el token.';
    }
  }
}