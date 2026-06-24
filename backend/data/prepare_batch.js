const fs = require('fs');
const path = require('path');

const pendingDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\pending_synthesis';
const outPath = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\batch_data.txt';

// Delete existing .processing files
const existingFiles = fs.readdirSync(pendingDir);
for (const f of existingFiles) {
    if (f.endsWith('.processing')) {
        fs.unlinkSync(path.join(pendingDir, f));
    }
}

let allFiles = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json'));
let files = allFiles.slice(0, 5);

if (files.length === 0) {
    fs.writeFileSync(outPath, "NO_MORE_FILES", 'utf8');
    process.exit(0);
}

let outContent = "";

for (const f of files) {
    const oldPath = path.join(pendingDir, f);
    const newPath = oldPath + '.processing';
    fs.renameSync(oldPath, newPath);
    
    const data = JSON.parse(fs.readFileSync(newPath, 'utf8'));
    outContent += `\n\n--- FILE: ${f} ---\n`;
    outContent += `UUID: ${data.uuid}\n`;
    outContent += `Title: ${data.title}\n`;
    
    const sd = data.structured_data || {};
    for (const [k, v] of Object.entries(sd)) {
        if (k !== 'image' && k !== 'link') {
            outContent += `${k}: ${v}\n`;
        }
    }
    
    outContent += "Snippets:\n";
    const snippets = (data.community_snippets || []).slice(0, 5);
    for (const s of snippets) {
        outContent += `- ${s.snippet}\n`;
    }
}

fs.writeFileSync(outPath, outContent, 'utf8');
console.log("Batch prepared in batch_data.txt");
