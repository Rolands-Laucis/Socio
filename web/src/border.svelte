<script>
    import Bloom from "./bloom.svelte";

    export let color = '--acc_2';
</script>


<div class="wrap">
    <slot></slot>
    
    <div class="border_overlay">
        <Bloom>
            <div class="border" style="border-color: var({color});"></div>
        </Bloom>
    </div>
</div>

<style lang="scss">
    @import './global.scss';

    .wrap{
        position: relative;
    }
    .border_overlay{
        position: absolute;
    }

    .border{
        border: 1px solid var(--acc_2);
        border-radius: 8px;
        width: 100%;
        height: 48px;
    }
</style>