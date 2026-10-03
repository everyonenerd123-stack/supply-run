# Supply Run

Hackathon project, 6 hours, submission at **4:45 PM on 2026-10-03**.

A ZooWork agent that keeps a small café from running out of stock. It moves one P&L line:
**lost sales from stockouts and wasted spend from rush orders.**

## Demo flow

1. A dashboard shows the café's current inventory and the last 7 days of sales.
2. The manager clicks **"Run morning check."**
3. The agent forecasts which items will run out in the next 24 hours.
4. For those items, it uses Tavily search to find current supplier prices.
5. It drafts a purchase order with a short reason for each line.
6. The manager approves or rejects it (an Approve button first; WhatsApp or Slack via ZooWork
   later if time allows).
7. On approval, the order shows as approved on the dashboard.

## Tech

- The agent is built and hosted on ZooWork, using the `zoowork-managed-agents` skill
  (`.claude/skills/zoowork-managed-agents/`). Read that skill before writing ZooWork code.
- API keys come from environment variables: `ZOOWORK_API_KEY` and `TAVILY_API_KEY`.
- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui. Deploy to Vercel later.
- Fake data lives in `data/inventory.json` and `data/sales.json` (15 café items, with stock,
  par levels, units and usual supplier).
  - The data is designed so that exactly 4 items run out in the next 24 hours (oat milk,
    avocados, croissants, sourdough). Three are low but fine (whole milk, espresso beans, eggs).
    The rest are well stocked. The demo must always produce a clear, believable reorder.
  - `inventory.json` `as_of` is the morning stock count. Forecasts are for the 24 hours after
    `as_of`, not the real clock, so the demo works on any day.
- UI mockups are in `designs/`. Match them as closely as possible: layout, colors and
  components. **If something in a mockup is outside the demo flow, ask before building it.**

## Build order (decided)

The demo must be complete and submittable before any stretch work starts.

1. Agent morning check from a script (forecast + reorder list, with mock mode)
2. Tavily supplier prices (custom tool run by our backend)
3. Purchase order draft with a reason per line
4. Approve / reject button
5. Dashboard UI (inventory, 7-day sales, run check, PO, approved state)
6. **Stretch, last:** photo upload. Mock detection only: any uploaded photo returns a fixed,
   believable detection result labelled as a demo. No real vision model and no sample photo.
   The photo only updates on-hand counts for fridge items; sales history, par levels and the
   other items still come from `data/`. If it breaks or time runs out, ship without it.

Dropped: WhatsApp/Slack approval (Project keys can't bind ZooWork Channels).

## Rules

- Simplest thing that works. No login, no database.
- Never commit API keys. `.env` files are in `.gitignore`.
- Include a mock mode so the demo still works if any API fails.
- Build in small steps. After each step, explain how to test it, and commit when it works.
- The developer is rusty at coding: explain anything they need to do themselves.

## Platform facts that shape the design (from the ZooWork skill docs)

- No public credential store and no authenticated MCP servers, so Tavily cannot be given to
  the agent as an MCP server with our key. Plan: a ZooWork **custom tool** that our own
  backend executes with `TAVILY_API_KEY`, so the key never leaves our server.
- Project API keys cannot bind ZooWork Channels (WhatsApp/Slack). The approval step uses our
  own Approve button.
- Pass input data to the agent inside the Session `user.message`. Don't use direct workspace
  file APIs.

## How the agent and code split the work (decided in step 1)

- **Code does the maths** (`lib/forecast.ts`): forecasts, which items run out, quantities,
  costs. In testing the model once claimed "34 is below 21", so arithmetic is never left to it.
- **The agent does judgement and wording**: reasons, summary, and later supplier search and
  the purchase-order draft. Its item list is checked against the numbers and corrected if it
  disagrees (`corrections` in the result).
- Repeat the rules and reply format in every message, not only in the persona; the agent
  drifted into a long report when they lived only in the persona.
- Commands: `npm run setup-agent` (create/update the agent), `npm run check` (live),
  `npm run check:mock` (no APIs). Agent id lives in `.env.local` as `ZOOWORK_AGENT_ID`.
