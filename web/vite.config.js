import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

//for SCSS
import sveltePreprocess from 'svelte-preprocess';
//npm i autoprefixer node-sass postcss svelte-preprocess
const production = false;

// https://vitejs.dev/config/
/** @type {import('vite').UserConfig} */
export default defineConfig({
  plugins: [svelte({
    //FOR SCSS
    preprocess: sveltePreprocess({
      sourceMap: !production,
      defaults: {
        style: 'scss'
      },
      scss: {
        prependData: `@import 'src/global.scss';`
      },
    }),
    //FOR SCSS END

    onwarn: (warning, handler) => {
      const { code, frame } = warning;
      if (code === "css-unused-selector")
        return;

      handler(warning);
    },

    compilerOptions: {
      // enable run-time checks when not in production
      dev: !production
    }
  })]
})
