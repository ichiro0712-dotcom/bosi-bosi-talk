import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function processIcon(size, inFile, outFile) {
  try {
    const original = sharp(inFile);
    
    // 白や透明の余白をトリミングして、実際のグラフィック部分（文字＋背景）だけを抽出
    const trimmedBuffer = await original
      .trim({ background: { r: 255, g: 255, b: 255, alpha: 1 }, threshold: 50 })
      .toBuffer();
    
    // 念のため透明対応のトリミングも
    const transparentTrimmed = await sharp(trimmedBuffer)
      .trim({ threshold: 50 })
      .toBuffer()
      .catch(() => trimmedBuffer);

    // 文字がギリギリにならないよう、全体サイズの 82% ぐらいに縮小
    const innerScale = 0.82;
    const innerSize = Math.floor(size * innerScale);
    const margin = Math.floor((size - innerSize) / 2);
    const adjustedMargin = size - innerSize - margin;

    // 縮小した内側サイズの画像を作成
    const resizedInnerBuffer = await sharp(transparentTrimmed)
      .resize(innerSize, innerSize, { fit: 'cover' })
      .toBuffer();

    // 周りが白くならず、下のグラデーションの続きになるよう
    // ヘリのピクセルを「反転(mirror)」させて外側に延長する
    const extendedBuffer = await sharp(resizedInnerBuffer)
      .extend({
        top: margin,
        bottom: adjustedMargin,
        left: margin,
        right: adjustedMargin,
        extendWith: 'mirror'
      })
      .toBuffer();

    // 最後に円形にくり抜く
    const circleSvg = Buffer.from(
      `<svg><circle cx="${size/2}" cy="${size/2}" r="${size/2}" /></svg>`
    );

    await sharp(extendedBuffer)
      .composite([{ input: circleSvg, blend: 'dest-in' }])
      .toFile(outFile);
      
    console.log(`Processed ${outFile} successfully!`);
  } catch (err) {
    console.error(`Error processing ${inFile}:`, err);
  }
}

async function main() {
  const dir = path.join(process.cwd(), 'public');
  // backup
  if (!fs.existsSync(path.join(dir, 'icon-512x512.orig.png'))) {
    fs.copyFileSync(path.join(dir, 'icon-512x512.png'), path.join(dir, 'icon-512x512.orig.png'));
  }
  if (!fs.existsSync(path.join(dir, 'icon-192x192.orig.png'))) {
    fs.copyFileSync(path.join(dir, 'icon-192x192.png'), path.join(dir, 'icon-192x192.orig.png'));
  }

  await processIcon(512, path.join(dir, 'icon-512x512.orig.png'), path.join(dir, 'icon-512x512.png'));
  await processIcon(192, path.join(dir, 'icon-192x192.orig.png'), path.join(dir, 'icon-192x192.png'));
}

main();
