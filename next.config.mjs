/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Pacotes com código nativo/worker precisam rodar direto do node_modules,
    // sem passar pelo bundler do Next.
    serverComponentsExternalPackages: [
      "pdf-parse",
      "pdfjs-dist",
      "@napi-rs/canvas",
      "tesseract.js",
      "tesseract.js-core",
      "zxing-wasm",
    ],
    // Garante que o idioma do OCR (português) vá junto em builds/deploys.
    outputFileTracingIncludes: {
      "/api/extract": [
        "./node_modules/@tesseract.js-data/por/4.0.0_best_int/**/*",
        // carregados por require dinâmico (o tracing não os detecta sozinho)
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.js",
        "./node_modules/tesseract.js/src/**/*",
        "./node_modules/tesseract.js-core/**/*",
        "./node_modules/wasm-feature-detect/**/*",
        // leitor de código de barras (.wasm lido do disco em runtime)
        "./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
      ],
    },
  },
};

export default nextConfig;
