import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function processIcon(size, inFile, outFile) {
  try {
    const original = sharp(inFile);
    
    // 文字がギリギリにならないよう、全体サイズの 94% に縮小
    const innerScale = 0.94;
    const innerSize = Math.floor(size * innerScale);
    const margin = Math.floor((size - innerSize) / 2);
    const adjustedMargin = size - innerSize - margin;

    // 縮小した内側サイズの画像を作成
    const resizedInnerBuffer = await original
      .resize(innerSize, innerSize, { fit: 'cover' })
      .toBuffer();

    // 周りが白くならず、下のグラデーションの続きになるよう
    // ヘリのピクセルを「コピー(copy)」させて外側に延長する
    // ※ mirror だと端の文字が反射して写り込むため copy に変更
    const extendedBuffer = await sharp(resizedInnerBuffer)
      .extend({
        top: margin,
        bottom: adjustedMargin,
        left: margin,
        right: adjustedMargin,
        extendWith: 'copy'
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
