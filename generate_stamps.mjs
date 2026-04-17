import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'public', 'reactions');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 3キャラクター: Mochi, Mary, Milk
// 各10個の表情・アクション (計30個)

const characters = [
  { id: 'mochi', baseColor: '#cbd5e1', symbol: '🍡' }, // もち (AI)
  { id: 'merry', baseColor: '#fbcfe8', symbol: '🎀' }, // メリー
  { id: 'milk', baseColor: '#bfdbfe', symbol: '🧢' }   // ミルク
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
    
    // シンプルなSVG: 丸い背景にキャラシンボルと表情絵文字を合成
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <!-- Background Circle -->
      <circle cx="50" cy="50" r="48" fill="${char.baseColor}" stroke="rgba(0,0,0,0.1)" stroke-width="2"/>
      
      <!-- Character Symbol (Background) -->
      <text x="35" y="65" font-size="40" text-anchor="middle" dominant-baseline="central" opacity="0.4">${char.symbol}</text>
      
      <!-- Expression / Main Emoji -->
      <text x="60" y="55" font-size="45" text-anchor="middle" dominant-baseline="central">${exp.text}</text>
    </svg>`;
    
    fs.writeFileSync(filePath, svg, 'utf-8');
  });
});

console.log('Successfully generated 30 reaction SVG stamps.');
