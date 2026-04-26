import { Injectable } from '@nestjs/common';
import { TrelloService } from './trello.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ConsistencyService
 * Reconcilia las respuestas del standup con el estado real de Trello.
 * Detecta 3 tipos de inconsistencias:
 *  1. Dev dice "terminé X" pero la tarjeta sigue en "En Proceso" → Trello desactualizado
 *  2. Dev dice "empecé X" pero no tiene ninguna tarjeta en "En Proceso" → Dev sin tarea visible
 *  3. Tarjeta asignada a dev que no respondió al standup → Posible ausencia
 */
@Injectable()
export class ConsistencyService {
  private readonly standupPath = path.join(process.cwd(), 'standup_hoy.json');
  private readonly inconsistenciasPath = path.join(process.cwd(), 'inconsistencias.json');

  constructor(private readonly trelloService: TrelloService) {}

  /**
   * Corre el análisis de consistencia. Devuelve un array de alertas.
   * Llamado desde CronService a las 11:30 después de que todos hayan respondido el standup.
   */
  async checkConsistency(): Promise<{ tipo: string; miembro: string; detalle: string; action?: any }[]> {
    const alertas: { tipo: string; miembro: string; detalle: string; action?: any }[] = [];

    try {
      // 1. Leer respuestas del standup de hoy
      if (!fs.existsSync(this.standupPath)) return alertas;
      const standupRaw: { chatId: string; nombre: string; respuesta: string; hora: string }[] =
        JSON.parse(fs.readFileSync(this.standupPath, 'utf-8'));

      const hoy = new Date().toLocaleDateString('es-ES');
      const respuestasHoy = standupRaw.filter(r => {
        return new Date(r.hora).toLocaleDateString('es-ES') === hoy;
      });

      if (respuestasHoy.length === 0) return alertas;

      // 2. Obtener estado real del tablero
      const topologyRaw = await this.trelloService.getBoardTopologyForAI();
      const topology = JSON.parse(topologyRaw);

      const listasEnProceso = topology.listas
        .filter((l: any) => /doing|progreso|proceso|wip|in.?progress/i.test(l.name))
        .map((l: any) => l.id);

      const listaDone = topology.listas
        .find((l: any) => /done|completado|terminado|hecho/i.test(l.name))?.id;

      const listaDoing = listasEnProceso[0];

      // 3. Construir mapa: nombre → tarjetas (objeto completo) en proceso
      const tarjetasEnProcesoPorMiembro: Record<string, any[]> = {};

      for (const miembro of topology.miembros) {
        const enProceso = topology.tarjetas
          .filter((c: any) => listasEnProceso.includes(c.idList) && (c.idMembers || []).includes(miembro.id));

        if (enProceso.length > 0) tarjetasEnProcesoPorMiembro[miembro.fullName] = enProceso;
      }

      // 4. Analizar cada respuesta del standup
      for (const resp of respuestasHoy) {
        const nombre = resp.nombre;
        
        const enProceso = tarjetasEnProcesoPorMiembro[nombre] || [];
        
        // Detectar si el dev menciona que terminó algo
        const mencionaTerminado = /termin[eé]|complet[eé]|listo|done|finaliz[eé]|entregu[eé]|ya lo hice|subí|hice commit/i.test(resp.respuesta);

        // Búsqueda de coincidencia específica con el nombre de sus tareas en proceso
        const mencionaTareaEspecifica = enProceso.some(card => {
          const words = card.name.toLowerCase().split(' ').filter(w => w.length > 3);
          return words.some(w => resp.respuesta.toLowerCase().includes(w));
        });

        if (mencionaTerminado || mencionaTareaEspecifica) {
          if (enProceso.length > 0) {
            const card = enProceso[0]; // Proponemos la primera
            alertas.push({
              tipo: 'TRELLO_DESACTUALIZADO',
              miembro: nombre,
              detalle: `Dice haber terminado algo, pero tiene "${card.name}" aún en "En Proceso".`,
              action: listaDone ? {
                tipo: 'MOVE_CARD',
                cardId: card.id,
                cardName: card.name,
                targetListId: listaDone,
                rationale: `Sincronización automática: El dev reportó terminar la tarea en el standup.`
              } : undefined
            });
          }
        }

        // Detectar si el dev menciona que empezó algo nuevo pero no tiene tarjetas en proceso
        const mencionaEmpezar = /voy a empezar|empezaré|voy a trabajar|iniciaré|me asignaré/i.test(resp.respuesta);
        if (mencionaEmpezar) {
          const enProceso = tarjetasEnProcesoPorMiembro[nombre] || [];
          if (enProceso.length === 0) {
            alertas.push({
              tipo: 'TAREA_SIN_ASIGNAR',
              miembro: nombre,
              detalle: `Menciona que empezará a trabajar pero no tiene ninguna tarjeta en "En Proceso" en Trello.`
            });
          }
        }

        // Detectar si tiene bloqueo
        const mencionaBloqueo = /bloqueado|no puedo|esperando|falta|depende|no tengo acceso|necesito|sin respuesta/i.test(resp.respuesta);
        if (mencionaBloqueo) {
          alertas.push({
            tipo: 'BLOQUEO_DETECTADO_EN_STANDUP',
            miembro: nombre,
            detalle: `Reportó un bloqueo en el standup: "${resp.respuesta.substring(0, 100)}..."`
          });
        }
      }

      // 5. Detectar devs con tarjetas en proceso que NO respondieron el standup
      const nombresQueRespondieron = respuestasHoy.map(r => r.nombre.toLowerCase().trim());

      for (const [nombreTrello, tareas] of Object.entries(tarjetasEnProcesoPorMiembro)) {
        const respondio = nombresQueRespondieron.some(n =>
          nombreTrello.toLowerCase().includes(n) || n.includes(nombreTrello.toLowerCase())
        );

        if (!respondio) {
          alertas.push({
            tipo: 'NO_RESPONDIO_STANDUP',
            miembro: nombreTrello,
            detalle: `Tiene ${tareas.length} tarea(s) activa(s) en Trello pero NO respondió el standup hoy.`
          });
        }
      }

      // 6. Guardar alertas para que el cron las envíe
      this.saveInconsistencias(alertas);
      return alertas;

    } catch (e) {
      console.error('Error en ConsistencyService:', e.message);
      return alertas;
    }
  }

  private saveInconsistencias(alertas: any[]) {
    try {
      fs.writeFileSync(this.inconsistenciasPath, JSON.stringify({
        fecha: new Date().toISOString(),
        alertas
      }, null, 2));
    } catch (e) {
      console.error('Error guardando inconsistencias:', e.message);
    }
  }

  getLastInconsistencias(): { fecha: string; alertas: any[] } | null {
    try {
      if (!fs.existsSync(this.inconsistenciasPath)) return null;
      return JSON.parse(fs.readFileSync(this.inconsistenciasPath, 'utf-8'));
    } catch { return null; }
  }
}
