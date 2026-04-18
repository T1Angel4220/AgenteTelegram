import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import axios from 'axios';

@Injectable()
export class PdfService {

    private readonly COLORS = {
        primary:   '#0f172a', // Azul marino oscuro
        accent:    '#6366f1', // Índigo vibrante
        success:   '#10b981', // Verde
        warning:   '#f59e0b', // Amarillo
        danger:    '#ef4444', // Rojo
        light:     '#f8fafc', // Blanco humo
        muted:     '#64748b', // Gris medio
        white:     '#ffffff',
    };

    private async generateChartImage(config: any): Promise<Buffer | null> {
        try {
            const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}`;
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            return Buffer.from(response.data);
        } catch (error) {
            console.error('QuickChart timeout:', error.message);
            return null;
        }
    }

    // Dibuja una sección con título y banda de color
    private drawSection(doc: any, title: string, y: number, color: string): number {
        doc.rect(50, y, 495, 22).fill(color);
        doc.fillColor(this.COLORS.white).fontSize(9).font('Helvetica-Bold')
           .text(title.toUpperCase(), 58, y + 7);
        return y + 22;
    }

    async generateReport(content: string, metrics?: any): Promise<Buffer> {
        // Obtener gráficos en paralelo
        let barChartBuffer: any = null;
        let pieChartBuffer: any = null;

        if (metrics && Object.keys(metrics.miembros || {}).length > 0) {
            const barConfig = {
                type: 'bar',
                data: {
                    labels: Object.keys(metrics.miembros),
                    datasets: [{
                        label: 'Tareas',
                        data: Object.values(metrics.miembros),
                        backgroundColor: ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6']
                    }]
                },
                options: { 
                    legend: { display: false },
                    scales: { yAxes: [{ ticks: { beginAtZero: true } }] },
                    title: { display: true, text: 'Carga por miembro', fontSize: 14 }
                }
            };
            const pieConfig = {
                type: 'doughnut',
                data: {
                    labels: Object.keys(metrics.listas),
                    datasets: [{
                        data: Object.values(metrics.listas),
                        backgroundColor: ['#10b981','#6366f1','#f59e0b','#ef4444','#0f172a']
                    }]
                },
                options: { 
                    legend: { position: 'bottom' },
                    title: { display: true, text: 'Estado del tablero', fontSize: 14 }
                }
            };
            [barChartBuffer, pieChartBuffer] = await Promise.all([
                this.generateChartImage(barConfig),
                this.generateChartImage(pieConfig)
            ]);
        }

        // Parsear el contenido estructurado de la IA
        const sections = this.parseContent(content);

        return new Promise((resolve) => {
            const C = this.COLORS;
            const doc = new PDFDocument({ margin: 0, size: 'A4', info: { Title: 'Reporte Ejecutivo LUPSI' } });
            const buffers: Buffer[] = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // ═══════════════════════════════════════════
            // HEADER PREMIUM
            // ═══════════════════════════════════════════
            doc.rect(0, 0, 595, 95).fill(C.primary);
            doc.rect(0, 0, 7, 95).fill(C.accent);

            doc.fillColor(C.white).fontSize(22).font('Helvetica-Bold')
               .text('REPORTE EJECUTIVO', 30, 18);
            doc.fillColor(C.accent).fontSize(10).font('Helvetica-Bold')
               .text('LUPSI · AGENTE AUTÓNOMO DE GESTIÓN', 30, 46);
            doc.fillColor(C.muted).fontSize(8).font('Helvetica')
               .text(`Generado el ${new Date().toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}`, 30, 62);
            doc.fillColor(C.muted).text('Proyecto: LUPSI ChatOps  ·  Plataforma: Trello + GitHub', 30, 76);

            // SEMÁFORO (esquina derecha)
            const semaforo = sections.semaforo || 'AMARILLO';
            const semaforoColor = semaforo === 'VERDE' ? C.success : semaforo === 'ROJO' ? C.danger : C.warning;
            doc.rect(440, 15, 120, 65).fill(semaforoColor).roundedRect(440, 15, 120, 65, 6).fill(semaforoColor);
            doc.fillColor(C.white).fontSize(10).font('Helvetica-Bold').text('ESTADO GLOBAL', 447, 22);
            doc.fontSize(22).font('Helvetica-Bold').text(semaforo, 447, 37);

            // LÍNEA ACCENT
            doc.rect(0, 95, 595, 4).fill(C.accent);

            let y = 110;
            const pageW = 495;

            // ═══════════════════════════════════════════
            // GRÁFICOS (si los tenemos)
            // ═══════════════════════════════════════════
            if (barChartBuffer || pieChartBuffer) {
                y = this.drawSection(doc, '📊  Métricas del Proyecto', y, C.primary);
                y += 5;
                if (barChartBuffer) doc.image(barChartBuffer, 50, y, { width: 240, height: 145 });
                if (pieChartBuffer) doc.image(pieChartBuffer, 305, y, { width: 240, height: 145 });
                y += 155;
            }

            // ═══════════════════════════════════════════
            // ALERTAS / RIESGOS
            // ═══════════════════════════════════════════
            if (sections.alertas) {
                y = this.drawSection(doc, '⚠️  Alertas y Riesgos Críticos', y, C.danger);
                y += 8;
                doc.rect(50, y - 2, pageW, sections.alertas.split('\n').length * 13 + 12).fill('#fef2f2');
                doc.fillColor('#7f1d1d').fontSize(9).font('Helvetica')
                   .text(sections.alertas.trim(), 58, y, { width: pageW - 16, lineGap: 2 });
                y += sections.alertas.split('\n').length * 13 + 18;
            }

            // ═══════════════════════════════════════════
            // ESTADO GENERAL
            // ═══════════════════════════════════════════
            if (sections.estado) {
                y = this.drawSection(doc, '📋  Estado del Sprint', y, C.accent);
                y += 8;
                doc.fillColor(C.primary).fontSize(9).font('Helvetica')
                   .text(sections.estado.trim(), 58, y, { width: pageW - 16, lineGap: 3 });
                y += (sections.estado.split('\n').length * 13) + 16;
            }

            // ═══════════════════════════════════════════
            // EQUIPO
            // ═══════════════════════════════════════════
            if (sections.equipo) {
                y = this.drawSection(doc, '👥  Desempeño del Equipo', y, C.muted);
                y += 8;
                doc.fillColor(C.primary).fontSize(9).font('Helvetica')
                   .text(sections.equipo.trim(), 58, y, { width: pageW - 16, lineGap: 3 });
                y += (sections.equipo.split('\n').length * 13) + 16;
            }

            // ═══════════════════════════════════════════
            // DECISIONES RECOMENDADAS
            // ═══════════════════════════════════════════
            if (sections.decisiones) {
                y = this.drawSection(doc, '✅  Decisiones Recomendadas para Hoy', y, C.success);
                y += 8;
                doc.rect(50, y - 2, pageW, sections.decisiones.split('\n').length * 13 + 12).fill('#f0fdf4');
                doc.fillColor('#14532d').fontSize(9).font('Helvetica-Bold')
                   .text(sections.decisiones.trim(), 58, y, { width: pageW - 16, lineGap: 4 });
                y += sections.decisiones.split('\n').length * 13 + 18;
            }

            // PIE DE PÁGINA
            doc.rect(0, 810, 595, 32).fill(C.primary);
            doc.fillColor(C.muted).fontSize(7).font('Helvetica')
               .text('Documento confidencial · Generado autónomamente por LUPSI · Proyecto de Gestión de Software - UTA', 30, 820);
            doc.fillColor(C.accent).text('lupsi.bot', 530, 820);

            doc.end();
        });
    }

    // Parser que extrae secciones del texto de la IA
    private parseContent(content: string): any {
        const result: any = {};
        
        // Detectar semáforo
        const upper = content.toUpperCase();
        if (upper.includes('ROJO') || upper.includes('CRÍTICO') || upper.includes('RIESGO ALTO')) {
            result.semaforo = 'ROJO';
        } else if (upper.includes('VERDE') || upper.includes('TODO EN ORDEN') || upper.includes('EXCELENTE')) {
            result.semaforo = 'VERDE';
        } else {
            result.semaforo = 'AMARILLO';
        }

        // Extraer secciones por etiquetas
        const sectionMap: Record<string, RegExp> = {
            alertas:    /(?:ALERTAS?|RIESGOS?|PROBLEMAS?)[\s:]+(.+?)(?=\n[A-ZÁÉÍÓÚ]{3,}|\n\n\n|$)/si,
            estado:     /(?:ESTADO|SPRINT|AVANCE)[\s:]+(.+?)(?=\n[A-ZÁÉÍÓÚ]{3,}|\n\n\n|$)/si,
            equipo:     /(?:EQUIPO|DESEMPE[NÑ]O|MIEMBROS?)[\s:]+(.+?)(?=\n[A-ZÁÉÍÓÚ]{3,}|\n\n\n|$)/si,
            decisiones: /(?:DECISIONES?|RECOMENDACIONES?|ACCIONES?)[\s:]+(.+?)(?=\n[A-ZÁÉÍÓÚ]{3,}|\n\n\n|$)/si
        };

        for (const [key, regex] of Object.entries(sectionMap)) {
            const match = content.match(regex);
            result[key] = match ? match[1].trim().substring(0, 500) : null;
        }

        // Si la IA no usó secciones, todo va al estado
        if (!result.estado && !result.alertas && !result.decisiones) {
            result.estado = content.trim().substring(0, 800);
        }

        return result;
    }
}
