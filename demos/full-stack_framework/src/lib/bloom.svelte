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
    .bloom_wrap{
        --b: #{$bloom_thin};
        --b_h: #{$bloom_thin};
        --s: 0.3;
        --s_h: 0.3;
        --c: 1.2;
        --c_h: 1.2;

        position: relative;
        z-index: 0;

        &:hover{
            --b: var(--b_h) !important;
            --s: var(--s_h) !important;
            --c: var(--c_h) !important;
        }
    }
    .bloom{
        z-index: -1;
        width: 100%;
        height: 100%;
        position: absolute;
        left: 0;
        top: 0;

        transition: $trans;

        filter: brightness(var(--s)) contrast(var(--c)) blur(var(--b));
    }
</style>