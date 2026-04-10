import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
@Injectable()
export class PdfService {
  // Esta función recibe el texto de la IA y devuelve un archivo PDF en la memoria (Buffer)
  async generateReport(content: string): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      // Recolectamos los datos mientras se crea el PDF
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      // --- DISEÑO DEL PDF ---
      // Título
      doc.fontSize(24).font('Helvetica-Bold').text('Reporte Ejecutivo: Proyecto LUPSI', { align: 'center' });
      doc.moveDown();
      
      // Fecha
      const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      doc.fontSize(12).font('Helvetica-Oblique').text(`Generado automáticamente el: ${fecha}`, { align: 'right' });
      doc.moveDown(2);

      // Cuerpo del mensaje (Lo que dijo la IA)
      doc.fontSize(12).font('Helvetica').text(content, { align: 'justify', lineGap: 5 });
      
      // Pie de página
      doc.moveDown(3);
      doc.fontSize(10).font('Helvetica-Oblique').text('Documento generado por Agente LUPSI (Sistema ChatOps)', { align: 'center' });

      // Cerramos el documento
      doc.end();
    });
  }
}