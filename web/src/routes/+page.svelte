<script>
    import Nav from "$lib/nav.svelte";
    import Bloom from "$lib/bloom.svelte";
</script>

<main>
    <Nav></Nav>

    <h4 class="horiz" style="gap:12px;">
        A WebSocket based 
        <Bloom tb><span class="acc1 bold">realtime</span></Bloom> 
        duplex Front-End and Back-End 
        <Bloom tb><span class="acc2 bold">syncing</span></Bloom> 
        API paradigm framework.
    </h4>
</main>

<style lang="scss">
    main{
        padding: 64px;
    }

    .acc1{color: $acc1;}
    .acc2{color: $acc2;}
    .bold{font-weight: bold;}

    .horiz{
        display: flex;
        flex-wrap: wrap;
    }
</style>