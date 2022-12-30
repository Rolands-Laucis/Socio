<script lang="ts">
    export let style='';
</script>

<div {style}></div>

<style lang="scss">
    div{
        --t: 5px;
        --h:32px;
        height: var(--h);
        aspect-ratio: 1/1;
        border: var(--t) solid;
        border-color: $acc1 transparent $acc2 transparent;
        border-radius: 50%;
        display: inline-block;
        box-sizing: border-box;

        animation: spin 1s ease-in-out infinite forwards;
    }
    @keyframes spin{
        from{transform: rotate(0deg);}
        to{transform: rotate(720deg);}
    }
</style>