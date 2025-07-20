import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'Haka',
      fileName: (format) => `haka.${format}.js`
    },
  },
}) 