import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';
import path from 'node:path';
export default defineConfig({
  base: './',
  plugins:[{
    name:'keep-authoring-exports-out-of-dist',apply:'build',
    closeBundle(){
      const directory=path.resolve(import.meta.dirname,'dist/assets/architecture');
      for(const name of ['room.glb','room-editor.glb','space.glb','space-editor.glb','context.glb','context.meshopt.glb','context.json']){
        const target=path.resolve(directory,name);if(path.dirname(target)!==directory)throw new Error('Invalid generated artifact path');
        rmSync(target,{force:true});
      }
      // Archived planar/Cycles environment exports are authoring references;
      // runtime now uses only the panorama manifest and its quality tiers.
      const environment=path.resolve(import.meta.dirname,'dist/assets/environment');
      for(const name of ['factory.hdr','factory-2k.hdr','factory-1k.hdr','factory-window.hdr','factory.json'])rmSync(path.join(environment,name),{force:true});
    },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1400 },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1', port: 4174 },
});
