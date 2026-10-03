// Run once: creates the Supply Run agent on ZooWork, starts it, and saves its id to .env.local.
// Run it again after changing lib/agent-config.ts to push the new instructions to the agent.
//
//   npm run setup-agent
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createZooworkClient } from '@zoowork-ai/sdk'
import { AGENT_IDEMPOTENCY_KEY, agentResource } from '../lib/agent-config'

const ENV_FILE = '.env.local'

async function main() {
  const zc = createZooworkClient()

  const models = await zc.listModels()
  const model = models.find((m) => m.selectable !== false && m.default_for?.includes('model'))?.model
  if (!model) throw new Error('ZooWork returned no selectable default model')
  console.log(`Model: ${model}`)

  let agentId = process.env.ZOOWORK_AGENT_ID
  if (agentId) {
    console.log(`Updating existing agent ${agentId}...`)
    const { name: _name, ...sections } = agentResource(model)
    await zc.updateAgent(agentId, sections)
  } else {
    console.log('Creating agent...')
    const created = await zc.createAgent({ resource: agentResource(model) }, AGENT_IDEMPOTENCY_KEY)
    agentId = created.agent_id
    saveAgentId(agentId)
    console.log(`Created ${agentId} and saved it to ${ENV_FILE}`)
  }

  await zc.startAgent(agentId)
  await zc.waitUntilRunning(agentId, { timeoutMs: 60_000 })
  console.log(`Agent ${agentId} is running. Next: npm run check`)
}

function saveAgentId(agentId: string) {
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  const lines = current.split(/\r?\n/).filter((l) => l && !l.startsWith('ZOOWORK_AGENT_ID='))
  lines.push(`ZOOWORK_AGENT_ID=${agentId}`)
  writeFileSync(ENV_FILE, lines.join('\n') + '\n')
}

main().catch((err) => {
  console.error('Setup failed:', err instanceof Error ? `${err.message}${(err as any).type ? ` (${(err as any).type})` : ''}` : err)
  process.exit(1)
})
