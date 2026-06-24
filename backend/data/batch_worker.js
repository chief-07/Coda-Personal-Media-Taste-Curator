const fs = require('fs');
const path = require('path');

const pendingDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\pending_synthesis';

let files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json')).slice(0, 4);

if (files.length === 0) {
    console.log("NO_MORE_FILES");
    process.exit(0);
}

for (const f of files) {
    const oldPath = path.join(pendingDir, f);
    const newPath = oldPath + '.processing';
    fs.renameSync(oldPath, newPath);
    
    const data = JSON.parse(fs.readFileSync(newPath, 'utf8'));
    console.log(`--- FILE: ${f} ---`);
    console.log(`UUID: ${data.uuid}`);
    console.log(`Title: ${data.title}`);
    
    const sd = data.structured_data || {};
    for (const [k, v] of Object.entries(sd)) {
        if (k !== 'image' && k !== 'link') {
            console.log(`${k}: ${v}`);
        }
    }
    
    console.log("Snippets:");
    const snippets = (data.community_snippets || []).slice(0, 5);
    for (const s of snippets) {
        console.log(`- ${s.snippet}`);
    }
    console.log("\n========================================\n");
}
