<span class="code" on:click title="Click to refresh!">
   <slot></slot> 
</span>

<style>
    .code{
        font-family: 'Trispace', monospace;
        font-weight: 100;
        font-size: 19.20px;
        padding: 8px;
        border-radius: 4px;
        background-color: #292929;
        border: 1px solid #9c9c9c;
        transition: var(--trans);
        filter: var(--shad);
    }
    .code:hover{
        background-color: #383838;
        cursor: pointer;
    }
</style>