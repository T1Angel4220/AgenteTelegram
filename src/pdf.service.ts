import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import axios from 'axios';

@Injectable()
export class PdfService {

    private readonly COLORS = {
        primary:   '#1e293b', // Slate 800
        accent:    '#4f46e5', // Indigo 600
        success:   '#059669', // Emerald 600
        warning:   '#d97706', // Amber 600
        danger:    '#dc2626', // Red 600
        light:     '#f8fafc', // Slate 50
        muted:     '#94a3b8', // Slate 400
        white:     '#ffffff',
        border:    '#e2e8f0', // Slate 200
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
        doc.rect(50, y, 495, 24).fill(color);
        doc.fillColor(this.COLORS.white).fontSize(10).font('Helvetica-Bold')
           .text(title.toUpperCase(), 60, y + 7);
        return y + 30;
    }

    private drawKPICard(doc: any, x: number, y: number, label: string, value: string, color: string) {
        const width = 90;
        const height = 45;
        doc.rect(x, y, width, height).fill(this.COLORS.white);
        doc.rect(x, y, 3, height).fill(color);
        
        doc.fillColor(this.COLORS.muted).fontSize(7).font('Helvetica')
           .text(label.toUpperCase(), x + 10, y + 10);
        
        doc.fillColor(this.COLORS.primary).fontSize(14).font('Helvetica-Bold')
           .text(value, x + 10, y + 22);
    }

    // Dibuja una tabla simple
    private drawTable(doc: any, y: number, headers: string[], rows: string[][], colWidths: number[]): number {
        const startX = 50;
        let currentY = y;
        const rowHeight = 18;

        // Header
        doc.rect(startX, currentY, 495, rowHeight).fill(this.COLORS.primary);
        doc.fillColor(this.COLORS.white).fontSize(8).font('Helvetica-Bold');
        let currentX = startX;
        headers.forEach((h, i) => {
            doc.text(h.toUpperCase(), currentX + 5, currentY + 5, { width: colWidths[i] - 5 });
            currentX += colWidths[i];
        });
        currentY += rowHeight;

        // Rows
        doc.fontSize(8).font('Helvetica');
        rows.forEach((row, rowIndex) => {
            if (currentY > 730) { doc.addPage(); currentY = 50; }

            // Calcular altura máxima de la fila basándonos en el contenido envuelto
            let maxRowHeight = 18;
            row.forEach((cell, cellIndex) => {
                if (cellIndex < colWidths.length) {
                    const h = doc.heightOfString(cell || '-', { width: colWidths[cellIndex] - 10 });
                    if (h + 10 > maxRowHeight) maxRowHeight = h + 10;
                }
            });

            // Fondo alterno
            if (rowIndex % 2 !== 0) {
                doc.rect(startX, currentY, 495, maxRowHeight).fill('#f8fafc');
            }
            
            doc.fillColor(this.COLORS.primary);
            currentX = startX;
            row.forEach((cell, cellIndex) => {
                if (cellIndex < colWidths.length) {
                    const width = colWidths[cellIndex] - 10;
                    doc.text(cell || '-', currentX + 5, currentY + 5, { width: width });
                    currentX += colWidths[cellIndex];
                }
            });
            
            // Dibujar línea inferior de la fila para estructura
            doc.moveTo(startX, currentY + maxRowHeight).lineTo(startX + 495, currentY + maxRowHeight)
               .lineWidth(0.5).strokeColor(this.COLORS.border).stroke();

            currentY += maxRowHeight;
        });

        return currentY + 10;
    }

    async generateReport(content: string, metrics?: any): Promise<Buffer> {
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

            const promises = [this.generateChartImage(barConfig), this.generateChartImage(pieConfig)];
            if (burndownConfig) promises.push(this.generateChartImage(burndownConfig));

            const chartResults = await Promise.all(promises);
            barChartBuffer = chartResults[0];
            pieChartBuffer = chartResults[1];
            if (burndownConfig) burndownChartBuffer = chartResults[2];
        }

