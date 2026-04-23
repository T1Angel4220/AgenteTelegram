const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function readPdf(filename) {
    const filePath = path.join(process.cwd(), 'conocimiento', filename);
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    console.log(`--- ${filename} ---`);
    console.log(data.text);
}

const filename = process.argv[2] || 'PlanificacionSprint3.pdf';
readPdf(filename).catch(console.error);
