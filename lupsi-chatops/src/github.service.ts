import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GithubService {
  async getLatestCommits(): Promise<string> {
    try {
      const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=30`; // Traemos los últimos 30
      
      const response = await axios.get(url, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });

      const commits = response.data;
      let report = '🚀 *CARGA DE TRABAJO EN GITHUB (Últimos 30 commits)*\n\n';

      // Diccionario para contar los commits por desarrollador
      const commitCounts: Record<string, number> = {};

      commits.forEach(c => {
        const autor = c.commit.author.name;
        if (commitCounts[autor]) {
          commitCounts[autor]++;
        } else {
          commitCounts[autor] = 1;
        }
      });

      // Transformamos los datos a un texto bonito para Telegram
      for (const [autor, cantidad] of Object.entries(commitCounts)) {
        // Calculamos el porcentaje de aporte
        const porcentaje = Math.round((cantidad as number / commits.length) * 100);
        
        let icono = '👤';
        if (porcentaje > 50) icono = '🔥'; // Si alguien hace más del 50%, está on fire (o sobrecargado)
        if (porcentaje < 10) icono = '⚠️'; // Si alguien hace menos del 10%, advertencia
        
        report += `${icono} *${autor}*: ${cantidad} commits (${porcentaje}% del esfuerzo reciente)\n`;
      }

      return report;
    } catch (error) {
      console.error('Error GitHub:', error.message);
      return '❌ No pude conectar con GitHub.';
    }
  }
}