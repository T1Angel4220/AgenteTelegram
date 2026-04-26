const fs = require('fs');
const pdf = require('pdf-parse');

async function readPdf() {
    try {
        const dataBuffer = fs.readFileSync('conocimiento/InformeAvanceSprint2.pdf');
        const data = await pdf(dataBuffer);
        console.log('--- PDF TEXT START ---');
        console.log(data.text);
        console.log('--- PDF TEXT END ---');
    } catch (e) {
        console.error(e);
    }
}

readPdf();
