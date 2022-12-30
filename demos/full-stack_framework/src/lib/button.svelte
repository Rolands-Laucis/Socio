<script lang="ts">
    import Bloom from "./bloom.svelte";

    export let name:string, num:number = 0, style:string;
</script>

<Bloom style="--b:6px;">
    <button on:click {style}>
        INSERT INTO users (name, num) VALUES("<span class="acc1">{name}</span>", <span class="acc1">{num || 0}</span>);
    </button>
</Bloom>

<style lang="scss">
    button{
        font-weight: 200;
        font-size: 24px;
        padding: 12px;

        background: transparent;
        color: $light;
        border: 1px solid $acc2;
        outline: $gray2;

        transition: $trans;
    }
    button:hover{
        cursor: pointer;
        background: $acc2;
    }
    .acc1{color: $acc1; font-weight:700;}
</style>