import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TrelloService {
  async getBoardState(): Promise<string> {
    try {
      // 1. Obtenemos el diccionario de miembros del tablero
      const membersUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/members?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const membersRes = await axios.get(membersUrl);
      const membersMap = {};
      membersRes.data.forEach(m => { membersMap[m.id] = m.fullName; });

      // 1.5 Obtenemos mapa de todos los adjuntos
      const cardsAttUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/cards?attachments=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const cardsAttRes = await axios.get(cardsAttUrl);
      const attachMap = {};
      cardsAttRes.data.forEach(c => { attachMap[c.id] = c.attachments || []; });

      // 2. Obtenemos las listas y tarjetas
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?cards=open&card_fields=name,desc,due,start,labels,idMembers,badges,dueComplete,dateLastActivity&card_attachments=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const response = await axios.get(url);

      let report = 'ESTADO DETALLADO DEL PROYECTO LUPSI\n\n';
      let totalTasks = 0;
      let tareasUrgentes = 0;
      const stats = { 'Completada': 0, 'En Proceso': 0, 'Pendiente': 0 };
      const now = new Date();
      const alertasVencidas: string[] = [];

      response.data.forEach((lista) => {
        const branchCards = lista.cards;
        totalTasks += branchCards.length;
        
        report += `LISTA: ${lista.name.toUpperCase()} [ID_LIST: ${lista.id}]\n`;

        if (branchCards.length === 0) {
          report += `   (Sin tareas)\n`;
        }

        let taskIndex = 1;
        branchCards.forEach((card) => {
          let statusLabel = 'Pendiente';
          let statusIcon = '[ ]';
          let priorityTag = '';
          
          if (card.dueComplete) {
            statusLabel = 'Completada';
            statusIcon = '[OK]';
          }

          if (card.labels && card.labels.length > 0) {
            card.labels.forEach((label) => {
              const nameLower = label.name.toLowerCase();
              if (nameLower.includes('urgente') || label.color === 'red') {
                tareasUrgentes++;
                priorityTag = ' [URGENTE]';
              }
              if (nameLower.includes('completado') || label.color === 'green') {
                statusLabel = 'Completada';
                statusIcon = '[OK]';
              }
              if (nameLower.includes('en proceso') || nameLower.includes('doing') || nameLower.includes('en progreso') || label.color === 'purple') {
                statusLabel = 'En Proceso';
                statusIcon = '[EN PROGRESO]';
              }
            });
          }

          stats[statusLabel]++;

          const memNames = (card.idMembers || []).map(id => membersMap[id]).filter(Boolean);
          const membersList = memNames.length > 0 ? memNames.join(', ') : 'Sin asignar';
          
          // ── Detección de vencimiento ──
          let overdueTag = '';
          let overdueInfo = '';
          if (card.due && statusLabel !== 'Completada') {
            const dueDate = new Date(card.due);
            if (dueDate < now) {
              const diasRetraso = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
              overdueTag = ' [!!VENCIDA!!]';
              overdueInfo = ` | RETRASO: ${diasRetraso} dia(s) desde ${dueDate.toLocaleDateString('es-ES')}`;
              tareasUrgentes++;
              alertasVencidas.push(`- "${card.name}" (Responsable: ${membersList}) — vencio el ${dueDate.toLocaleDateString('es-ES')}, lleva ${diasRetraso} dia(s) de retraso.`);
            }
          }

          const dueStr = card.due ? new Date(card.due).toLocaleDateString('es-ES') : 'Sin fecha';
          
          let extras = '';
          if (card.badges) {
             if (card.badges.attachments > 0) extras += ` | Archivos: ${card.badges.attachments}`;
             if (card.badges.comments > 0) extras += ` | Comentarios: ${card.badges.comments}`;
             if (card.badges.checkItems > 0) extras += ` | Subtareas: ${card.badges.checkItemsChecked}/${card.badges.checkItems}`;
          }

          let descripcion = '';
          if (card.desc) {
             const cleanDesc = card.desc.replace(/\n/g, ' ').trim();
             descripcion = `\n   Nota: ${cleanDesc.substring(0, 150)}${cleanDesc.length > 150 ? '...' : ''}`;
          }

          let attachLinks = '';
          const realAttachments = attachMap[card.id] || [];
          if (realAttachments.length > 0) {
             const links = realAttachments.map(att => `[${att.name}](${att.url})`).join(' | ');
             attachLinks = `\n   Link: ${links}`;
          }

          const labelNames = (card.labels || []).map(l => l.name).filter(Boolean).join(', ');
          const labelsText = labelNames ? ` | Etiquetas: ${labelNames}` : '';

          // ── Inactividad ──
          let inactividadStr = '';
          // Sólo alertamos inactividad si la tarea ya está 'En Proceso'. 
          // Una tarea 'Pendiente' en fases futuras es normal que lleve días inactiva.
          if (card.dateLastActivity && statusLabel === 'En Proceso') {
            const dateLastActivity = new Date(card.dateLastActivity);
            const diasInactivo = Math.floor((now.getTime() - dateLastActivity.getTime()) / (24 * 60 * 60 * 1000));
            // Considerar inactividad importante a partir de 2 días
            if (diasInactivo >= 2) {
              inactividadStr = ` | INACTIVIDAD: ${diasInactivo} dia(s) (desde el ${dateLastActivity.toLocaleDateString('es-ES')} hasta hoy)`;
            }
          }

          report += `${taskIndex}. [ID: ${card.id}] ${statusIcon} *${card.name}*${priorityTag}${overdueTag} (Estado: ${statusLabel})${labelsText}\n`;
          report += `   Responsable: ${membersList} | Fecha: ${dueStr}${overdueInfo}${extras}${inactividadStr}${descripcion}${attachLinks}\n`;
          taskIndex++;
        });
        report += `\n`;
      });

      // ── Módulo EVM (Earned Value Management) ──
      const evTasks = stats['Completada'];
      const pvTasks = evTasks + alertasVencidas.length; // Lo que ya se hizo + lo que debería haberse hecho (vencidas)
      const spi = pvTasks === 0 ? 1.0 : parseFloat((evTasks / pvTasks).toFixed(2));
      
      let evmAnalysis = '';
      if (spi < 1.0) {
        evmAnalysis = `⚠️ RETRASO DETECTADO (SPI: ${spi}). La velocidad actual es insuficiente. El equipo está rindiendo al ${Math.round(spi * 100)}% de lo planificado.`;
      } else if (spi > 1.0) {
        evmAnalysis = `🚀 ADELANTO (SPI: ${spi}). El equipo está entregando más rápido de lo planificado.`;
      } else {
        evmAnalysis = `✅ EN TIEMPO (SPI: ${spi}). El proyecto avanza exactamente según lo planificado.`;
      }

      const alertBlock = alertasVencidas.length > 0
        ? `!!ALERTAS CRITICAS - TAREAS VENCIDAS (${alertasVencidas.length})!!\n${alertasVencidas.join('\n')}\nACCION REQUERIDA: Reportar estos retrasos al PM y proponer reasignación de carga.\n\n`
        : '';

      const evmBlock = `[ANÁLISIS PREDICTIVO EVM]\n- EV (Earned Value): ${evTasks} tareas\n- PV (Planned Value): ${pvTasks} tareas\n- SPI (Schedule Performance Index): ${spi}\n- Diagnóstico: ${evmAnalysis}\n\n`;

      const header = `RESUMEN DE ESTADO: ${stats['Completada']} Completadas | ${stats['En Proceso']} En Progreso | ${stats['Pendiente']} Pendientes | ${alertasVencidas.length} VENCIDAS\n\n`;
      const footer = `RESUMEN: ${totalTasks} tareas totales | ${tareasUrgentes} criticas/vencidas.\n`;
      
      return alertBlock + evmBlock + header + report + footer;
    } catch (error) {
      console.error('Error al consultar Trello:', error);
      return 'Error al conectar con Trello.';
    }
  }

  async moveCard(cardId: string, newListId: string): Promise<boolean> {
    try {
      const url = `https://api.trello.com/1/cards/${cardId}?idList=${newListId}&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      await axios.put(url);
      return true;
    } catch (error) {
      const errData = error.response?.data ? (typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data) : error.message;
      console.error('Error al mover tarjeta en Trello:', errData);
      throw new Error(errData || 'Error al mover tarjeta');
    }
  }

  async createCard(idList: string, name: string, desc: string, idMembers?: string, idLabels?: string, due?: string, start?: string): Promise<boolean> {
    try {
      let url = `https://api.trello.com/1/cards?idList=${idList}&name=${encodeURIComponent(name)}&desc=${encodeURIComponent(desc)}&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      
      if (idMembers) url += `&idMembers=${idMembers}`;
      if (idLabels) url += `&idLabels=${idLabels}`;
      if (due) url += `&due=${due}`;
      if (start) url += `&start=${start}`;

      await axios.post(url);
      return true;
    } catch (error) {
      const errData = error.response?.data ? (typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data) : error.message;
      console.error('Error al crear tarjeta en Trello:', errData);
      throw new Error(errData || 'Error al crear tarjeta');
    }
  }

  async addComment(cardId: string, text: string): Promise<boolean> {
    try {
      const url = `https://api.trello.com/1/cards/${cardId}/actions/comments?text=${encodeURIComponent(text)}&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      await axios.post(url);
      return true;
    } catch (error) {
      console.error('Error al comentar tarjeta:', error.message);
      return false;
    }
  }

  async assignUser(cardId: string, memberId: string): Promise<boolean> {
    try {
      const url = `https://api.trello.com/1/cards/${cardId}/idMembers?value=${memberId}&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      await axios.post(url);
      return true;
    } catch (error) {
      console.error('Error al asignar usuario:', error.message);
      return false;
    }
  }

  async markCardAsComplete(cardId: string): Promise<boolean> {
    try {
      const url = `https://api.trello.com/1/cards/${cardId}?dueComplete=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      await axios.put(url);
      return true;
    } catch (error) {
      console.error('Error al completar tarjeta:', error.message);
      return false;
    }
  }

  async downloadAttachment(url: string, filename: string, subfolder: string = 'entregables'): Promise<string> {
    try {
      const folderPath = path.join(process.cwd(), 'conocimiento', subfolder);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
      
      const savePath = path.join(folderPath, filename);
      
      const response = await axios.get(url, { 
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `OAuth oauth_consumer_key="${process.env.TRELLO_KEY}", oauth_token="${process.env.TRELLO_TOKEN}"`
        }
      });
      
      fs.writeFileSync(savePath, Buffer.from(response.data));
      return savePath;
    } catch (error) {
      console.error('Error al descargar adjunto:', error.message);
      throw error;
    }
  }

  async getBoardTopologyForAI(): Promise<string> {
    try {
      const membersUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/members?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const membersRes = await axios.get(membersUrl);
      
      const listsUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?cards=open&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const res = await axios.get(listsUrl);
      
      const topology = {
        miembros: membersRes.data.map(m => ({ id: m.id, fullName: m.fullName })),
        listas: res.data.map(l => ({ id: l.id, name: l.name })),
        tarjetas: res.data.flatMap(l => (l.cards || []).map(c => ({ 
          id: c.id, 
          name: c.name, 
          idList: l.id, 
          idMembers: c.idMembers || [], 
          labels: c.labels || [],
          dueComplete: c.dueComplete 
        })))
      };
      
      return JSON.stringify(topology);
    } catch (e) {
      return '{}';
    }
  }

  async getCompletedCardsThisSprint(): Promise<any[]> {
    try {
      const listsUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?cards=open&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const res = await axios.get(listsUrl);
      
      const completadas: any[] = [];
      res.data.forEach(lista => {
        lista.cards.forEach(card => {
          const isDoneLabel = (card.labels || []).some(l => l.name.toLowerCase().includes('completado'));
          if (card.dueComplete || isDoneLabel) {
            completadas.push({ id: card.id, nombre: card.name });
          }
        });
      });
      return completadas;
    } catch (e) {
      return [];
    }
  }

  async getMetrics(): Promise<any> {
    try {
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?cards=open&card_fields=name,labels,dueComplete&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const res = await axios.get(url);
      
      const metrics: any = {
        total: 0,
        urgentes: 0,
        enProgreso: 0,
        pendientes: 0,
        listas: {},
        detallesListas: []
      };

      res.data.forEach(list => {
        const totalList = list.cards.length;
        let completedList = 0;
        
        const isListInProgress = list.name.toUpperCase().includes('DOING') || 
                                 list.name.toUpperCase().includes('EN PROCESO') || 
                                 list.name.toUpperCase().includes('EJECUCIÓN');
        
        list.cards.forEach(card => {
          const labels = card.labels || [];
          let isDone = card.dueComplete;
          let isProg = false;

          if (!isDone && labels.length > 0) {
            labels.forEach(l => {
              const n = (l.name || '').toLowerCase();
              if (n.includes('completado') || l.color === 'green') {
                isDone = true;
              }
              if (n.includes('en proceso') || n.includes('doing') || n.includes('progreso') || ['purple', 'blue', 'yellow'].includes(l.color)) {
                isProg = true;
              }
            });
          }

          // Si tiene ambas (por error humano en Trello), "En progreso" gana en la vista del Agente.
          // Hacemos que las métricas reflejen esa misma lógica.
          if ((isProg || isListInProgress) && !card.dueComplete) {
            metrics.enProgreso++;
          } else if (isDone && !isListInProgress) {
            completedList++;
          } else {
            metrics.pendientes++;
          }

          if (labels.some(l => (l.name || '').toLowerCase().includes('urgente') || l.color === 'red')) {
            metrics.urgentes++;
          }
        });

        metrics.total += totalList;
        metrics.detallesListas.push({
          nombre: list.name,
          total: totalList,
          completas: completedList,
          porcentaje: totalList > 0 ? Math.round((completedList / totalList) * 100) : 0
        });
      });

      return metrics;
    } catch (e) {
      return { total: 0, urgentes: 0, listas: {} };
    }
  }

  async getStuckCards(days: number): Promise<any[]> {
    try {
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/cards?fields=name,dateLastActivity,idList,due,idMembers,dueComplete,labels&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const res = await axios.get(url);
      
      const listsUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const listsRes = await axios.get(listsUrl);
      const listNames = {};
      listsRes.data.forEach(l => listNames[l.id] = l.name);

      const members = await this.getBoardMembers();
      const memberNames = {};
      members.forEach(m => memberNames[m.id] = m.fullName);

      const now = new Date();
      const stuckLimit = days * 24 * 60 * 60 * 1000;

      return res.data
        .filter(c => {
          if (c.dueComplete) return false;
          const isProg = (c.labels || []).some((l: any) => /proceso|doing|progreso/i.test(l.name) || l.color === 'purple');
          if (!isProg) return false;
          return (now.getTime() - new Date(c.dateLastActivity).getTime() > stuckLimit);
        })
        .map(c => ({
          nombre: c.name,
          lista: listNames[c.idList] || 'Desconocida',
          asignados: (c.idMembers || []).map(id => memberNames[id] || id).join(', '),
          diasBloqueada: Math.floor((now.getTime() - new Date(c.dateLastActivity).getTime()) / (24 * 60 * 60 * 1000)),
          ultimaActividad: new Date(c.dateLastActivity).toLocaleDateString('es-ES'),
          intervaloInactividad: `desde el ${new Date(c.dateLastActivity).toLocaleDateString('es-ES')} hasta hoy (${new Date().toLocaleDateString('es-ES')})`,
          vencimiento: c.due ? new Date(c.due).toLocaleDateString('es-ES') : 'Sin fecha'
        }));
    } catch (e) {
      return [];
    }
  }

  async getCardsDueSoon(hours: number): Promise<any[]> {
    try {
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/cards?fields=name,due,idMembers,dueComplete&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const res = await axios.get(url);
      
      const members = await this.getBoardMembers();
      const memberNames = {};
      members.forEach(m => memberNames[m.id] = m.fullName);

      const now = new Date();
      const limit = hours * 60 * 60 * 1000;

      return res.data
        .filter(c => !c.dueComplete && c.due && (new Date(c.due).getTime() - now.getTime() < limit) && (new Date(c.due).getTime() > now.getTime()))
        .map(c => ({
          nombre: c.name,
          asignados: (c.idMembers || []).map(id => memberNames[id] || id).join(', '),
          vencimiento: new Date(c.due).toLocaleDateString('es-ES'),
          horasRestantes: Math.floor((new Date(c.due).getTime() - now.getTime()) / (60 * 60 * 1000))
        }));
    } catch (e) {
      return [];
    }
  }

  async getBoardMembers(): Promise<any[]> {
    try {
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/members?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const res = await axios.get(url);
      return res.data; // [{ id, fullName, username }]
    } catch (e) {
      return [];
    }
  }

  async getCardDetails(searchTerm: string): Promise<any> {
    try {
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/cards?attachments=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const res = await axios.get(url);
      const cards = res.data;

      const term = searchTerm.toLowerCase();
      const card = cards.find(c => 
        c.name.toLowerCase().includes(term) || 
        (c.desc && c.desc.toLowerCase().includes(term))
      );

      if (!card) return { found: false };

      const listsUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const listsRes = await axios.get(listsUrl);
      const listName = listsRes.data.find(l => l.id === card.idList)?.name || 'Desconocida';

      const memberNames = (card.idMembers || []).join(', '); // Simplified

      return {
        found: true,
        card: {
          nombre: card.name,
          lista: listName,
          asignados: memberNames,
          vencimiento: card.due ? new Date(card.due).toLocaleDateString('es-ES') : 'Sin fecha',
          completada: card.dueComplete ? 'Sí' : 'No',
          labels: (card.labels || []).map(l => l.name).join(', '),
          descripcion: card.desc || 'Sin descripción'
        },
        url: card.shortUrl,
        attachments: (card.attachments || []).map(a => ({
          nombre: a.name,
          url: a.url,
          esArchivo: a.isUpload
        }))
      };
    } catch (e) {
      return { found: false };
    }
  }
}