<script lang="ts">
    //imports
    import { SocioClient } from "socio/dist/core-client";
    import type {id} from 'socio/dist/types'
    import { onMount, onDestroy } from "svelte";
    import {socio} from 'socio/dist/utils'

    import { slide } from "svelte/transition";
    import toast from 'svelte-french-toast'; //https://github.com/kbrgl/svelte-french-toast

    //comps
    import Bloom from "$lib/bloom.svelte";
    import Spinner from "$lib/spinner.svelte";
    import Button from "$lib/button.svelte";
    import { writable } from "svelte/store";
    import { log } from "socio/dist/logging";

    //init SocioClient
    const sc = new SocioClient("ws://localhost:3000", {
        logging:{verbose: false},
        name: "Main",
        // persistent:true
    });

    //setup toasts
    sc.lifecycle_hooks.msg = (name:string, client_id:string, kind:string, data:any) => {
        if(['UPD', 'PROP_UPD'].includes(kind))
            toast('An update came in from the Socio Server.', {style:'background: #0D0D0E; color: #fff;',position: "bottom-center", duration:1000});
        else if(kind == 'ERR')
            toast.error(`An error arrived for a query or prop. MSG ID:${data.id}`,{position: "bottom-center", duration:2000})
    }

    //variables
    let ready = false,
        user_count = 0;
    let users: { userid: number; name: string; num: number }[] = [];
    let insert_fields = { name: "Bob", num: 42 };
    let color_prop = "#ffffff", num = 0;
    let progress = writable(0);

    onMount(async () => {
        ready = await sc.ready();
        toast.success('Socio Client connected!', {icon:'🥳',position: "bottom-center", duration:1000});
        
        sc.Subscribe({sql: socio`SELECT COUNT(*) AS RES FROM users WHERE name = :name;`,params: { name: "John" }}, (res) => {
                //@ts-ignore
                user_count = res[0].RES as number; //res is whatever object your particular DB interface lib returns from a raw query
            }
        );

        sc.Subscribe({ sql: socio`SELECT * FROM users;` },(res) => {
                users = res as { userid: number; name: string; num: number }[]; //res is whatever object your particular DB interface lib returns from a raw query
            }
        );

        sc.SubscribeProp("color", c => color_prop = c as string);
        sc.SubscribeProp("num", n => num = n as number);
    });

    //cleanup for dev server reloads.
    onDestroy(() => {
        sc.UnsubscribeAll({props:true, queries:true}); //NB! this wipes the subscriptions on the SocioClient instance, not just the ones registered here. Subscriptions return ids to use for unsubscribing.
    })

    async function UploadFiles(e:any){
        $progress = 0;
        const q = sc.SendFiles(e.target.files);
        sc.TrackProgressOfQueryPromise(q, progress.set);
        log('file upload result bit: ', await q);
    }
</script>

