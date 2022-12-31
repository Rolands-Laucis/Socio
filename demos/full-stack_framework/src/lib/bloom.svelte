<script>
    export let style='', tb=true;
</script>

<div {style} class="bloom_wrap" class:tb>
    <slot></slot>
    <div class="bloom">
        <slot></slot>
    </div>
</div>

<style lang="scss">
    .bloom_wrap{
        --b: #{$bloom};
        position: relative;
        z-index: 0;
    }
    .tb{--b:#{$bloom_thin};}
    .bloom{
        z-index: -1;
        width: 100%;
        height: 100%;
        position: absolute;
        left: 0;
        top: 0;
        filter: brightness(0.3) blur(var(--b));
    }
</style>