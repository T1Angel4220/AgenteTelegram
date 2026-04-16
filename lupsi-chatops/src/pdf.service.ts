import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
@Injectable()
export class PdfService {
  // Esta función recibe el texto de la IA y devuelve un archivo PDF en la memoria (Buffer)
    async generateReport(content: string): Promise<Buffer> {
        return new Promise((resolve) => {
            const doc = new PDFDocument({ 
                margin: 50,
                size: 'A4',
                info: { Title: 'Reporte LUPSI', Author: 'Agente LUPSI' }
            });
            const buffers: Buffer[] = [];
            const primaryColor = '#065f46'; // Verde Esmeralda Corporativo

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // --- FUNCIÓN PARA EL ENCABEZADO Y PIE DE PÁGINA ---
            const drawLayout = () => {
                // Barra Superior (Header)
                doc.rect(0, 0, 600, 80).fill(primaryColor);
                
                doc.fillColor('white')
                   .fontSize(20)
                   .font('Helvetica-Bold')
                   .text('REPORTE EJECUTIVO LUPSI', 50, 25);
                
                doc.fontSize(10)
                   .font('Helvetica')
                   .text('SISTEMA CHATOPS DE GESTIÓN DE PROYECTOS', 50, 50);

                // Línea inferior
                doc.moveTo(50, 90).lineTo(550, 90).strokeColor(primaryColor).lineWidth(1).stroke();
                
                // Pie de Página
                const bottom = 780;
                doc.moveTo(50, bottom).lineTo(550, bottom).stroke();
                doc.fillColor('#666666')
                   .fontSize(8)
                   .text('Documento de carácter confidencial - Generado por Agente Inteligente LUPSI', 50, bottom + 10, { align: 'left' });
            };

            // Dibujamos el primer layout
            drawLayout();

            // Cuerpo del Reporte
            doc.moveDown(5);
            
            // Fecha y Metadatos
            const fecha = new Date().toLocaleDateString('es-ES', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            });
            
            doc.fillColor(primaryColor)
               .fontSize(14)
               .font('Helvetica-Bold')
               .text('RESUMEN DE ESTADO Y ANÁLISIS', 50, 110);

            doc.fillColor('#333333')
               .fontSize(9)
               .font('Helvetica-Oblique')
               .text(`Fecha de emisión: ${fecha}`, 50, 130);
            
            doc.moveDown(2);

            // Contenido Principal
            doc.fillColor('#000000')
               .fontSize(11)
               .font('Helvetica')
               .text(content, { 
                   align: 'justify', 
                   lineGap: 4,
                   paragraphGap: 10
               });

            // Cerramos
            doc.end();
        });
    }
}