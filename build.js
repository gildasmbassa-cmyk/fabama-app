// Compile src/app.jsx -> app.js (JSX + syntaxe récente -> JS compris par les vieux téléphones Android).
// Usage : npm install && npm run build   (à relancer après CHAQUE modification de src/app.jsx)
const fs = require('fs');
const Babel = require('@babel/standalone');
const src = fs.readFileSync(__dirname + '/src/app.jsx', 'utf8');
const { code } = Babel.transform(src, {
  presets: [['env', { targets: { chrome: '70', safari: '12', firefox: '70' }, modules: false }], 'react'],
  comments: false,
  compact: true,
  sourceType: 'script',
});
fs.writeFileSync(__dirname + '/app.js', '/* Généré par build.js depuis src/app.jsx — ne pas modifier à la main */\n' + code);
console.log('app.js :', Buffer.byteLength(code), 'octets');
