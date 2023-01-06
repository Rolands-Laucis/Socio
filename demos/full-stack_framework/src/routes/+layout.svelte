<script>
  import "../app.scss";
  import Nav from "./nav.svelte";

  import { Toaster } from 'svelte-french-toast';
</script>

<main>
  <Toaster></Toaster>
  <Nav></Nav>
  <slot />
</main>

<style>
    main{
      padding: 24px;
  }
</style>