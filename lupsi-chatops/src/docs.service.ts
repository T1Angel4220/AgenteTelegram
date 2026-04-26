import { Injectable, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { AiService } from './ai.service';
import * as fs from 'fs';
import * as path from 'path';

// pdf-parse v1.1.1 — exporta directamente una función (no clase)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

interface Chunk {
    file: string;
    content: string;
}

@Injectable()
export class DocsService implements OnModuleInit {
    private readonly knowledgePath = path.join(process.cwd(), 'conocimiento');
    private chunks: Chunk[] = [];
    private cachedSummary: string | null = null;

    constructor(
        @Inject(forwardRef(() => AiService))
        private readonly aiService: AiService
    ) {}

    async onModuleInit() {
        console.log('🚀 Iniciando LUPSI: Precargando base de conocimiento...');
        await this.loadChunks();
        console.log('✅ LUPSI Listo: Conocimiento cargado y fragmentado.');
        
        // Sincronización automática de metadatos
        setTimeout(() => this.syncMetadataWithAI(), 5000); 
    }

    async syncMetadataWithAI() {
        if (!this.aiService || this.chunks.length === 0) return;
        
        console.log('🧠 LUPSI: Sincronizando metadatos del proyecto desde los documentos...');
        
        // Para sincronizar metadatos usamos los fragmentos más relevantes sobre fechas y sprints
        const hoyStr = new Date().toISOString().split('T')[0];
        const relevantContext = await this.getRelevantContext(`sprint cronograma fecha planificación actual ${hoyStr}`, 20);
        const fullText = relevantContext;
        
        const prompt = `Analiza este conocimiento (fragmentos de PDFs/TeX del proyecto):
        
        ${fullText}
        
        Tu tarea es extraer los metadatos del SPRINT ACTUAL del proyecto.
        FECHA DE HOY: ${hoyStr}
        
        REGLAS CRÍTICAS DE EXTRACCIÓN:
        1. Debes identificar en qué Sprint nos encontramos basándote en que la FECHA DE HOY (${hoyStr}) esté comprendida entre el inicio y fin de ese Sprint.
        2. NO INVENTES FECHAS bajo ninguna circunstancia.
        3. Si el texto proviene de un PDF mal formateado (ej. tablas unidas como "1608/0430/0464Hito"), entiende que "08/04" significa 8 de abril y "30/04" significa 30 de abril.
        4. El inicio del sprint es la fecha más temprana en el cronograma, y el fin es la fecha más tardía (ej. 30/04/2026).
        5. NUNCA inventes periodos estándar de 2 semanas. Extrae estrictamente la información de los textos.
        
        Responde ÚNICAMENTE con un JSON válido (sin Markdown, sin explicaciones):
        {
          "sprint_actual": "Nombre del sprint y tema (ej: Sprint 3: Frontend)",
          "fecha_inicio": "YYYY-MM-DD",
          "fecha_fin": "YYYY-MM-DD",
          "objetivo_principal": "Resumen del objetivo (máx 2 líneas)",
          "riesgos_conocidos": "Riesgos mencionados en la planificación"
        }`;

        try {
            const response = await this.aiService.chatWithAgent(prompt);
            const jsonStr = response.text.match(/\{[\s\S]*\}/)?.[0];
            if (jsonStr) {
                const metadata = JSON.parse(jsonStr);
                const configPath = path.join(process.cwd(), 'conocimiento.json');
                const current = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                
                const updated = { ...current, ...metadata };
                fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
                console.log('✅ Metadatos del proyecto actualizados automáticamente desde los documentos.');
            }
        } catch (e) {
            console.error('❌ Error al sincronizar metadatos:', e.message);
        }
    }

    /**
     * Busca los fragmentos más relevantes para una consulta dada
     */
    async getRelevantContext(query: string, limit: number = 5): Promise<string> {
        if (this.chunks.length === 0) await this.loadChunks();
        
        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3 || /\d/.test(k));
        
        // Puntuación simple por coincidencia de palabras clave
        const scored = this.chunks.map(chunk => {
            let score = 0;
            const contentLower = chunk.content.toLowerCase();
            keywords.forEach(kw => {
                if (contentLower.includes(kw)) score += 1;
            });
            return { chunk, score };
        });

        // Ordenar por relevancia y tomar los mejores
        const relevant = scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => `[Archivo: ${s.chunk.file}]\n${s.chunk.content}`);

        // Si no hay coincidencias, devolvemos los primeros para dar algo de contexto
        if (relevant.length === 0) {
            console.log('⚠️ RAG: No se encontraron coincidencias. Usando fragmentos genéricos.');
            return this.chunks.slice(0, 3).map(c => `[Archivo: ${c.file}]\n${c.content}`).join('\n---\n');
        }

        console.log(`🔍 RAG: Recuperados ${relevant.length} fragmentos para la consulta.`);
        return relevant.join('\n---\n');
    }

    private async loadChunks() {
        try {
            if (!fs.existsSync(this.knowledgePath)) return;

            const files = fs.readdirSync(this.knowledgePath).filter(f => !f.startsWith('.'));
            const newChunks: Chunk[] = [];

            for (const file of files) {
                const filePath = path.join(this.knowledgePath, file);
                const ext = path.extname(file).toLowerCase();
                let text = '';

                if (ext === '.pdf') {
                    const dataBuffer = fs.readFileSync(filePath);
                    const data = await pdfParse(dataBuffer);
                    text = data.text || '';
                    console.log(`✅ PDF leído: ${file}`);
                } else if (['.md', '.txt', '.tex', '.csv'].includes(ext)) {
                    text = fs.readFileSync(filePath, 'utf-8');
                    console.log(`✅ Doc leído: ${file}`);
                }

                if (text.trim()) {
                    // Dividir en fragmentos de ~1500 caracteres
                    const chunkSize = 1500;
                    for (let i = 0; i < text.length; i += chunkSize - 200) { // 200 caracteres de solapamiento
                        newChunks.push({
                            file: file,
                            content: text.substring(i, i + chunkSize).trim()
                        });
                    }
                }
            }

            this.chunks = newChunks;
            this.cachedSummary = files.map(f => `• ${f}`).join('\n');
            console.log(`📚 Memoria RAG lista: ${this.chunks.length} fragmentos cargados.`);
        } catch (error) {
            console.error('Error cargando chunks:', error);
        }
    }

    getDocumentList(): string {
        return this.cachedSummary || 'No se han cargado documentos aún.';
    }

    clearCache() {
        this.chunks = [];
        this.cachedSummary = null;
        console.log('🔄 Memoria RAG limpiada.');
    }
}
