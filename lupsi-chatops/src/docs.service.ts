import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// pdf-parse v1.1.1 — exporta directamente una función (no clase)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

@Injectable()
export class DocsService implements OnModuleInit {
    private readonly knowledgePath = path.join(process.cwd(), 'conocimiento');
    private cachedKnowledge: string | null = null;
    private cachedSummary: string | null = null;

    async onModuleInit() {
        console.log('🚀 Iniciando LUPSI: Precargando base de conocimiento...');
        await this.getKnowledgeBase();
        console.log('✅ LUPSI Listo: Conocimiento cargado y cacheado.');
    }

    async getKnowledgeBase(): Promise<string> {
        if (this.cachedKnowledge) return this.cachedKnowledge;

        try {
            if (!fs.existsSync(this.knowledgePath)) {
                return 'No hay carpeta de conocimiento configurada.';
            }

            const files = fs.readdirSync(this.knowledgePath)
                .filter(f => !f.startsWith('.'));

            const results = await Promise.all(files.map(async (file) => {
                const filePath = path.join(this.knowledgePath, file);
                const ext = path.extname(file).toLowerCase();
                const baseName = path.basename(file, ext);

                // Preferir versión de texto si existe equivalente .txt/.md del mismo PDF
                if (ext === '.pdf' && (
                    files.includes(`${baseName}.txt`) ||
                    files.includes(`${baseName}.md`) ||
                    files.includes(`${baseName}.tex`)
                )) {
                    console.log(`⏩ Saltando ${file} (existe versión de texto).`);
                    return '';
                }

                if (ext === '.pdf') {
                    try {
                        const dataBuffer = fs.readFileSync(filePath);
                        const data = await pdfParse(dataBuffer);
                        const texto = (data.text || '').substring(0, 4000);
                        console.log(`✅ PDF leído: ${file} (${data.numpages} págs.)`);
                        return `\n=== PDF: ${file} ===\n${texto}\n`;
                    } catch (pdfErr) {
                        console.error(`❌ Error leyendo PDF ${file}:`, pdfErr.message);
                        return `\n=== PDF (sin extracción): ${file} ===\n[Documento disponible en carpeta de conocimiento]\n`;
                    }
                } else if (['.md', '.txt', '.tex'].includes(ext)) {
                    const text = fs.readFileSync(filePath, 'utf-8');
                    return `\n=== DOCUMENTO: ${file} ===\n${text.substring(0, 4000)}\n`;
                }
                return '';
            }));

            const contenido = results.filter(r => r.trim()).join('');
            this.cachedKnowledge = contenido || 'La carpeta de conocimiento está vacía.';
            this.cachedSummary = files
                .filter(f => ['.pdf', '.md', '.txt', '.tex'].includes(path.extname(f).toLowerCase()))
                .map(f => `• ${f}`)
                .join('\n');

            console.log(`📚 Documentos procesados: ${files.length} archivos.`);
            return this.cachedKnowledge;
        } catch (error) {
            console.error('Error leyendo base de conocimiento:', error);
            return 'Error al procesar los documentos de conocimiento.';
        }
    }

    getDocumentList(): string {
        return this.cachedSummary || 'No se han cargado documentos aún.';
    }

    clearCache() {
        this.cachedKnowledge = null;
        this.cachedSummary = null;
        console.log('🔄 Caché de conocimiento limpiada.');
    }
}
