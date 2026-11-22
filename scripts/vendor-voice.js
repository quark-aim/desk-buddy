// Copies the offline speech-recognition runtime (transformers.js + ONNX wasm) into voice/vendor/.
// Runs automatically after `npm install`. The folder is git-ignored and bundled into the exe.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'voice', 'vendor');
const files = [
  ['node_modules/@huggingface/transformers/dist/transformers.min.js', 'transformers.min.js'], // self-contained build (bundles onnxruntime-web)
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.wasm'],
];
fs.mkdirSync(out, { recursive: true });
let ok = true;
for (const [src, name] of files) {
  const from = path.join(root, src);
  if (!fs.existsSync(from)) { console.warn('vendor-voice: missing ' + src + ' (run npm install)'); ok = false; continue; }
  fs.copyFileSync(from, path.join(out, name));
}
console.log(ok ? 'vendor-voice: voice runtime ready' : 'vendor-voice: incomplete');
