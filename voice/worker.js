// Runs Whisper (offline, via transformers.js + ONNX/wasm) off the UI thread.
import { pipeline, env } from './vendor/transformers.min.js';

let asr = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.useBrowserCache = false;
      env.localModelPath = m.modelRoot;
      env.backends.onnx.wasm.wasmPaths = m.wasmRoot;
      env.backends.onnx.wasm.numThreads = m.threads || 1;
      asr = await pipeline('automatic-speech-recognition', m.model, { dtype: m.dtype || 'q8', device: m.device || 'wasm' });
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'transcribe') {
      const t0 = performance.now();
      const out = await asr(m.audio);
      self.postMessage({ type: 'text', id: m.id, text: out.text || '', ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
