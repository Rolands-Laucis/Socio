<script>
    export let name, num;
</script>

<button on:click>
    INSERT INTO users VALUES("{name}", {num});
</button>

<style>
    button{
        font-weight: 700;
        font-size: 24px;
        background: var(--grad);
        background-position: 50% 0px;
        background-size: 150%;
        color: #fff;
        border: none;
        outline: none;
        border-radius: 12px;
        padding: 12px;
        filter: var(--shad);

        transition: var(--trans);
    }
    button:hover{
        cursor: pointer;
        border-radius: 6px;
        background-position: 0px 0px;
    }
</style>