<script>
    import Bloom from "$lib/bloom.svelte";
</script>

<nav>
    <h1>Socio</h1>
    <Bloom style="--b_h:6px; --s_h:0.6;"><a href="https://github.com/Rolands-Laucis/Socio" target="_blank" class="acc2">github</a></Bloom>
    <Bloom style="--b_h:6px; --s_h:0.6;"><a href="https://www.npmjs.com/package/socio" target="_blank" class="acc1">npm</a></Bloom>
</nav>

<style lang="scss">
    nav{
        display: flex;
        align-items:baseline;
        gap: 24px;
    }
</style>