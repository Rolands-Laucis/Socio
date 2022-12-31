<script lang="ts">
    export let style:string='';
</script>

<button on:click {style}>
    <slot></slot>
</button>

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