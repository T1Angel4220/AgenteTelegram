const fs = require('fs');
const pdf = require('pdf-parse');

async function readPdf() {
    try {
        const dataBuffer = fs.readFileSync('conocimiento/Progreso_ Proyecto_Tareas_pendientes.pdf');
        const data = await pdf(dataBuffer);
        console.log('--- PDF TEXT START ---');
        console.log(data.text);
        console.log('--- PDF TEXT END ---');
    } catch (e) {
        console.error(e);
    }
}

readPdf();