<main>
    {#if ready}
        <section>
            <h4>
                <a href="https://kit.svelte.dev/"
                    target="_blank"
                    class="thin light">
                    SvelteKit
                </a>
                +
                <a href="https://vitejs.dev/"
                    target="_blank"
                    class="thin light">
                    Vite
                </a>
                demo.
            </h4>
            <h6 class="darker_text">client ID: {sc.client_id}</h6>
        </section>

        <hr>

        <section>
            <h6 class="darker_text bold">single sql query:</h6>
            <h4>SELECT 42+69 AS RESULT; =</h4>
            {#await sc.Query(socio`SELECT 42+69 AS RESULT;`)}
                <Bloom><Spinner style="--h:24px;--t:6px;" /></Bloom>
            {:then res}
                <h4 class="bold">{res[0].RESULT}</h4>
            {/await}
        </section>

        <section>
            <h6 class="darker_text bold">subscribed sql query:</h6>

            <h4>
                SELECT COUNT(*) FROM users WHERE name = :name <span class="h5 darker_text bold">(John)</span>; =
                {#if user_count}
                    <span class="bold">{user_count}</span>
                {:else}
                    <Bloom><Spinner style="--h:24px;--t:6px;" /></Bloom>
                {/if}
            </h4>
        </section>

        <hr>

        <section class="vert" style="width: 600px;">
            <Bloom style="--s_h:0.8;--b_h:8px;--c_h:1; width:100%;">
                <Button
                    style="width:100%;"
                    on:click={async () =>
                        await sc.Query(
                            socio`INSERT INTO users (name, num) VALUES(:name, :num);`,
                            insert_fields
                        )}
                >
                    INSERT INTO users (name, num) VALUES("<span class="acc1 norm">{insert_fields.name}</span>",
                    <span class="acc1 norm">{insert_fields.num || 0}</span>);
                </Button>
            </Bloom>
            <div class="inputs">
                <input type="text" bind:value={insert_fields.name}/>
                <input type="number" min="0" bind:value={insert_fields.num}/>
            </div>
        </section>

        <section class="vert users">
            {#each users as u (u.userid)}
                <div class="user" transition:slide>
                    <h4>{u.userid}</h4>
                    <h4 class="acc1">|</h4>
                    <h4>{u.name}</h4>
                    <h4 class="acc2">|</h4>
                    <h4>{u.num}</h4>
                </div>
            {/each}
        </section>

        <hr>

        <div class="color">
            <h6 class="darker_text bold">subscribed server prop:</h6>
            <input type="text" maxlength="7" bind:value={color_prop} on:input={async () => await sc.SetProp("color", color_prop)}/>
            <Bloom style="--s:0.5;--b:8px;--c:1;">
                <div class="color_box" style="--c:{color_prop};">
                    <h4>{color_prop}</h4>
                </div>
            </Bloom>
        </div>

        <hr>

        <section>
            <Bloom><Button on:click={() => sc.SetProp('num', --num)}>-</Button></Bloom>
            <input type="number" bind:value={num} on:change={() => sc.SetProp('num', num)}>
            <Bloom><Button on:click={() => sc.SetProp('num', ++num)}>+</Button></Bloom>
        </section>

        <hr>

        <section class="vert" style="width: clamp(200px, 90dvw, 800px);">
            <input type="file" accept=".txt, .rtf" multiple on:change={UploadFiles}>
            <Bloom style="--s:0.5;--b:8px;--c:1; width:100%;">
                <progress value={$progress} max="100"></progress>
            </Bloom>
        </section>
    {:else}
        <Bloom style="--b:4px;"><Spinner style="--h:64px;--t:10px;" /></Bloom>
    {/if}
</main>

<style lang="scss">
    main{
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: $pad;
    }

    section{
        display: flex;
        align-items: baseline;
        gap: $pad;

        &.vert{
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
    }

    .inputs {
        width: 100%;
        display: flex;
        gap: $pad;
    }

    input {
        width: calc(100% - (#{$pad_small} * 2));
        min-width: 0px;
        padding: $pad_small;

        font-size: 24px;
        font-weight: 200;
        background: transparent;
        color: $acc1;
        border: 1px solid $acc1;
        outline: none;
    }

    .users {
        max-width: 600px;
        width: 600px;
        gap: $pad_small;

        overflow-y: auto;
        max-height: 300px;
        padding: $pad;

        .user {
            width: 100%;
            display: flex;
            align-items: baseline;
            justify-content: space-between;
        }
    }

    .color {
        display: flex;
        align-items: center;
        gap: $pad;

        .color_box {
            min-width: 100px;
            height: 49px;
            padding: $gap;
            background-color: var(--c);
            display: flex;
            align-items: center;
            justify-content: center;

            transition: $trans;

            h4 {
                color: white;
                mix-blend-mode: difference;
            }
        }
    }

    hr {
        display: block;
        min-height: 1px;
        height: 1px;
        width: 500px;
        background-color: $gray3;
        outline: none;
        border: none;
    }

    .num{
        display: flex;
        align-items: center;
        gap: $pad;
    }

    progress{
        width: 100%;
    }
</style>
