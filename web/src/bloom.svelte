<script>
    export let style='';
</script>

<div {style} class="bloom_wrap">
    <slot></slot>
    <div class="bloom">
        <slot></slot>
    </div>
</div>

<style lang="scss">
    // @import './global.scss';

    :root{
        --b: #{$bloom};
    }

    .bloom_wrap{
        position: relative;
        // display: inline-flex;
    }
    .bloom{
        width: 100%;
        height: 100%;
        position: absolute;
        left: 0;
        top: 0;
        filter: blur(var(--b));
    }
</style>