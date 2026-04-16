import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require('pdf-parse');

@Injectable()
export class DocsService implements OnModuleInit {
    private readonly knowledgePath = path.join(process.cwd(), 'conocimiento');
    private cachedKnowledge: string | null = null;

    async onModuleInit() {
        console.log('🚀 Iniciando LUPSI: Precargando base de conocimiento...');
        await this.getKnowledgeBase();
        console.log('✅ LUPSI Listo: Conocimiento cargado y cacheado.');
    }

    async getKnowledgeBase(): Promise<string> {
        if (this.cachedKnowledge) {
            return this.cachedKnowledge;
        }

        try {
            if (!fs.existsSync(this.knowledgePath)) {
                return 'No hay carpeta de conocimiento configurada.';
            }

            const files = fs.readdirSync(this.knowledgePath);
            const results = await Promise.all(files.map(async (file) => {
                const filePath = path.join(this.knowledgePath, file);
                const ext = path.extname(file).toLowerCase();
                const baseName = path.basename(file, ext);

                // Si es un PDF, verificamos si existe un archivo .tex con el mismo nombre
                // Si existe el .tex, saltamos el PDF porque el .tex es más preciso
                if (ext === '.pdf' && files.includes(`${baseName}.tex`)) {
                    console.log(`⏩ Saltando ${file} porque existe una versión .tex más precisa.`);
                    return '';
                }

                if (ext === '.pdf') {
                    const dataBuffer = fs.readFileSync(filePath);
                    const { PDFParse } = pdf;
                    const parser = new PDFParse({ data: dataBuffer });
                    const result = await parser.getText();
                    return `\n--- CONTENIDO DEL PDF: ${file} ---\n${result.text}\n`;
                } else if (ext === '.md' || ext === '.txt' || ext === '.tex') {
                    const text = fs.readFileSync(filePath, 'utf-8');
                    return `\n--- CONTENIDO DEL ARCHIVO: ${file} ---\n${text}\n`;
                }
                return '';
            }));

            this.cachedKnowledge = results.join('') || 'La carpeta de conocimiento está vacía.';
            return this.cachedKnowledge;
        } catch (error) {
            console.error('Error leyendo base de conocimiento:', error);
            return 'Error al procesar los documentos de conocimiento.';
        }
    }

    // Método para forzar la recarga de los archivos
    clearCache() {
        this.cachedKnowledge = null;
        console.log('🔄 Caché de conocimiento limpiada.');
    }
}
