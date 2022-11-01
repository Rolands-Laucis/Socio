<script>
    export let style=''
</script>

<div class="spinner" {style}></div>

<style>
    .spinner{
        --thicc: 5px;
        height: 32px;
        aspect-ratio: 1/1;
        border: 5px solid;
        border-color: var(--accent1) transparent var(--accent2) transparent;
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