import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

import { SocioSecurityPlugin } from '../../core/secure.js'
// import { SocioSecurityPlugin } from 'socio/secure.js'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    //note that these key and iv are here for demonstration purposes and you should always generate your own. You may also supply any cipher algorithm supported by node's crypto module
    SocioSecurityPlugin({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', cipher_iv: 'dsjkfh45h4lu45ilULIY$%IUfdjg', verbose: true })
  ]
})
