<script>
    export let style='', tb=false;
</script>

<div {style} class="bloom_wrap" class:tb>
    <slot></slot>
    <div class="bloom">
        <slot></slot>
    </div>
</div>

<style>
    :root{
        --b: var(--bloom);
    }
    .tb{--b:var(--bloom_thin);}
    .bloom_wrap{
        position: relative;
    }
    .bloom{
        z-index: -1;
        width: 100%;
        height: 100%;
        position: absolute;
        left: 0;
        top: 0;
        filter: brightness(0.6) blur(var(--b));
    }
</style>