<script lang="ts">
	import { GatewayIntentBits } from 'discord-api-types/v10'
	import { Client } from '../src'

	const ac = new AudioContext()
	const audio = new Audio()

	const c = new Client({
		token: import.meta.env.VITE_DISCORD_TOKEN,
		intents: GatewayIntentBits.GuildVoiceStates,
		debug: true,
	})

	const vm = c.createVoiceManager({ ac })

	audio.srcObject = vm.dst.stream

	let ready = false
	c.on('state', (s) => {
		switch (s) {
			case 'READY':
				ready = true
				break
			case 'DONE':
				ready = false
				break
		}
	})
</script>

<section>
	<h1>Client</h1>
	<button
		onclick={async () => {
			await navigator.mediaDevices.getUserMedia({ audio: true })
			await ac.resume()
			await audio.play()
			c.start()
		}}
	>
		Start
	</button>
	<button onclick={() => c.shutdown()}>Stop</button>
</section>

<section>
	<h1>Voice</h1>
	<button
		disabled={!ready}
		onclick={() => {
			vm.update({
				speaking: true,
				self_deaf: false,
				self_mute: false,
				guild_id: '559178010838958090',
				channel_id: '1252750970572636242',
			})
		}}
	>
		Join
	</button>
	<button disabled={!ready} onclick={() => vm.update({ channel_id: null })}>Leave</button>
</section>
