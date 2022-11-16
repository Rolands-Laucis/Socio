import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

//for SCSS
import sveltePreprocess from 'svelte-preprocess';
//npm i autoprefixer node-sass postcss svelte-preprocess
const production = false;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte({
    //FOR SCSS
    preprocess: sveltePreprocess({
      sourceMap: !production,
      defaults: {
        style: 'scss'
      },
      scss: {
        // We can use a path relative to the root because
        // svelte-preprocess automatically adds it to `includePaths`
        // if none is defined.
        prependData: `@import 'src/global.scss';`
      },
    }),
    //FOR SCSS END


    compilerOptions: {
      // enable run-time checks when not in production
      dev: !production
    }
  })]
})
