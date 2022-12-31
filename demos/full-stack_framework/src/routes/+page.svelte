<script lang="ts">
    //imports
    import {SocioClient} from 'socio/core-client';
    import {onMount} from 'svelte';
    import {log} from '@rolands/log'; //for my debugging
    import {slide} from 'svelte/transition'

    //comps
    import Nav from "$lib/nav.svelte";
    import Bloom from "$lib/bloom.svelte";
    import Spinner from '$lib/spinner.svelte';
    import Button from '$lib/button.svelte';

    const sc = new SocioClient('ws://localhost:3000', {verbose:true, name:'Main'});
    let ready = false, user_count = 0;
    let users: {userid:number, name:string, num:number}[] = [];
    let insert_fields = {name:'Bob', num:42};
    let color_prop = '#ffffff';
    onMount(async () => {
        ready = await sc.ready();
        const user_count_id = sc.subscribe({ sql: "SELECT COUNT(*) AS RES FROM users WHERE name = :name;--socio", params: { name: 'John' } }, (res) => {
            // log(res);
			user_count = res[0].RES as number //res is whatever object your particular DB interface lib returns from a raw query
		})

        const users_id = sc.subscribe({ sql: "SELECT * FROM users;--socio"}, (res) => {
			// log(res)
            users = res as {userid:number, name:string, num:number}[] //res is whatever object your particular DB interface lib returns from a raw query
		})

        sc.subscribeProp('color', (c) => color_prop = c as string)
    })
</script>

<main>
    <Nav></Nav>
    <section>
        {#if ready}
            <div class="horiz">
                <h4 class="horiz" style="gap:6px;">
                    <Bloom style="--b_h:6px; --s_h:0.6;"><a href="https://kit.svelte.dev/" target="_blank" class="acc2 norm">SvelteKit</a></Bloom>
                     + 
                    <Bloom style="--b_h:6px; --s_h:0.6;"><a href="https://vitejs.dev/" target="_blank" class="acc1 norm">Vite</a></Bloom>
                    demo.
                </h4>
                <h6 class="darker_text">client ID: {sc.client_id}</h6>
            </div>
            <div class="horiz">
                <h6 class="darker_text bold">single sql query:</h6>
                <h4>SELECT 42+69 AS RESULT; = </h4>
                {#await sc.query('SELECT 42+69 AS RESULT;--socio')}
                    <Bloom><Spinner style="--h:24px;--t:6px;"></Spinner></Bloom>
                {:then res} 
                    <h4 class="bold">{res[0].RESULT}</h4>
                {/await}
            </div>
            
            <div class="horiz">
                <h6 class="darker_text bold">subscribed sql query:</h6>
                
                <h4>SELECT COUNT(*) FROM users WHERE name = :name <span class="h5 darker_text bold">(John)</span>; = 
                    {#if user_count}
                        <span class="bold">{user_count}</span>
                    {:else}
                        <Bloom><Spinner style="--h:24px;--t:6px;"></Spinner></Bloom>
                    {/if}
                </h4>
            </div>
            
            <div class="insert">
                <Bloom style="--s_h:0.8;--b_h:8px;--c_h:1;">
                    <Button style="width:100%;" on:click={async () => await sc.query("INSERT INTO users (name, num) VALUES(:name, :num);--socio", insert_fields)}>
                        INSERT INTO users (name, num) VALUES("<span class="acc1 norm">{insert_fields.name}</span>", <span class="acc1 norm">{insert_fields.num || 0}</span>);
                    </Button>
                </Bloom>
                <div class="inputs">
                    <Bloom style="--b:0px;--b_h:6px;--s:0;--s_h:0.4;"><input type="text" bind:value={insert_fields.name}></Bloom>
                    <Bloom style="--b:0px;--b_h:6px;--s:0;--s_h:0.4;"><input type="number" min="0" bind:value={insert_fields.num}></Bloom>
                </div>
            </div>

            <div class="users">
                {#each users as u (u.userid)}
                    <div class="user" transition:slide>
                        <h4>{u.userid}</h4>
                        <Bloom><h4 class="acc1">|</h4></Bloom>
                        <h4>{u.name}</h4>
                        <Bloom><h4 class="acc2">|</h4></Bloom>
                        <h4>{u.num}</h4>
                    </div>
                {/each}
            </div>

            <div class="color">
                <h6 class="darker_text bold">subscribed server prop:</h6>
                <Bloom style="--s_h:0.8;--b_h:8px;--c_h:1;">
                    <Button on:click={async () => await sc.setProp('color',color_prop)}>SET</Button>
                </Bloom>
                <Bloom style="--b:0px;--b_h:6px;--s:0;--s_h:0.4;"><input type="text" maxlength="7" bind:value={color_prop}></Bloom>
                <Bloom>
                    <div class="color_box" style="--c:{color_prop};">
                        <h4>{color_prop}</h4>
                    </div>
                </Bloom>
            </div>
        {:else}
            <Bloom style="--b:4px;"><Spinner style="--h:64px;--t:10px;"></Spinner></Bloom>
        {/if}
    </section>
</main>

<style lang="scss">
    main{
        padding: 24px;
    }

    .acc1{color: $acc1;}
    .acc2{color: $acc2;}
    .darker_text{color: $gray3;}
    .darker_text{color: $gray2;}
    .bold{font-weight: 700;}
    .norm{font-weight: 400;}
    .thin{font-weight: 300;}

    .horiz{
        display: flex;
        align-items: baseline;
        gap: $pad;
    }

    section{
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: $pad;
    }

    .insert{
        width: 600px;
        display: flex;
        flex-direction: column;
        gap: $pad;
    }

    .inputs{
        width: 100%;
        display: flex;
        gap:$pad;
    }

    input{
        flex-grow:1;
        min-width: 0px;

        font-size: 24px;
        font-weight: 200;
        background: transparent;
        color: $acc1;
        border: 1px solid $acc1;
        padding: $pad_small;
        outline: none;
    }

    .users{
        max-width: 600px;
        width: 600px;
        display: flex;
        flex-direction: column;
        gap: $pad_small;

        overflow-y: auto;
        max-height: 300px;
        padding: $pad;

        .user{
            width: 100%;
            display: flex;
            align-items: baseline;
            justify-content: space-between;
        }
    }

    .color{
        display: flex;
        align-items: center;
        gap: $pad;

        .color_box{
            min-width: 100px;
            height: 49px;
            padding: $gap;
            background-color: var(--c);
            display: flex;
            align-items: center;
            justify-content: center;

            transition: $trans;

            h4{
                color: white;
                mix-blend-mode: difference;
            }
        }
    }
</style>