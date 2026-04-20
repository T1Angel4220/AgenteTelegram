import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GithubService {
  async getLatestCommits(): Promise<string> {
    try {
      const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = process.env;
      const branch = GITHUB_BRANCH || 'develop';
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${branch}&per_page=30`; 
      
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

  async createIssue(title: string, body: string): Promise<boolean> {
    try {
      const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`;
      await axios.post(url, { title, body }, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });
      return true;
    } catch (error) {
      if (error.response) {
        console.error('Error detallado de GitHub:', error.response.data);
        throw new Error(JSON.stringify(error.response.data));
      } else {
        console.error('Error al crear issue en GitHub:', error.message);
        throw new Error(error.message || 'Error al crear issue');
      }
    }
  }

  // NUEVA FUNCIÓN: Obtener lista de archivos del repo para análisis de código
  async getRepoStructure(): Promise<string> {
    try {
      const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = process.env;
      const branch = GITHUB_BRANCH || 'develop';
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${branch}?recursive=1`;
      const response = await axios.get(url, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });

      const files = response.data.tree
        .filter(f => f.type === 'blob')
        .filter(f => {
          // Solo archivos de código relevantes
          const ext = f.path.split('.').pop();
          return ['ts', 'js', 'py', 'java', 'php', 'cs', 'cpp', 'go', 'json'].includes(ext);
        })
        .filter(f => !f.path.includes('node_modules') && !f.path.includes('.min.'))
        .map(f => `- ${f.path} (${Math.round(f.size / 1024 * 10) / 10} KB)`)
        .slice(0, 60) // Máximo 60 archivos para no saturar el prompt
        .join('\n');

      return `Estructura del repositorio (${GITHUB_OWNER}/${GITHUB_REPO} @ ${branch}):\n${files}`;
    } catch (error) {
      console.error('Error al obtener estructura del repo:', error.message);
      return 'No se pudo obtener la estructura del repositorio.';
    }
  }

  // NUEVA FUNCIÓN: Obtener contenido de un archivo específico
  async getFileContent(filePath: string): Promise<string> {
    try {
      const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = process.env;
      const branch = GITHUB_BRANCH || 'develop';
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${branch}`;
      const response = await axios.get(url, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return content.substring(0, 3000); // Máx 3000 chars por archivo
    } catch (error) {
      return `No se pudo leer: ${filePath}`;
    }
  }
}