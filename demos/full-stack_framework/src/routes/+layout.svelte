<script>
	import "../app.scss";
	import Nav from "./nav.svelte";

	import { Toaster } from "svelte-french-toast";
</script>

<main>
	<Toaster />
	<Nav />
	<slot />
</main>

<div class="blobs">
	<div class="blob"></div>
	<div class="blob"></div>
</div>

<style lang="scss">
	main {
		width: 100%;
		height: auto;
	}

	.blobs{
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		pointer-events: none;

		.blob{
			position: absolute;
			aspect-ratio: 1/1;
			width: 150px;
			border-radius: 50%;
			filter: blur(150px);
			background-color: $acc2;
			
			top:100%;
			left: 0px;

			transform: translate(-50%, -50%);

			&:nth-child(2){
				left:100%;
				top: 0px;
				background-color: $acc1;
			}
		}
	}
</style>
