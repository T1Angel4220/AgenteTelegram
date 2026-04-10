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

      // Recorremos cada fase/lista y contamos sus tareas
      response.data.forEach((lista) => {
        const taskCount = lista.cards.length;
        totalTasks += taskCount;
        report += `🔹 *${lista.name}*: ${taskCount} tareas\n`;
      });

      report += `\n📌 *Total de tareas en el tablero*: ${totalTasks}`;
      
      return report;
    } catch (error) {
      console.error('Error al consultar Trello:', error);
      return '❌ Hubo un error al conectar con Trello. Verifica tus credenciales en el archivo .env.';
    }
  }
}