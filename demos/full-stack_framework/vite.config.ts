import { sveltekit } from '@sveltejs/kit/vite';
import { SocioSecurityVitePlugin } from 'socio/dist/secure';

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [SocioSecurityVitePlugin({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', verbose: true }), sveltekit()],

	css: {
		preprocessorOptions: {
			scss: {
				additionalData: '@use "src/variables.scss" as *;',
			},
		},
	},
};

export default config;