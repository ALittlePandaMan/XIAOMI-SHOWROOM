import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{usePolling:true,interval:300,ignored:['**/reference/**','**/tools/**','**/dist/**']}},build:{rollupOptions:{output:{manualChunks:(id)=>id.includes('/node_modules/three/')?'three':undefined}}}});
