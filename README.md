# Supply Run

Supply Run is a café inventory and purchasing demo that helps a manager spot upcoming stockouts and plan replenishment.

## Credits

- **Code implementation:** [Irfan (@Irfan-here)](https://github.com/Irfan-here).
- **Ideation and API key setup:** [@everyonenerd123-stack](https://github.com/everyonenerd123-stack).

## What it does

- Displays café inventory and recent sales.
- Forecasts shortages over the next 24 hours from the supplied demo data.
- Uses a ZooWork agent and Tavily supplier-price search to help prepare reorder recommendations.
- Lets the manager review and approve purchase orders.
- Includes simulated supplier pages and order confirmations.
- Provides a mock mode for the morning check without live API calls.

Forecast calculations run in code; the agent supplies explanations and helps with the purchasing workflow.

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local`. To try the morning check without API keys, set:

   ```dotenv
   MOCK_MODE=1
   ```

3. Start the app:

   ```sh
   npm run dev
   ```

   Open [localhost:3000](http://localhost:3000).

You can also run the mock morning check from the terminal:

```sh
npm run check:mock
```

For the live morning check, fill in `ZOOWORK_API_KEY` and `TAVILY_API_KEY` in `.env.local`, set `MOCK_MODE=0`, and run `npm run setup-agent` to create or update the agent and save its ID. Then run `npm run check`, or restart the app to use the dashboard.

Keep API keys in local environment settings; do not commit them.

## Stack

Next.js, React, TypeScript, Tailwind CSS, the ZooWork SDK, and Tavily. Demo inventory and sales data live in `data/`.
