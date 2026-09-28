'use strict';
// Uses the very same Canvas 2D commands as the interactive HTML.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCanvas } = require('@napi-rs/canvas');
const root = __dirname;
const canvas = createCanvas(1280, 720);
const elements = { scene: canvas };
const document = {
  getElementById: id => elements[id] || (elements[id] = { value: 0, addEventListener() {} }),
  addEventListener() {},
};
const window = {};
const html = fs.readFileSync(path.join(root, 'full-process.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInNewContext(script, { document, window, Math, console, requestAnimationFrame() {} });
const { renderAt, duration } = window.FriedRice;
const fps = 24;
(async () => {
  renderAt(26.5);
  fs.writeFileSync(path.join(root, 'full-poster.png'), canvas.toBuffer('image/png'));
  const encoder = spawn('ffmpeg', [
    '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', '1280x720',
    '-framerate', String(fps), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'fast',
    '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    path.join(root, 'fried-rice-full-process.mp4'),
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let error = '';
  encoder.stderr.on('data', chunk => { error = (error + chunk.toString()).slice(-6000); });
  const done = new Promise((resolve, reject) => {
    encoder.on('error', reject);
    encoder.on('close', code => code === 0 ? resolve() : reject(new Error(error)));
  });
  // Attach a handler immediately: encoding failures must not be unhandled rejections.
  done.catch(() => {});
  try {
    for (let i = 0; i < duration * fps; i++) {
      renderAt(i / fps);
      const rgba = canvas.getContext('2d').getImageData(0, 0, 1280, 720).data;
      if (!encoder.stdin.write(Buffer.from(rgba))) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end();
    await done;
  } catch (error) {
    encoder.kill();
    throw error;
  }
  console.log(`Rendered ${duration * fps} frames; ${duration}s; 1280x720; ${fps}fps.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
