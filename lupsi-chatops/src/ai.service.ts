import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import * as fs from 'fs'; // <-- Nueva importación nativa
import * as path from 'path'; // <-- Nueva importación nativa

@Injectable()
export class AiService {
    constructor(
        private trello: TrelloService,
        private github: GithubService
    ) { }

    async chatWithAgent(userMessage: string): Promise<string> {
        try {
            const trelloContext = await this.trello.getBoardState();
            const githubContext = await this.github.getLatestCommits();

            // 1. Leemos el conocimiento estático (Fechas del sprint)
            const conocimientoPath = path.join(process.cwd(), 'conocimiento.json');
            const conocimientoRaw = fs.readFileSync(conocimientoPath, 'utf-8');
            const conocimiento = JSON.parse(conocimientoRaw);
            const hoy = new Date().toISOString().split('T')[0];

            // 2. NUEVO: Leemos la memoria histórica del equipo
            let historialContext = "No hay datos históricos previos aún.";
            const historialPath = path.join(process.cwd(), 'historial.txt');
            if (fs.existsSync(historialPath)) {
                const rawHistory = fs.readFileSync(historialPath, 'utf-8');
                // Tomamos solo los últimos 1500 caracteres para no saturar a la IA
                historialContext = rawHistory.slice(-1500);
            }

            // 3. El Súper-Prompt Definitivo
            const prompt = `Eres el Project Manager IA del proyecto LUPSI. 
      
      === REGLAS DEL JUEGO ===
      Cierre del Sprint: ${conocimiento.fecha_fin} (HOY ES: ${hoy})
      Objetivo: ${conocimiento.objetivo_principal}

      === ESTADO ACTUAL (TRELLO Y GITHUB) ===
      ${trelloContext}
      ${githubContext}

      === MEMORIA HISTÓRICA (DIARIO DE DÍAS ANTERIORES) ===
      ${historialContext}
      (Usa este historial para comparar: ¿estamos avanzando más rápido o más lento que los días pasados?)
      
      === USUARIO ===
      "${userMessage}"
      
      INSTRUCCIONES: Responde a la duda del usuario usando la memoria para dar contexto. Por ejemplo, "Ayer teníamos X tareas, hoy tenemos Y". Sé analítico, profesional y da alertas si el equipo se estancó.`;

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'meta-llama/llama-3-70b-instruct',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error en IA:', error?.response?.data || error.message);
            return '❌ Mi cerebro de IA está fuera de línea por ahora.';
        }
    }
}