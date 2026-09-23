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
    ],
    // Garante que o idioma do OCR (português) vá junto em builds/deploys.
    outputFileTracingIncludes: {
      "/api/extract": [
        "./node_modules/pdfjs-dist/legacy/build/**/*",
        "./node_modules/@tesseract.js-data/por/4.0.0_best_int/**/*",
      ],
    },
  },
};

export default nextConfig;
