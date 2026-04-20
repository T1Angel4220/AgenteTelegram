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
        let burndownChartBuffer: any = null;

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
            
            // Burndown Chart Configuration
            let burndownConfig: any = null;
            if (metrics.burndown && metrics.burndown.length > 0) {
                burndownConfig = {
                    type: 'line',
                    data: {
                        labels: metrics.burndown.map((b: any) => b.fecha),
                        datasets: [{
                            label: 'Tareas Pendientes',
                            data: metrics.burndown.map((b: any) => b.pendientes),
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.1
                        }]
                    },
                    options: {
                        legend: { display: false },
                        scales: { yAxes: [{ ticks: { beginAtZero: true } }] },
                        title: { display: true, text: 'Burndown del Sprint', fontSize: 14 }
                    }
                };
            }

            const promises = [
                this.generateChartImage(barConfig),
                this.generateChartImage(pieConfig)
            ];
            
            if (burndownConfig) {
                promises.push(this.generateChartImage(burndownConfig));
            }

            const chartResults = await Promise.all(promises);
            barChartBuffer = chartResults[0];
            pieChartBuffer = chartResults[1];
            if (burndownConfig) burndownChartBuffer = chartResults[2];
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
            // ESTADO GENERAL EXPLICADO
            // ═══════════════════════════════════════════
            if (sections.estado_general) {
                doc.fillColor(semaforoColor).fontSize(11).font('Helvetica-Bold')
                   .text(`ESTADO: ${sections.estado_general}`, 50, y, { width: pageW });
                y += 25;
            }

            // ═══════════════════════════════════════════
            // RESUMEN EJECUTIVO
            // ═══════════════════════════════════════════
            if (sections.resumen) {
                y = this.drawSection(doc, 'RESUMEN EJECUTIVO', y, C.accent);
                y += 8;
                doc.fillColor(C.primary).fontSize(10).font('Helvetica')
                   .text(sections.resumen.trim(), 58, y, { width: pageW - 16, lineGap: 3 });
                y += (sections.resumen.split('\n').length * 13) + 20;
            }

            // ═══════════════════════════════════════════
            // INDICADORES CLAVE (Texto)
            // ═══════════════════════════════════════════
            if (sections.indicadores) {
                y = this.drawSection(doc, 'INDICADORES CLAVE', y, C.primary);
                y += 8;
                doc.fillColor(C.muted).fontSize(10).font('Helvetica-Bold')
                   .text(sections.indicadores.trim(), 58, y, { width: pageW - 16, lineGap: 4 });
                y += sections.indicadores.split('\n').length * 14 + 18;
            }

            // ═══════════════════════════════════════════
            // GRÁFICOS (Burndown y Métricas)
            // ═══════════════════════════════════════════
            if (barChartBuffer || pieChartBuffer || burndownChartBuffer) {
                // y = this.drawSection(doc, 'ANÁLISIS GRÁFICO', y, C.primary);
                y += 5;
                
                if (burndownChartBuffer) {
                    doc.image(burndownChartBuffer, 50, y, { width: 495, height: 180 });
                    y += 190;
                }
                
                if (barChartBuffer && pieChartBuffer) {
                    doc.image(barChartBuffer, 50, y, { width: 240, height: 145 });
                    doc.image(pieChartBuffer, 305, y, { width: 240, height: 145 });
                    y += 155;
                } else if (barChartBuffer) {
                    doc.image(barChartBuffer, 175, y, { width: 240, height: 145 });
                    y += 155;
                } else if (pieChartBuffer) {
                    doc.image(pieChartBuffer, 175, y, { width: 240, height: 145 });
                    y += 155;
                }
                y += 10;
            }

            // ═══════════════════════════════════════════
            // RIESGOS Y PROBLEMAS
            // ═══════════════════════════════════════════
            if (sections.riesgos) {
                y = this.drawSection(doc, 'RIESGOS Y PROBLEMAS CRÍTICOS', y, C.danger);
                y += 8;
                const linesCount = sections.riesgos.split('\n').length;
                doc.rect(50, y - 2, pageW, linesCount * 14 + 12).fill('#fef2f2');
                doc.fillColor('#7f1d1d').fontSize(10).font('Helvetica')
                   .text(sections.riesgos.trim(), 58, y, { width: pageW - 16, lineGap: 4 });
                y += linesCount * 14 + 18;
            }

            // ═══════════════════════════════════════════
            // DESEMPEÑO DEL EQUIPO
            // ═══════════════════════════════════════════
            if (sections.equipo) {
                y = this.drawSection(doc, 'DESEMPEÑO DEL EQUIPO', y, C.muted);
                y += 8;
                doc.fillColor(C.primary).fontSize(10).font('Helvetica')
                   .text(sections.equipo.trim(), 58, y, { width: pageW - 16, lineGap: 3 });
                y += (sections.equipo.split('\n').length * 13) + 20;
            }

            // ═══════════════════════════════════════════
            // CONCLUSIONES Y ACCIONES
            // ═══════════════════════════════════════════
            if (sections.conclusiones) {
                y = this.drawSection(doc, 'CONCLUSIONES Y ACCIONES ESTRATÉGICAS', y, C.success);
                y += 8;
                const linesCount = sections.conclusiones.split('\n').length;
                doc.rect(50, y - 2, pageW, linesCount * 14 + 12).fill('#f0fdf4');
                doc.fillColor('#14532d').fontSize(10).font('Helvetica-Bold')
                   .text(sections.conclusiones.trim(), 58, y, { width: pageW - 16, lineGap: 4 });
                y += linesCount * 14 + 18;
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
    // Parser que extrae secciones del texto de la IA
    private parseContent(content: string): any {
        const result: any = {
            estado_general: '',
            resumen: '',
            indicadores: '',
            riesgos: '',
            equipo: '',
            conclusiones: ''
        };
        
        // Limpiar Markdown (asteriscos y hashtags)
        const cleanContent = content.replace(/[\*#]/g, '');
        
        let currentSection = 'estado_general'; // Default fallback
        const lines = cleanContent.split('\n');
        
        for (let line of lines) {
            line = line.trim();
            const upperLine = line.toUpperCase();
            
            // Detección exacta de títulos
            if (upperLine.startsWith('ESTADO GENERAL')) { currentSection = 'estado_general'; continue; }
            if (upperLine.startsWith('RESUMEN EJECUTIVO')) { currentSection = 'resumen'; continue; }
            if (upperLine.startsWith('INDICADORES CLAVE')) { currentSection = 'indicadores'; continue; }
            if (upperLine.startsWith('RIESGOS Y PROBLEMAS') || upperLine.startsWith('RIESGOS')) { currentSection = 'riesgos'; continue; }
            if (upperLine.startsWith('DESEMPEÑO DEL EQUIPO') || upperLine.startsWith('EQUIPO')) { currentSection = 'equipo'; continue; }
            if (upperLine.startsWith('CONCLUSIONES Y ACCIONES') || upperLine.startsWith('CONCLUSIONES')) { currentSection = 'conclusiones'; continue; }
            
            if (line) {
                // Remove "- " or "• " from the start if we want to format it ourselves, 
                // but PDFKit can just print the string. We leave the text as is.
                result[currentSection] += line + '\n';
            }
        }

        // Limpiar espacios finales y detectar semáforo
        for (const key of Object.keys(result)) {
            result[key] = result[key].trim() || null;
        }

        // Analizar la primera línea (estado general) para el semáforo
        const estadoUpper = (result.estado_general || '').toUpperCase();
        if (estadoUpper.includes('ROJO')) result.semaforo = 'ROJO';
        else if (estadoUpper.includes('VERDE')) result.semaforo = 'VERDE';
        else result.semaforo = 'AMARILLO';

        return result;
    }
}
