<script>
    import Bloom from "./bloom.svelte";
    import Border from "./border.svelte";
    import Code from "./code.svelte";

</script>

<section class="content">
    <div class="text">
        <h1>Socio.js</h1>
        <h4 class="sub_title">WebSocket <Bloom tb><span style="color: var(--acc_1);">live</span></Bloom>/ <Bloom tb><span style="color: var(--acc_2);">reactive</span></Bloom>database connection framework.</h4>
        <nav>
            <Bloom tb><a href="http://" target="_blank">github</a></Bloom>
            <Bloom tb><a href="http://" target="_blank">npm</a></Bloom>
        </nav>
    </div>
    <Border>
        <Code>
            {`const ws = new SocioClient('ws://localhost:3000', {verbose:true, name:'Main'})
await ws.ready()

ws.subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users WHERE name = :name;--socio", params: { name: 'Bob' } }, (res) => {
    bob_count = res[0].RESULT
})

ws.query({ sql: "INSERT INTO users VALUES(:name);--socio-auth-perm"}, {name:'Joe'})`}
        </Code>
    </Border>
</section>

<style lang="scss">
    .content{
        padding: 100px;

        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
    }

    .text{
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    .sub_title{
        font-weight: 200;

        display: flex;
        flex-wrap: wrap;
        align-items:baseline;
        white-space: pre;
    }

    nav{
        display: flex;
        gap: 16px;
        text-transform: uppercase;

        a{
            color: $acc1;
            text-decoration-color: $acc1;
            text-underline-offset: 6px;
            // transition: $trans;

            &:hover{
                text-underline-offset: 10px;
            }
        }
    }
</style>