        const sections = this.parseContent(content);

        return new Promise((resolve) => {
            const C = this.COLORS;
            const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, info: { Title: 'Reporte SKT Software Solution' } });
            const buffers: Buffer[] = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // ═══════════════════════════════════════════
            // HEADER SKT SOLUTIONS
            // ═══════════════════════════════════════════
            doc.rect(0, 0, 595, 120).fill(C.primary);
            doc.rect(0, 115, 595, 5).fill(C.accent);

            doc.fillColor(C.white).fontSize(20).font('Helvetica-Bold')
               .text('INFORME DE ESTADO DEL PROYECTO', 40, 35);
            doc.fillColor(C.muted).fontSize(12).font('Helvetica-Bold')
               .text('SKT Software Solution', 40, 60);
            doc.fillColor(C.muted).fontSize(9).font('Helvetica')
               .text(`Software, Knowledge, and Trust  |  Gestor: Angel Ayuquina`, 40, 75);

            // SEMÁFORO (Badge moderno)
            const semaforo = sections.semaforo || 'AMARILLO';
            const semaforoColor = semaforo === 'VERDE' ? C.success : semaforo === 'ROJO' ? C.danger : C.warning;
            
            doc.roundedRect(440, 30, 120, 50, 4).fill(C.white);
            doc.fillColor(semaforoColor).fontSize(7).font('Helvetica-Bold').text('SALUD DEL PROYECTO', 450, 40);
            doc.fontSize(18).text(semaforo, 450, 52);

            let y = 140;
            const pageW = 495;

            // KPI CARDS
            if (metrics) {
                const total = metrics.total || 0;
                const progress = metrics.enProgreso || 0;
                const pending = metrics.pendientes || 0;
                const urgent = metrics.urgentes || 0;

                this.drawKPICard(doc, 50, y, 'Total', total.toString(), C.primary);
                this.drawKPICard(doc, 150, y, 'Progreso', progress.toString(), C.accent);
                this.drawKPICard(doc, 250, y, 'Pendientes', pending.toString(), C.warning);
                this.drawKPICard(doc, 350, y, 'Críticas', urgent.toString(), C.danger);
                this.drawKPICard(doc, 450, y, 'Emisión', new Date().toLocaleDateString('es-ES'), C.success);
                y += 70;
                // TABLA DE CUMPLIMIENTO POR FASES
                if (metrics.detallesListas && metrics.detallesListas.length > 0) {
                    y = this.drawSection(doc, 'CUMPLIMIENTO POR FASES DEL PROYECTO', y, C.primary);
                    y += 10;
                    const rows = metrics.detallesListas.map((l: any) => [
                        l.nombre,
                        l.total.toString(),
                        l.completas.toString(),
                        `${l.porcentaje}%`
                    ]);
                    y = this.drawTable(doc, y, ['Fase / Lista', 'Total', 'OK', '% Compl.'], rows, [250, 80, 80, 85]);
                    y += 10;
                }
            }

            y += 5;

            // Fallback: Si no se detectaron secciones estructuradas, imprimir todo el contenido
            const hasStructuredData = Object.values(sections).some(v => v !== null && v !== 'AMARILLO' && v !== 'ROJO' && v !== 'VERDE' && v !== '');
            if (!hasStructuredData) {
                doc.fillColor(C.primary).fontSize(10).font('Helvetica-Bold').text('CONTENIDO DEL REPORTE:', 50, y);
                y += 20;
                doc.fontSize(9).font('Helvetica').text(content, 50, y, { width: pageW });
                doc.end();
                return;
            }

            // 1. RESUMEN EJECUTIVO
            if (sections.resumen) {
                y = this.drawSection(doc, '1. RESUMEN EJECUTIVO', y, C.accent);
                y += 15;
                const textHeight = doc.heightOfString(sections.resumen, { width: pageW - 10, lineGap: 2 });
                doc.fillColor(C.primary).fontSize(9).font('Helvetica')
                   .text(sections.resumen, 55, y, { width: pageW - 10, lineGap: 2 });
                y += textHeight + 20;
            }

