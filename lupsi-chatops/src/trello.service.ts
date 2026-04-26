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

      // 1.5 Obtenemos mapa de todos los adjuntos (Trello no los da anidados por lista)
      const cardsAttUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/cards?attachments=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const cardsAttRes = await axios.get(cardsAttUrl);
      const attachMap = {};
      cardsAttRes.data.forEach(c => { attachMap[c.id] = c.attachments || []; });

      // 2. Obtenemos las listas y tarjetas (idMembers siempre viene con los IDs)
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?cards=open&card_fields=name,desc,due,start,labels,idMembers,badges,dueComplete&card_attachments=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
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

        let taskIndex = 1;
        branchCards.forEach((card) => {
          const dueStr = card.due ? new Date(card.due).toLocaleDateString('es-ES') : '?';
          const startStr = card.start ? new Date(card.start).toLocaleDateString('es-ES') : '?';
          const due = (card.due || card.start) ? `Inicio: ${startStr} - Fin: ${dueStr}` : 'Sin fechas';
          
          // Mapeamos los IDs reales usando nuestro diccionario seguro
          const memNames = (card.idMembers || []).map(id => membersMap[id]).filter(Boolean);
          const members = memNames.length > 0 ? memNames.join(', ') : 'Sin asignar';
          
          let statusIcon = '▫️';
          
          // Analizamos etiquetas para prioridad
          let priority = '';
          let isComplete = card.dueComplete ? '✅ Terminada' : '🟡 Pendiente';
          let isOverdue = false;
          
          if (!card.dueComplete && card.due) {
            const dueDate = new Date(card.due);
            const now = new Date();
            if (dueDate < now) {
              isComplete = '🔴 Atrasada';
              isOverdue = true;
              statusIcon = '⚠️';
            }
          }
          
          if (card.labels && card.labels.length > 0) {
            card.labels.forEach((label) => {
              if (label.name.toLowerCase().includes('urgente') || label.color === 'red') {
                tareasUrgentes++;
                statusIcon = '🚨';
                priority = ' [URGENTE]';
              }
              if (label.name.toLowerCase().includes('completado') || label.color === 'green') {
                if (isOverdue) {
                  isComplete = '🔴 Atrasada (Pero con etiqueta Verde/Completado)';
                } else if (!card.dueComplete) {
                  isComplete = '🟡 Pendiente (Pero con etiqueta Verde/Completado)';
                  statusIcon = '✅';
                }
              }
            });
          }

          let extras = '';
          if (card.badges) {
             if (card.badges.attachments > 0) extras += ` | 📎 ${card.badges.attachments} adjuntos`;
             if (card.badges.comments > 0) extras += ` | 💬 ${card.badges.comments} sms`;
             if (card.badges.checkItems > 0) extras += ` | ☑️ ${card.badges.checkItemsChecked}/${card.badges.checkItems} sub`;
          }
          
          let descripcion = '';
          if (card.desc) {
             // Limpiamos saltos de línea para que no destruya el block markdown de la lista
             const cleanDesc = card.desc.replace(/\n/g, ' ').trim();
             descripcion = `\n   📝 ${cleanDesc.substring(0, 150)}${cleanDesc.length > 150 ? '...' : ''}`;
          }

          let attachLinks = '';
          const realAttachments = attachMap[card.id] || [];
          if (realAttachments.length > 0) {
             const links = realAttachments.map(att => `[${att.name}](${att.url})`).join(' | ');
             attachLinks = `\n   🔗 Descargar: ${links}`;
          }

          report += `${taskIndex}. ${statusIcon} *${card.name}*${priority} (${isComplete})\n`;
          report += `   👤 ${members} | 📅 ${due}${extras}${descripcion}${attachLinks}\n`;
          taskIndex++;
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
      console.error('Error al mover tarjeta en Trello:', error.response?.data || error.message);
      throw new Error(error.response?.data || error.message || 'Error al mover tarjeta');
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
      console.error('Error al crear tarjeta en Trello:', error.response?.data || error.message);
      throw new Error(error.response?.data || error.message || 'Error al crear tarjeta');
    }
  }

  // NUEVA FUNCIÓN: Añadir un comentario a una tarjeta
  async addComment(cardId: string, text: string): Promise<boolean> {
    try {
      const url = `https://api.trello.com/1/cards/${cardId}/actions/comments?text=${encodeURIComponent(text)}&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      await axios.post(url);
      return true;
    } catch (error) {
      console.error('Error al añadir comentario en Trello:', error.response?.data || error.message);
      throw new Error(error.response?.data || error.message || 'Error al añadir comentario');
    }
  }

  // NUEVA FUNCIÓN: Marcar tarjeta como completada
  async markCardAsComplete(cardId: string): Promise<boolean> {
    try {
      const url = `https://api.trello.com/1/cards/${cardId}?dueComplete=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      await axios.put(url);
      return true;
    } catch (error) {
      console.error('Error al marcar tarjeta como completada en Trello:', error.response?.data || error.message);
      throw new Error(error.response?.data || error.message || 'Error al marcar tarjeta como completada');
    }
  }

  // Obtiene topología cruda para la toma de decisiones de la IA
  async getBoardTopologyForAI(): Promise<string> {
    try {
      const urlBoard = `https://api.trello.com/1/boards/${process.env.BOARD_ID}?lists=open&members=all&labels=all&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const boardRes = await axios.get(urlBoard);
      
      const urlCards = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const cardsRes = await axios.get(urlCards);

      const topology = {
        listas: boardRes.data.lists.map(l => ({ id: l.id, name: l.name })),
        miembros: boardRes.data.members.map(m => ({ id: m.id, fullName: m.fullName })),
        labels: boardRes.data.labels.map(l => ({ id: l.id, name: l.name })),
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
      console.error('Error al asignar usuario en Trello:', error.response?.data || error.message);
      throw new Error(error.response?.data || error.message || 'Error al asignar usuario');
    }
  }

  // Nueva Función: Obtener métricas para los gráficos del PDF
  async getMetrics(): Promise<any> {
    try {
      const url = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/lists?cards=open&card_fields=idMembers&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const response = await axios.get(url);
      
      const membersUrl = `https://api.trello.com/1/boards/${process.env.BOARD_ID}/members?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
      const membersRes = await axios.get(membersUrl);
      const membersMap = {};
      membersRes.data.forEach(m => { membersMap[m.id] = m.fullName; });

      const metrics = {
        total: 0,
        completadas: 0,
        urgentes: 0,
        totalMiembros: Object.keys(membersMap).length,
        listas: {},
        miembros: {},
      };

      response.data.forEach(lista => {
        const count = lista.cards.length;
        metrics.total += count;
        metrics.listas[lista.name] = count;

        const esListaDone = /done|completado|terminado|hecho/i.test(lista.name);

        lista.cards.forEach(card => {
          if (esListaDone) metrics.completadas++;

          // Contar urgentes por etiqueta
          const isUrgent = (card.labels || []).some(l => (l.name || '').toLowerCase().includes('urgente') || l.color === 'red');
          if (isUrgent) metrics.urgentes++;

          (card.idMembers || []).forEach(mId => {
            const name = membersMap[mId] || 'Otros';
            metrics.miembros[name] = (metrics.miembros[name] || 0) + 1;
          });
        });
      });

      return metrics;
    } catch (error) {
      console.error('Error al obtener métricas:', error);
      return { listas: {}, miembros: {} };
    }
  }

  // ── Detectar tarjetas realmente bloqueadas (sin actividad N días) ──────────
  async getStuckCards(diasSinActividad: number = 2): Promise<any[]> {
    try {
      const { BOARD_ID, TRELLO_KEY, TRELLO_TOKEN } = process.env;
      // Obtener miembros del tablero
      const membersUrl = `https://api.trello.com/1/boards/${BOARD_ID}/members?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const membersRes = await axios.get(membersUrl);
      const membersMap: Record<string, string> = {};
      membersRes.data.forEach(m => { membersMap[m.id] = m.fullName; });

      // Obtener listas del tablero
      const listsUrl = `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const listsRes = await axios.get(listsUrl);
      const listsMap: Record<string, string> = {};
      listsRes.data.forEach(l => { listsMap[l.id] = l.name; });

      // Obtener todas las tarjetas abiertas
      const cardsUrl = `https://api.trello.com/1/boards/${BOARD_ID}/cards?filter=open&fields=id,name,idList,idMembers,dateLastActivity,due&key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const cardsRes = await axios.get(cardsUrl);

      const ahora = Date.now();
      const limitMs = diasSinActividad * 24 * 60 * 60 * 1000;
      const listasProceso = ['doing', 'en progreso', 'in progress', 'en proceso', 'wip'];

      const bloqueadas = cardsRes.data.filter(card => {
        const nombreLista = (listsMap[card.idList] || '').toLowerCase();
        const estaEnProceso = listasProceso.some(p => nombreLista.includes(p));
        if (!estaEnProceso) return false;

        const ultimaActividad = new Date(card.dateLastActivity).getTime();
        return (ahora - ultimaActividad) >= limitMs;
      }).map(card => ({
        nombre: card.name,
        lista: listsMap[card.idList] || 'Desconocida',
        asignados: (card.idMembers || []).map(id => membersMap[id] || id).join(', ') || 'Sin asignar',
        diasBloqueada: Math.floor((ahora - new Date(card.dateLastActivity).getTime()) / (24 * 60 * 60 * 1000)),
        vencimiento: card.due ? new Date(card.due).toLocaleDateString('es-ES') : 'Sin fecha',
      }));

      return bloqueadas;
    } catch (e) {
      console.error('Error en getStuckCards:', e.message);
      return [];
    }
  }

  // ── Tarjetas que vencen en las próximas N horas ──────────────────────────
  async getCardsDueSoon(horas: number = 48): Promise<any[]> {
    try {
      const { BOARD_ID, TRELLO_KEY, TRELLO_TOKEN } = process.env;
      const membersUrl = `https://api.trello.com/1/boards/${BOARD_ID}/members?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const membersRes = await axios.get(membersUrl);
      const membersMap: Record<string, string> = {};
      membersRes.data.forEach(m => { membersMap[m.id] = m.fullName; });

      const listsUrl = `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const listsRes = await axios.get(listsUrl);
      const listsMap: Record<string, string> = {};
      listsRes.data.forEach(l => { listsMap[l.id] = l.name; });

      const cardsUrl = `https://api.trello.com/1/boards/${BOARD_ID}/cards?filter=open&fields=id,name,idList,idMembers,due,dueComplete&key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const cardsRes = await axios.get(cardsUrl);

      const ahora = Date.now();
      const limiteMs = horas * 60 * 60 * 1000;

      return cardsRes.data
        .filter(card => {
          if (!card.due || card.dueComplete) return false;
          const vence = new Date(card.due).getTime();
          return vence > ahora && vence <= (ahora + limiteMs);
        })
        .map(card => ({
          nombre: card.name,
          lista: listsMap[card.idList] || 'Desconocida',
          asignados: (card.idMembers || []).map(id => membersMap[id] || id).join(', ') || 'Sin asignar',
          vencimiento: new Date(card.due).toLocaleString('es-ES'),
          horasRestantes: Math.round((new Date(card.due).getTime() - ahora) / (60 * 60 * 1000)),
        }));
    } catch (e) {
      console.error('Error en getCardsDueSoon:', e.message);
      return [];
    }
  }

  // ── Buscar tarjeta por nombre y devolver detalles + adjuntos ──────────────
  async getCardDetails(searchTerm: string): Promise<{
    found: boolean;
    card?: any;
    attachments?: any[];
    url?: string;
  }> {
    try {
      const { BOARD_ID, TRELLO_KEY, TRELLO_TOKEN } = process.env;

      // Obtener miembros
      const membersUrl = `https://api.trello.com/1/boards/${BOARD_ID}/members?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const membersRes = await axios.get(membersUrl);
      const membersMap: Record<string, string> = {};
      membersRes.data.forEach(m => { membersMap[m.id] = m.fullName; });

      // Obtener listas
      const listsUrl = `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const listsRes = await axios.get(listsUrl);
      const listsMap: Record<string, string> = {};
      listsRes.data.forEach(l => { listsMap[l.id] = l.name; });

      // Buscar todas las tarjetas con sus adjuntos
      const cardsUrl = `https://api.trello.com/1/boards/${BOARD_ID}/cards?attachments=true&filter=open&key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const cardsRes = await axios.get(cardsUrl);

      // Búsqueda case-insensitive por nombre parcial
      const term = searchTerm.toLowerCase().trim();
      const card = cardsRes.data.find(c =>
        c.name.toLowerCase().includes(term)
      );

      if (!card) return { found: false };

      const attachments = (card.attachments || []).map(att => ({
        nombre: att.name,
        url: att.url,
        esArchivo: !!att.mimeType, // true si es archivo subido, false si es link
        mimeType: att.mimeType || null,
        bytes: att.bytes || 0,
      }));

      return {
        found: true,
        url: `https://trello.com/c/${card.shortLink}`,
        card: {
          id: card.id,
          nombre: card.name,
          descripcion: card.desc || 'Sin descripción.',
          lista: listsMap[card.idList] || 'Desconocida',
          asignados: (card.idMembers || []).map(id => membersMap[id] || id).join(', ') || 'Sin asignar',
          vencimiento: card.due ? new Date(card.due).toLocaleDateString('es-ES') : 'Sin fecha',
          completada: card.dueComplete ? 'Sí' : 'No',
          labels: (card.labels || []).map(l => l.name || l.color).filter(Boolean).join(', ') || 'Sin etiquetas',
        },
        attachments,
      };
    } catch (e) {
      console.error('Error en getCardDetails:', e.message);
      return { found: false };
    }
  }

  // ── Obtener lista de miembros del tablero (para validar /vincular) ──────
  async getBoardMembers(): Promise<{ id: string; fullName: string; username: string }[]> {
    try {
      const { BOARD_ID, TRELLO_KEY, TRELLO_TOKEN } = process.env;
      const url = `https://api.trello.com/1/boards/${BOARD_ID}/members?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const res = await axios.get(url);
      return res.data.map(m => ({ id: m.id, fullName: m.fullName, username: m.username }));
    } catch (e) {
      console.error('Error obteniendo miembros del tablero:', e.message);
      return [];
    }
  }

  // ── Tarjetas completadas (dueComplete=true o en lista Done) para tracking de entregables ──
  async getCompletedCardsThisSprint(): Promise<{ nombre: string; lista: string; asignados: string; completadaEn: string }[]> {
    try {
      const { BOARD_ID, TRELLO_KEY, TRELLO_TOKEN } = process.env;

      const membersUrl = `https://api.trello.com/1/boards/${BOARD_ID}/members?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const membersRes = await axios.get(membersUrl);
      const membersMap: Record<string, string> = {};
      membersRes.data.forEach(m => { membersMap[m.id] = m.fullName; });

      const listsUrl = `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const listsRes = await axios.get(listsUrl);
      const listsMap: Record<string, string> = {};
      listsRes.data.forEach(l => { listsMap[l.id] = l.name; });

      const cardsUrl = `https://api.trello.com/1/boards/${BOARD_ID}/cards?filter=all&fields=id,name,idList,idMembers,dueComplete,dateLastActivity&key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
      const cardsRes = await axios.get(cardsUrl);

      return cardsRes.data
        .filter(c => c.dueComplete || /done|completado|terminado|hecho/i.test(listsMap[c.idList] || ''))
        .map(c => ({
          nombre: c.name,
          lista: listsMap[c.idList] || 'Desconocida',
          asignados: (c.idMembers || []).map(id => membersMap[id] || id).join(', ') || 'Sin asignar',
          completadaEn: c.dateLastActivity ? new Date(c.dateLastActivity).toLocaleDateString('es-ES') : 'Desconocida',
        }));
    } catch (e) {
      console.error('Error en getCompletedCardsThisSprint:', e.message);
      return [];
    }
  }
}
