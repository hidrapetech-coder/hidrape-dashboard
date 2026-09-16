const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

function minifyJS(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
        .split('\n')
        .map(line => line.trim()) // Remove indentation and trailing spaces
        .filter(line => line.length > 0) // Remove empty lines
        .map(line => line.startsWith('//') ? '' : line) // Remove full-line comments safely
        .filter(line => line.length > 0)
        .join('\n');
}

function minifyCSS(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/ {2,}/g, ' ')
        .replace(/{\s+/g, '{')
        .replace(/}\s+/g, '}')
        .replace(/;\s+/g, ';')
        .replace(/:\s+/g, ':')
        .replace(/,\s+/g, ',')
        .trim();
}

console.log('Iniciando Minificação do Frontend...');

// JS
const jsPath = path.join(publicDir, 'js', 'app.js');
const minJsPath = path.join(publicDir, 'js', 'app.min.js');
if (fs.existsSync(jsPath)) {
    const rawJS = fs.readFileSync(jsPath, 'utf8');
    const minJS = minifyJS(rawJS);
    fs.writeFileSync(minJsPath, minJS, 'utf8');
    console.log(`✅ [JS] ${jsPath} -> app.min.js (${(minJS.length / 1024).toFixed(2)} KB)`);
}

// CSS
const cssPath = path.join(publicDir, 'css', 'style.css');
const minCssPath = path.join(publicDir, 'css', 'style.min.css');
if (fs.existsSync(cssPath)) {
    const rawCSS = fs.readFileSync(cssPath, 'utf8');
    const minCSS = minifyCSS(rawCSS);
    fs.writeFileSync(minCssPath, minCSS, 'utf8');
    console.log(`✅ [CSS] ${cssPath} -> style.min.css (${(minCSS.length / 1024).toFixed(2)} KB)`);
}

console.log('Build concluído com sucesso!');