            // 2. TAREAS EN EJECUCIÓN
            if (sections.tareas_ejecucion) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '2. TAREAS EN EJECUCIÓN', y, C.accent);
                y += 15;
                const lines = sections.tareas_ejecucion.split('\n').map(l => l.replace(/^[•\-\*]\s*/, ''));
                const rows = lines.map(l => l.split('|').map(c => c.trim())).filter(r => r.length >= 2);
                
                if (rows.length > 0) {
                    y = this.drawTable(doc, y, ['Tarea', 'Encargado', 'Plazo', 'Inactividad'], rows, [185, 110, 115, 85]);
                } else {
                    doc.fillColor(C.primary).fontSize(9).text('No hay tareas activas en este momento.', 55, y);
                    y += 20;
                }
            }

            // 3. TAREAS PENDIENTES
            if (sections.tareas_pendientes) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '3. TAREAS PENDIENTES / EN ESPERA', y, C.primary);
                y += 15;
                const lines = sections.tareas_pendientes.split('\n').map(l => l.replace(/^[•\-\*]\s*/, ''));
                const rows = lines.map(l => l.split('|').map(c => c.trim())).filter(r => r.length >= 2);
                
                if (rows.length > 0) {
                    y = this.drawTable(doc, y, ['Tarea', 'Encargado', 'Plazo', 'Inactividad'], rows, [185, 110, 115, 85]);
                } else {
                    const textHeight = doc.heightOfString(sections.tareas_pendientes, { width: pageW - 10 });
                    doc.fillColor(C.primary).fontSize(9).text(sections.tareas_pendientes, 55, y);
                    y += textHeight + 20;
                }
            }

            // 4. ANÁLISIS DE FLUJO
            if (sections.flujo) {
                if (y > 600) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '4. ANÁLISIS DE FLUJO Y BLOQUEOS (STANDUP)', y, C.primary);
                y += 15;
                const textHeight = doc.heightOfString(sections.flujo, { width: pageW - 10 });
                doc.fillColor(C.primary).fontSize(9).text(sections.flujo, 55, y, { width: pageW - 10 });
                y += textHeight + 15;

                if (burndownChartBuffer) {
                    if (y > 600) { doc.addPage(); y = 50; }
                    doc.image(burndownChartBuffer, 50, y, { width: 495, height: 160 });
                    y += 180;
                }
            }

            // 5. ACTIVIDAD TÉCNICA
            if (sections.codigo) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '5. ACTIVIDAD TÉCNICA Y REPOSITORIO (GITHUB)', y, C.primary);
                y += 15;
                
                const lines = sections.codigo.split('\n').map(l => l.replace(/^[•\-\*]\s*/, ''));
                const tableLines = lines.filter(l => l.includes('|'));
                const textLines = lines.filter(l => !l.includes('|') && l.trim() !== '');
                
                if (tableLines.length > 0) {
                    const rows = tableLines.map(l => l.split('|').map(c => c.trim())).filter(r => r.length >= 2);
                    y = this.drawTable(doc, y, ['Fecha', 'Autor', 'Mensaje', 'Rama'], rows, [70, 100, 245, 80]);
                    y += 10;
                }
                
                if (textLines.length > 0) {
                    const text = textLines.join('\n');
                    const textHeight = doc.heightOfString(text, { width: pageW - 10 });
                    doc.fillColor(C.primary).fontSize(9).text(text, 55, y, { width: pageW - 10 });
                    y += textHeight + 20;
                }
            }

            // 6. MATRIZ DE RIESGOS
            if (sections.riesgos) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '6. MATRIZ DE RIESGOS REALES', y, C.danger);
                y += 15;
                const lines = sections.riesgos.split('\n').map(l => l.replace(/^[•\-\*]\s*/, ''));
                const rows = lines.map(l => l.split('|').map(c => c.trim())).filter(r => r.length >= 2);
                
                if (rows.length > 0) {
                    y = this.drawTable(doc, y, ['Riesgo', 'Impacto', 'Mitigación', 'Resp.'], rows, [150, 60, 200, 85]);
                } else {
                    const textHeight = doc.heightOfString(sections.riesgos, { width: pageW - 10 });
                    doc.fillColor(C.primary).fontSize(9).text(sections.riesgos, 55, y);
                    y += textHeight + 20;
                }
            }

            // 7. ALERTAS CRÍTICAS
            if (sections.alertas) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '7. ALERTAS CRÍTICAS Y RESOLUCIÓN', y, C.danger);
                y += 15;
                
                const rows = sections.alertas.split('\n')
                    .map(l => l.replace(/^[•\-\*]\s*/, '').trim())
                    .filter(l => l.includes('|'))
                    .map(l => {
                        // Limpiar pipes al inicio y final antes de dividir
                        const cleanLine = l.replace(/^\|/, '').replace(/\|$/, '');
                        return cleanLine.split('|').map(c => c.trim());
                    })
                    .filter(r => r.length >= 2)
                    .filter(r => {
                        const cell1 = r[0].toUpperCase();
                        const cell2 = r[1] ? r[1].toUpperCase() : '';
                        return cell1 !== '' && 
                               !cell1.includes('PROBLEMA DETECTADO') && 
                               !cell1.includes('---') && 
                               !cell2.includes('---');
                    });
                
                if (rows.length > 0) {
                    y = this.drawTable(doc, y, ['Problema Detectado', 'Acción de Resolución'], rows, [240, 255]);
                } else {
                    const textHeight = doc.heightOfString(sections.alertas, { width: pageW - 10 });
                    doc.fillColor(C.primary).fontSize(9).text(sections.alertas, 55, y, { width: pageW - 10 });
                    y += textHeight + 20;
                }
            }

            // 8. RECOMENDACIONES
            if (sections.proximos) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '8. RECOMENDACIONES Y PRÓXIMOS PASOS', y, C.success);
                y += 15;
                const textHeight = doc.heightOfString(sections.proximos, { width: pageW - 10, lineGap: 2 });
                doc.fillColor(C.primary).fontSize(9).text(sections.proximos, 55, y, { width: pageW - 10, lineGap: 2 });
                y += textHeight + 20;
            }

            // 9. PRESUPUESTO Y RECURSOS
            if (sections.presupuesto) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '9. PRESUPUESTO Y RECURSOS', y, C.accent);
                y += 15;
                const textHeight = doc.heightOfString(sections.presupuesto, { width: pageW - 10, lineGap: 2 });
                doc.fillColor(C.primary).fontSize(9).text(sections.presupuesto, 55, y, { width: pageW - 10, lineGap: 2 });
                y += textHeight + 20;
            }

            // 10. NOTIFICACIONES AL GESTOR
            if (sections.notificaciones) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '10. NOTIFICACIONES AL GESTOR', y, C.danger);
                y += 15;
                const textHeight = doc.heightOfString(sections.notificaciones, { width: pageW - 10, lineGap: 2 });
                doc.fillColor(C.primary).fontSize(9).text(sections.notificaciones, 55, y, { width: pageW - 10, lineGap: 2 });
                y += textHeight + 20;
            }

            // 11. DECISIONES AUTÓNOMAS SUGERIDAS
            if (sections.decisiones) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '11. DECISIONES AUTÓNOMAS SUGERIDAS', y, C.warning);
                y += 15;
                const textHeight = doc.heightOfString(sections.decisiones, { width: pageW - 10, lineGap: 2 });
                doc.fillColor(C.primary).fontSize(9).text(sections.decisiones, 55, y, { width: pageW - 10, lineGap: 2 });
                y += textHeight + 20;
            }

            // 12. ESTADO DEL EQUIPO Y RETIROS
            if (sections.equipo) {
                if (y > 650) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '12. ESTADO DEL EQUIPO Y RETIROS', y, C.primary);
                y += 15;
                const textHeight = doc.heightOfString(sections.equipo, { width: pageW - 10, lineGap: 2 });
                doc.fillColor(C.primary).fontSize(9).text(sections.equipo, 55, y, { width: pageW - 10, lineGap: 2 });
                y += textHeight + 20;
            }

            // Footer
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.rect(0, 815, 595, 30).fill(C.primary);
                doc.fillColor(C.muted).fontSize(7).text(`Generado por LUPSI para SKT Software Solution  |  Página ${i + 1} de ${pageCount}`, 35, 825);
            }

            doc.end();
        });
    }

    private parseContent(content: string): any {
        const result: any = {
            estado_general: '',
            resumen: '',
            tareas_ejecucion: '',
            tareas_pendientes: '',
            flujo: '',
            codigo: '',
            riesgos: '',
            alertas: '',
            proximos: '',
            presupuesto: '',
            notificaciones: '',
            decisiones: '',
            equipo: ''
        };
        
        const lines = content.split('\n');
        let currentSection = 'estado_general';
        
        for (let line of lines) {
            const cleanLine = line.replace(/[*#_~`>]/g, '').trim();
            const upperLine = cleanLine.toUpperCase();
            
            // Ignorar encabezados redundantes que la IA a veces repite
            if (upperLine.startsWith('TABLA DE COMMITS') || upperLine.startsWith('ANÁLISIS DE VALOR')) continue;
            
            if (upperLine.includes('ESTADO GENERAL')) { currentSection = 'estado_general'; continue; }
            if (upperLine.includes('1. RESUMEN EJECUTIVO')) { currentSection = 'resumen'; continue; }
            if (upperLine.includes('2. TAREAS EN EJECUCIÓN') || upperLine.includes('2. TAREAS EN EJECUCION')) { currentSection = 'tareas_ejecucion'; continue; }
            if (upperLine.includes('3. TAREAS PENDIENTES')) { currentSection = 'tareas_pendientes'; continue; }
            if (upperLine.includes('4. ANÁLISIS DE FLUJO') || upperLine.includes('4. ANALISIS DE FLUJO')) { currentSection = 'flujo'; continue; }
            if (upperLine.includes('5. ACTIVIDAD TÉCNICA') || upperLine.includes('5. ACTIVIDAD TECNICA')) { currentSection = 'codigo'; continue; }
            if (upperLine.includes('6. MATRIZ DE RIESGOS')) { currentSection = 'riesgos'; continue; }
            if (upperLine.includes('7. ALERTAS') || upperLine.includes('7. ALERTAS CRITICAS')) { currentSection = 'alertas'; continue; }
            if (upperLine.includes('8. RECOMENDACIONES')) { currentSection = 'proximos'; continue; }
            if (upperLine.includes('9. PRESUPUESTO')) { currentSection = 'presupuesto'; continue; }
            if (upperLine.includes('10. NOTIFICACIONES')) { currentSection = 'notificaciones'; continue; }
            if (upperLine.includes('11. DECISIONES')) { currentSection = 'decisiones'; continue; }
            if (upperLine.includes('12. ESTADO DEL EQUIPO')) { currentSection = 'equipo'; continue; }
            
            if (line.trim()) {
                // Eliminar markdown de la línea antes de guardarla
                const finalLine = line.replace(/[*#_~`>]/g, '').trim();
                result[currentSection] += finalLine + '\n';
            }
        }

        for (const key of Object.keys(result)) {
            result[key] = result[key].trim() || null;
        }

        const estadoUpper = (result.estado_general || '').toUpperCase();
        if (estadoUpper.includes('ROJO')) result.semaforo = 'ROJO';
        else if (estadoUpper.includes('VERDE')) result.semaforo = 'VERDE';
        else result.semaforo = 'AMARILLO';

        return result;
    }
}
