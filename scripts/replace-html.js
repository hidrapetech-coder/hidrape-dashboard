const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const viewsDir = path.join(publicDir, 'views');

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    let original = content;
    content = content.replace(/\/js\/app\.js(\?v=\d+)?/g, '/js/app.min.js$1');
    content = content.replace(/\/css\/style\.css(\?v=\d+)?/g, '/css/style.min.css$1');
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Atualizado: ${path.basename(filePath)}`);
    }
}

replaceInFile(path.join(publicDir, 'index.html'));

if (fs.existsSync(viewsDir)) {
    const files = fs.readdirSync(viewsDir);
    for (const file of files) {
        if (file.endsWith('.html')) {
            replaceInFile(path.join(viewsDir, file));
        }
    }
}
