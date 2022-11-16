<script>
    import Page from "./page.svelte";
    import BlobBg from "./blob_bg.svelte";

</script>
<main>

    <Page></Page>

    <BlobBg></BlobBg>
</main>
<style lang="scss">
    :root{
        --acc_1: #{$acc1};
        --acc_2: #{$acc2};
    }

    main{
        position: relative;
        width: 100vw;
        height: 100vh;
        background: $radial_bg;
    }
</style>