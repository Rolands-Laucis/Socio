<script>
  import "../app.scss";
  import Nav from "./nav.svelte";
</script>

<main>
  <Nav></Nav>
  <slot />
</main>

<style>
    main{
      padding: 24px;
  }
</style>