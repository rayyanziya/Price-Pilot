import { createApp } from "./app";
import { hasDatabaseUrl } from "./db";
import { loadLocalEnv } from "./loadEnv";
import { PricingEngine } from "./pricingEngine";
import { InMemoryQuoteRepository, PostgresQuoteRepository } from "./repositories/marketDataRepository";

loadLocalEnv();

const port = Number(process.env.PORT ?? 4000);
const repository = hasDatabaseUrl() ? new PostgresQuoteRepository() : new InMemoryQuoteRepository([]);
const pricingEngine = new PricingEngine(repository);
const app = createApp(pricingEngine);

app.listen(port, () => {
  console.log(`PricePilot backend listening on port ${port}`);
});
