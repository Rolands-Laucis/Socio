<script>
	//imports:
	// import { WSClient } from 'socio/core-client.js'
	import { WSClient } from '../../../core/core-client.js'
	import {onMount} from 'svelte'
	import {slide} from 'svelte/transition'

	//svelte components:
	import Nav from "./nav.svelte";
	import Code from './code.svelte'
	import Spinner from './spinner.svelte'
	import Button from './button.svelte'
	
	let ws = null
	let clienID = false
	const simple_sql_arith = "SELECT 42+69 AS RESULT;--socio";
	const static_queries = [{text:'once:', sql:simple_sql_arith}, {text:'once:', sql:"SELECT COUNT(*) AS RESULT FROM users;--socio"}]
	let users = [], bob_count=0;
	const insert_fields = {name:'Bob', num:420}

	onMount(async ()=>{
		ws = new WSClient('ws://localhost:3000', {verbose:true, name:'Main'})
		await ws.ready()
		clienID = ws.ses_id

		ws.subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users WHERE name = :name;--socio", params: { name: 'Bob' } }, (res) => {
			bob_count = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
		})

		ws.subscribe({ sql: "SELECT * FROM users;--socio"}, (res) => {
			users = res //res is whatever object your particular DB interface lib returns from a raw query
		})
	})
</script>

<Nav></Nav>
<main>
	<h1>Socio framework secured use demonstration - Svelte</h1>
	{#if clienID}
		<div class="horiz">
			<h2 id="ready" class="status">Ready.</h2>
			<h3>client ID: {clienID}</h3>
		</div>

		{#each static_queries as q}
			<h2 class="row horiz">
				<h3>{q.text}</h3><Code on:click={() => q.sql = q.sql}>{q.sql}</Code> =
				{#await ws.query(q.sql)}
					<Spinner></Spinner>
				{:then res} 
					<span class="num grad_clip">{res[0].RESULT}</span>
				{/await}
			</h2>
		{/each}

		<div class="horiz">
			<Button on:click={async () => await ws.query("INSERT INTO users VALUES(:name, :num);--socio", insert_fields)} bind:name={insert_fields.name} bind:num={insert_fields.num}></Button>
			<input type="text" bind:value={insert_fields.name}>
			<input type="number" bind:value={insert_fields.num}>
		</div>

		<h2 class="row horiz">
			<h3>subscribed:</h3>
			<Code>SELECT COUNT(*) AS RESULT FROM users WHERE name = :name; && :name = 'Bob'</Code>
			=
			<span class="num grad_clip">{bob_count}</span>
		</h2>
	{:else}
		<h2 id="ready" class="status">Not Ready!</h2>
	{/if}
</main>

{#if users}
	<section>
		<div class="users">
			<div class="horiz"><h3>subscribed:</h3> <Code>SELECT * AS RESULT FROM users;</Code>=</div>
			<h2 class="grad_clip">{'{'}</h2>
			{#each users as u}
				<div class="horiz user_row" transition:slide>
					<h2>name: <span class="grad_clip">{u.name}</span></h2>
					<h2>num: <span class="grad_clip">{u.num}</span></h2>
				</div>
			{/each}
			<h2 class="grad_clip">{'}'}</h2>
		</div>

		<h3>Check the dev console for verbose logs and the network panel for websocket connection messages ;)</h3>
	</section>
{/if}

<style lang="css">
	main {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-evenly;
	}
	section{
		padding: 32px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
	}
	
	.horiz{
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.users{
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.user_row{
		justify-content: center;
	}

	input{
		background-color: #292929;
		border: 1px solid #9c9c9c;
		border-radius: 4px;
		width: 150px;
		font-size: 25px;
		padding: 4px 8px;
		transition: var(--trans);
	}
	input:hover{
		background-color: #383838;
	}
</style>
