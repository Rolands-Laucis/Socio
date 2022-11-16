<script>
    import Bloom from "./bloom.svelte";

    export let color = '--acc_2', styles="";
</script>


<div class="wrap">
    <slot></slot>
    <div class="border_overlay">
        <Bloom style="width: 100%;height: 100%;">
            <div class="border" style="border-color: var({color});{styles}"></div>
        </Bloom>
    </div>
</div>

<style lang="scss">
    @import './global.scss';

    .wrap{
        position: relative;
        padding: 12px;
        width: fit-content;
        height: fit-content;
    }
    .border_overlay{
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
    }

    .border{
        width: 100%;
        height: 100%;
        border: 1px solid var(--acc_2);
        border-radius: 8px;
    }
</style>