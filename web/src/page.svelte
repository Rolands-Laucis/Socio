<script>
    import Bloom from "./bloom.svelte";
    import Border from "./border.svelte";

</script>

<section class="content">
    <h1>Socio.js</h1>
    <h3 class="sub_title">WebSocket <Bloom style="--b:var(--tb);"><span style="color: var(--acc_1);">live</span></Bloom> / <Bloom style="--b:var(--tb);"><span style="color: var(--acc_2);">reactive</span></Bloom> database connection framework.</h3>
    <!-- <Border>
        <h3>sdgfhskdfksdfksd fjgdkjfgkh</h3>
    </Border> -->
</section>

<style lang="scss">
    @import './global.scss';

    :root{
        --acc_1: #{$acc1};
        --acc_2: #{$acc2};
        --tb: #{$bloom_text};
    }

    .content{
        padding: 162px;

        display: flex;
        flex-direction: column;
        gap: 24px;
    }
    h3{
        font-weight: 200;
    }
    .sub_title{
        display: flex; 
        align-items:center;
        white-space: pre;
    }
</style>