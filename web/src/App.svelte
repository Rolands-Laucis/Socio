<script>
    import Page from "./page.svelte";
    import BlobBg from "./blob_bg.svelte";

</script>
<main>

    <Page></Page>

    <BlobBg></BlobBg>
</main>
<style lang="scss">
    @import './global.scss';

    main{
        position: relative;
        width: 100vw;
        height: 100vh;
        background: $radial_bg;
    }
</style>