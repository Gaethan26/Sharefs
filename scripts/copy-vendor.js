// Copie le build UMD de supabase-js dans www/ pour que l'app fonctionne sans CDN.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
const dst = path.join(__dirname, '..', 'www', 'vendor', 'supabase.js');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log('supabase.js copié dans www/vendor/');
