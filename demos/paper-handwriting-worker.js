// Loaded only when a visitor asks Stickothy to read broader handwriting. The library, its
// WebAssembly runtime and the model all ship with the site, so nothing is fetched elsewhere.
let reader = null;
self.onmessage = async ({ data }) => {
  const { id, image } = data;
  try {
    if (!reader) {
      self.postMessage({ id, status: 'loading' });
      const base = new URL('./assets/handwriting/', import.meta.url).href;
      const { pipeline, env } = await import(base + 'lib/transformers.min.js');
      env.allowRemoteModels = false; env.allowLocalModels = true;
      env.localModelPath = base + 'models/';
      env.backends.onnx.wasm.wasmPaths = base + 'lib/';
      env.backends.onnx.wasm.numThreads = 1;
      reader = await pipeline('image-to-text', 'Xenova/trocr-small-handwritten', {
        device: 'wasm', dtype: 'q8'
      });
    }
    self.postMessage({ id, status: 'reading' });
    const result = await reader(image, { max_new_tokens: 48, num_beams: 1 });
    self.postMessage({ id, text: result[0]?.generated_text?.trim() || '' });
  } catch {
    reader = null;
    self.postMessage({ id, error: true });
  }
};
