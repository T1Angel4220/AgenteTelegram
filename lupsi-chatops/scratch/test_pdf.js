const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function testExtraction() {
    const knowledgePath = path.join(process.cwd(), 'conocimiento');
    const files = fs.readdirSync(knowledgePath);
    console.log(`Encontrados ${files.length} archivos.`);

    for (const file of files) {
        const filePath = path.join(knowledgePath, file);
        const ext = path.extname(file).toLowerCase();

        if (ext === '.pdf') {
            try {
                const dataBuffer = fs.readFileSync(filePath);
                const parser = new PDFParse({ data: dataBuffer });
                const result = await parser.getText();
                console.log(`Archivo: ${file} | Caracteres extraídos: ${result.text.length}`);
                console.log(`Vista previa: ${result.text.substring(0, 200)}...\n`);
            } catch (e) {
                console.error(`Error en ${file}:`, e.message);
            }
        }
    }
}

testExtraction();
