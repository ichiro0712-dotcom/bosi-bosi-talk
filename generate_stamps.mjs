import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'public', 'reactions');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const characters = [
  { id: 'mochi', symbol: '🍡' }, // もち (AI)
  { id: 'merry', symbol: '🎀' }, // メリー
  { id: 'milk', symbol: '🧢' }   // ミルク
];

const expressions = [
  { suffix: 'smile', text: '😊', desc: '笑顔' },
  { suffix: 'heart', text: '❤️', desc: 'ハート' },
  { suffix: 'cry', text: '😭', desc: '泣く' },
  { suffix: 'angry', text: '😠', desc: '怒る' },
  { suffix: 'sweat', text: '😅', desc: '汗' },
  { suffix: 'star', text: '✨', desc: 'キラキラ' },
  { suffix: 'good', text: '👍', desc: 'いいね' },
  { suffix: 'ok', text: '🆗', desc: 'OK' },
  { suffix: 'sleep', text: '💤', desc: '寝る' },
  { suffix: 'question', text: '❓', desc: 'はてな' }
];

characters.forEach(char => {
  expressions.forEach((exp, i) => {
    const fileName = `${char.id}_${exp.suffix}.svg`;
    const filePath = path.join(outDir, fileName);
    
    // 背景なしSVG: キャラシンボルと表情絵文字のみ
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <!-- Character Symbol (Background) -->
      <text x="35" y="65" font-size="45" text-anchor="middle" dominant-baseline="central" opacity="0.8">${char.symbol}</text>
      
      <!-- Expression / Main Emoji -->
      <text x="65" y="45" font-size="55" text-anchor="middle" dominant-baseline="central">${exp.text}</text>
    </svg>`;
    
    fs.writeFileSync(filePath, svg, 'utf-8');
  });
});

console.log('Successfully regenerated 30 transparent reaction SVG stamps.');
