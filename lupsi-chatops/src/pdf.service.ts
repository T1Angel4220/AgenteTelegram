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
            if (currentY > 750) { doc.addPage(); currentY = 50; }
            
            // Fondo alterno
            if (rowIndex % 2 !== 0) {
                doc.rect(startX, currentY, 495, rowHeight).fill('#f1f5f9');
            }
            
            doc.fillColor(this.COLORS.primary);
            currentX = startX;
            row.forEach((cell, cellIndex) => {
                doc.text(cell || '-', currentX + 5, currentY + 5, { width: colWidths[cellIndex] - 5 });
                currentX += colWidths[cellIndex];
            });
            currentY += rowHeight;
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
            doc.rect(0, 0, 595, 100).fill(C.primary);
            doc.rect(0, 0, 10, 100).fill(C.accent);

            doc.fillColor(C.white).fontSize(20).font('Helvetica-Bold')
               .text('INFORME DE ESTADO DEL PROYECTO', 35, 25);
            doc.fillColor(C.accent).fontSize(11).font('Helvetica-Bold')
               .text('SKT Software Solution (Software, Knowledge, and Trust)', 35, 52);
            doc.fillColor(C.muted).fontSize(8).font('Helvetica')
               .text(`Gestor: Angel Ayuquina  |  Emisión: ${new Date().toLocaleDateString('es-ES')}`, 35, 72);

            // SEMÁFORO
            const semaforo = sections.semaforo || 'AMARILLO';
            const semaforoColor = semaforo === 'VERDE' ? C.success : semaforo === 'ROJO' ? C.danger : C.warning;
            doc.rect(460, 20, 100, 60).fill(semaforoColor);
            doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('SALUD PROYECTO', 465, 28);
            doc.fontSize(16).font('Helvetica-Bold').text(semaforo, 465, 42);

            let y = 120;
            const pageW = 495;

            // 1. RESUMEN EJECUTIVO
            if (sections.resumen) {
                y = this.drawSection(doc, '1. RESUMEN EJECUTIVO', y, C.accent);
                y += 10;
                doc.fillColor(C.primary).fontSize(9).font('Helvetica')
                   .text(sections.resumen, 55, y, { width: pageW - 10, lineGap: 2 });
                y += (sections.resumen.split('\n').length * 12) + 15;
            }

            // 2. ANÁLISIS DE FLUJO
            if (sections.flujo) {
                y = this.drawSection(doc, '2. ANÁLISIS DE FLUJO DE TRABAJO (TRELLO)', y, C.primary);
                y += 10;
                doc.fillColor(C.primary).fontSize(9).text(sections.flujo, 55, y, { width: pageW - 10 });
                y += (sections.flujo.split('\n').length * 12) + 10;

                if (burndownChartBuffer) {
                    doc.image(burndownChartBuffer, 50, y, { width: 495, height: 160 });
                    y += 170;
                }
            }

            // 3. SALUD DEL CÓDIGO
            if (sections.codigo) {
                if (y > 600) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '3. SALUD DEL CÓDIGO Y REPOSITORIO (GITHUB)', y, C.primary);
                y += 10;
                doc.fillColor(C.primary).fontSize(9).text(sections.codigo, 55, y, { width: pageW - 10 });
                y += (sections.codigo.split('\n').length * 12) + 15;
            }

            // 4. AUDITORÍA DE DOCUMENTACIÓN
            if (sections.documentacion) {
                if (y > 600) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '4. AUDITORÍA DE DOCUMENTACIÓN', y, C.primary);
                y += 10;
                // Intentar formatear como tabla si la IA mandó líneas con '|' o '-'
                const lines = sections.documentacion.split('\n').map(l => l.replace(/^[•\-\*]\s*/, ''));
                const rows = lines.map(l => l.split('|').map(c => c.trim()));
                if (rows.length > 1) {
                    y = this.drawTable(doc, y, ['Documento', 'Estado', 'Acción'], rows, [180, 100, 215]);
                } else {
                    doc.fillColor(C.primary).fontSize(9).text(sections.documentacion, 55, y);
                    y += (lines.length * 12) + 15;
                }
            }

            // 5. MATRIZ DE RIESGOS
            if (sections.riesgos) {
                if (y > 600) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '5. MATRIZ DE RIESGOS', y, C.danger);
                y += 10;
                const lines = sections.riesgos.split('\n').map(l => l.replace(/^[•\-\*]\s*/, ''));
                const rows = lines.map(l => l.split('|').map(c => c.trim()));
                if (rows.length > 0) {
                    y = this.drawTable(doc, y, ['Riesgo', 'Impacto', 'Mitigación', 'Resp.'], rows, [150, 60, 200, 85]);
                } else {
                    doc.fillColor(C.primary).fontSize(9).text(sections.riesgos, 55, y);
                    y += (lines.length * 12) + 15;
                }
            }

            // 6. RECOMENDACIONES
            if (sections.proximos) {
                if (y > 600) { doc.addPage(); y = 50; }
                y = this.drawSection(doc, '6. RECOMENDACIONES Y PRÓXIMOS PASOS', y, C.success);
                y += 10;
                doc.fillColor(C.primary).fontSize(9).text(sections.proximos, 55, y, { width: pageW - 10, lineGap: 2 });
                y += (sections.proximos.split('\n').length * 12) + 15;
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

    // Parser que extrae secciones del texto de la IA
    // Parser que extrae secciones del texto de la IA
    private parseContent(content: string): any {
        const result: any = {
            estado_general: '',
            resumen: '',
            flujo: '',
            codigo: '',
            documentacion: '',
            riesgos: '',
            proximos: ''
        };
        
        const cleanContent = content.replace(/[*#]/g, '');
        let currentSection = 'estado_general';
        const lines = cleanContent.split('\n');
        
        for (let line of lines) {
            line = line.trim();
            const upperLine = line.toUpperCase();
            
            if (upperLine.startsWith('ESTADO GENERAL')) { currentSection = 'estado_general'; continue; }
            if (upperLine.startsWith('1. RESUMEN EJECUTIVO')) { currentSection = 'resumen'; continue; }
            if (upperLine.startsWith('2. ANÁLISIS DE FLUJO')) { currentSection = 'flujo'; continue; }
            if (upperLine.startsWith('3. SALUD DEL CÓDIGO')) { currentSection = 'codigo'; continue; }
            if (upperLine.startsWith('4. AUDITORÍA DE DOCUMENTACIÓN')) { currentSection = 'documentacion'; continue; }
            if (upperLine.startsWith('5. MATRIZ DE RIESGOS')) { currentSection = 'riesgos'; continue; }
            if (upperLine.startsWith('6. RECOMENDACIONES')) { currentSection = 'proximos'; continue; }
            
            if (line) {
                result[currentSection] += line + '\n';
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
