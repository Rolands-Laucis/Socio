<script>
    import Bloom from "./bloom.svelte";
</script>

<nav>
    <h1>Socio</h1>
    <Bloom tb><a href="https://github.com/Rolands-Laucis/Socio" target="_blank">github</a></Bloom>
    <Bloom tb><a href="https://www.npmjs.com/package/socio" target="_blank">npm</a></Bloom>
</nav>

<style lang="scss">
    nav{
        display: flex;
        align-items:baseline;
        gap: 24px;
    }

    a{
        color: $acc2;
    }
</style>