<script>
    import Bloom from "./bloom.svelte";
</script>

<nav>
    <h1>Socio</h1>
    <Bloom style="--b:6px;"><a href="https://github.com/Rolands-Laucis/Socio" target="_blank">github</a></Bloom>
    <Bloom style="--b:6px;"><a href="https://www.npmjs.com/package/socio" target="_blank">npm</a></Bloom>
</nav>

<style lang="scss">
    nav{
        display: flex;
        align-items:baseline;
        gap: 24px;
    }

    a{
        color: $acc2;
        font-weight: 400;

        &:hover{
            text-underline-offset: 4px;
        }
    }
</style>