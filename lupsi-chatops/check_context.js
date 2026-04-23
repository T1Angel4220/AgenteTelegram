const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function getContext() {
    const knowledgePath = path.join(process.cwd(), 'conocimiento');
    const files = fs.readdirSync(knowledgePath).filter(f => !f.startsWith('.'));
    const chunks = [];

    for (const file of files) {
        const filePath = path.join(knowledgePath, file);
        const ext = path.extname(file).toLowerCase();
        let text = '';

        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            text = data.text || '';
        } else if (['.md', '.txt', '.tex', '.csv'].includes(ext)) {
            text = fs.readFileSync(filePath, 'utf-8');
        }

        if (text.trim()) {
            const chunkSize = 1500;
            for (let i = 0; i < text.length; i += chunkSize - 200) {
                chunks.push({
                    file: file,
                    content: text.substring(i, i + chunkSize).trim()
                });
            }
        }
    }

    const query = `sprint cronograma fecha planificación actual 2026-04-23`;
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3);
    
    const scored = chunks.map(chunk => {
        let score = 0;
        const contentLower = chunk.content.toLowerCase();
        keywords.forEach(kw => {
            if (contentLower.includes(kw)) score += 1;
        });
        return { chunk, score };
    });

    const relevant = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(s => `[Archivo: ${s.chunk.file}]\n${s.chunk.content}`);

    fs.writeFileSync('relevant_context.txt', relevant.join('\n---\n'));
    console.log('Wrote to relevant_context.txt');
}

getContext().catch(console.error);
