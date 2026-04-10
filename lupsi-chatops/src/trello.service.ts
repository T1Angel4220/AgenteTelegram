import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TrelloService {
  async getBoardState(): Promise<string> {
    try {
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?cards=open&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const response = await axios.get(url);

      let totalTasks = 0;
      let report = '📊 *ESTADO ACTUAL DEL PROYECTO LUPSI*\n\n';
      let tareasUrgentes = 0;

      response.data.forEach((lista) => {
        const taskCount = lista.cards.length;
        totalTasks += taskCount;
        report += `🔹 *${lista.name}*: ${taskCount} tareas\n`;

        // Analizamos las prioridades (Etiquetas)
        lista.cards.forEach((card) => {
          if (card.labels && card.labels.length > 0) {
            card.labels.forEach((label) => {
              // Si la etiqueta dice "Urgente", "Alta" o es color rojo
              if (label.name.toLowerCase().includes('urgente') || label.color === 'red') {
                tareasUrgentes++;
                report += `   🚨 *URGENTE:* ${card.name} (en ${lista.name})\n`;
              }
            });
          }
        });
      });

      report += `\n📌 *Total de tareas:* ${totalTasks} | 🔴 *Tareas Críticas:* ${tareasUrgentes}\n`;
      return report;
    } catch (error) {
      console.error('Error al consultar Trello:', error);
      return '❌ Hubo un error al conectar con Trello.';
    }
  }
    // NUEVA FUNCIÓN: Mover una tarjeta real en Trello
  async moveCard(cardId: string, newListId: string): Promise<boolean> {
    try {
      const url = `https://api.trello.com/1/cards/${cardId}?idList=${newListId}&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      await axios.put(url);
      return true;
    } catch (error) {
      console.error('Error al mover tarjeta en Trello:', error);
      return false;
    }
  }

}