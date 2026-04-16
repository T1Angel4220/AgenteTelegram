import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TrelloService {
  async getBoardState(): Promise<string> {
    try {
      // 1. Obtenemos el diccionario de miembros del tablero
      const membersUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/members?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const membersRes = await axios.get(membersUrl);
      const membersMap = {};
      membersRes.data.forEach(m => { membersMap[m.id] = m.fullName; });

      // 2. Obtenemos las listas y tarjetas (idMembers siempre viene con los IDs)
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?cards=open&card_fields=name,due,labels,idMembers&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const response = await axios.get(url);

      let report = '📊 *ESTADO DETALLADO DEL PROYECTO LUPSI*\n\n';
      let totalTasks = 0;
      let tareasUrgentes = 0;

      response.data.forEach((lista) => {
        const branchCards = lista.cards;
        totalTasks += branchCards.length;
        
        report += `📂 *LISTA: ${lista.name.toUpperCase()}*\n`;

        if (branchCards.length === 0) {
          report += `   _(Sin tareas)_\n`;
        }

        branchCards.forEach((card) => {
          const due = card.due ? new Date(card.due).toLocaleDateString('es-ES') : 'Sin fecha';
          
          // Mapeamos los IDs reales usando nuestro diccionario seguro
          const memNames = (card.idMembers || []).map(id => membersMap[id]).filter(Boolean);
          const members = memNames.length > 0 ? memNames.join(', ') : 'Sin asignar';
          
          let statusIcon = '▫️';
          
          // Analizamos etiquetas para prioridad
          let priority = '';
          if (card.labels && card.labels.length > 0) {
            card.labels.forEach((label) => {
              if (label.name.toLowerCase().includes('urgente') || label.color === 'red') {
                tareasUrgentes++;
                statusIcon = '🚨';
                priority = ' [URGENTE]';
              }
            });
          }

          report += `${statusIcon} *${card.name}*${priority}\n`;
          report += `   👤 ${members} | 📅 ${due}\n`;
        });
        report += `\n`;
      });

      report += `📌 *Resumen:* ${totalTasks} tareas totales | 🔴 ${tareasUrgentes} críticas.\n`;
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

  // Obtiene topología cruda para la toma de decisiones de la IA
  async getBoardTopologyForAI(): Promise<string> {
    try {
      const urlBoard = `https://api.trello.com/1/boards/${process.env.BOARD_ID}?lists=open&members=all&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const boardRes = await axios.get(urlBoard);
      
      const urlCards = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const cardsRes = await axios.get(urlCards);

      const topology = {
        listas: boardRes.data.lists.map(l => ({ id: l.id, name: l.name })),
        miembros: boardRes.data.members.map(m => ({ id: m.id, fullName: m.fullName })),
        tarjetas: cardsRes.data.map(c => ({
          id: c.id,
          name: c.name,
          idList: c.idList,
          due: c.due,
          idMembers: c.idMembers
        }))
      };

      return JSON.stringify(topology);
    } catch (error) {
      console.error('Error al obtener topología de Trello:', error);
      return '{}';
    }
  }

  // Nueva Función: Asignar un usuario a una tarjeta
  async assignUser(cardId: string, memberId: string): Promise<boolean> {
    try {
      // Trello usa un POST a /cards/{id}/idMembers para añadir miembros
      const url = `https://api.trello.com/1/cards/${cardId}/idMembers?value=${memberId}&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      await axios.post(url);
      return true;
    } catch (error) {
      console.error('Error al asignar usuario en Trello:', error);
      return false;
    }
  }

}