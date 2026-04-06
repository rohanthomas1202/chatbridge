# ChatBridge Cost Analysis

## API Costs

ChatBridge proxies requests to third-party AI providers. Users supply their own API keys so costs depend on the provider and model chosen.

### Estimated per-conversation costs (typical 20-message session)

| Provider | Model | Input (est.) | Output (est.) | Cost/session |
|----------|-------|-------------|--------------|-------------|
| OpenAI | GPT-4o | ~4K tokens | ~2K tokens | ~$0.03 |
| OpenAI | GPT-4o-mini | ~4K tokens | ~2K tokens | ~$0.002 |
| Anthropic | Claude Sonnet 4 | ~4K tokens | ~2K tokens | ~$0.03 |
| Anthropic | Claude Haiku 4 | ~4K tokens | ~2K tokens | ~$0.005 |
| Google | Gemini 2.5 Flash | ~4K tokens | ~2K tokens | ~$0.002 |

### Tool-call overhead

Each plugin invocation adds a tool schema to the system prompt, increasing input token count by roughly:
- `suggest_chess_move`: ~120 tokens
- `show_weather`: ~60 tokens
- `create_playlist`: ~80 tokens

With all 3 plugins active, expect ~260 extra input tokens per request (~$0.001 on GPT-4o).

## Infrastructure Costs

### Vercel (recommended deployment)

| Tier | Monthly | Includes |
|------|---------|----------|
| Hobby | $0 | 100 GB bandwidth, serverless functions |
| Pro | $20/member | 1 TB bandwidth, analytics, team features |

ChatBridge is a static SPA — no serverless functions are required. The Hobby tier is sufficient for personal use.

### External APIs used by plugins

| API | Cost | Notes |
|-----|------|-------|
| Open-Meteo (weather) | Free | No API key, no rate limit for reasonable use |
| Spotify Web API | Free | Requires developer account, rate-limited |

## Cost Optimization Tips

1. **Use cheaper models for casual chat** — GPT-4o-mini and Claude Haiku are 10-15x cheaper than flagship models.
2. **Disable unused plugins** — Fewer tool schemas = fewer input tokens.
3. **Shorter system prompts** — Customize via settings to reduce per-message token overhead.
4. **Enable streaming** — Already on by default; reduces perceived latency without affecting cost.

## Monthly cost estimates by usage

| Usage Level | Messages/month | Model | Est. monthly cost |
|-------------|---------------|-------|-------------------|
| Light | 200 | GPT-4o-mini | ~$0.20 |
| Moderate | 1,000 | GPT-4o | ~$1.50 |
| Heavy | 5,000 | GPT-4o | ~$7.50 |
| Heavy | 5,000 | Claude Sonnet 4 | ~$7.50 |

*All estimates assume ~200 input tokens + ~100 output tokens per message on average. Actual costs vary with conversation length and context window usage.*

## Production Cost Projections

### Assumptions

| Parameter | Value |
|-----------|-------|
| Average sessions per user/month | 20 |
| Average messages per session | 15 |
| Average tool invocations per session | 2 |
| Tokens per message (input) | 300 (includes tool schemas) |
| Tokens per message (output) | 150 |
| Model | GPT-4o-mini ($0.15/1M input, $0.60/1M output) |
| Plugin iframe hosting | Static files (no server cost) |
| Auth backend | Included in Vercel serverless (free tier) |

### Monthly Cost by Scale

| Users | Sessions/mo | Messages/mo | Input tokens | Output tokens | LLM Cost | Infra Cost | Total |
|-------|-------------|-------------|-------------|--------------|----------|------------|-------|
| 100 | 2,000 | 30,000 | 9M | 4.5M | $4.05 | $0 (Hobby) | ~$4/mo |
| 1,000 | 20,000 | 300,000 | 90M | 45M | $40.50 | $0 (Hobby) | ~$41/mo |
| 10,000 | 200,000 | 3,000,000 | 900M | 450M | $405 | $20 (Pro) | ~$425/mo |
| 100,000 | 2,000,000 | 30,000,000 | 9B | 4.5B | $4,050 | $20 (Pro) | ~$4,070/mo |

### Notes

- **LLM costs are borne by the platform** if using a shared API key, or **$0 to the platform** if users supply their own keys (current ChatBridge model).
- With user-supplied keys, platform cost is purely infrastructure: $0-$20/month regardless of scale.
- If offering a managed API key model (like Chatbox AI's license system), the LLM costs above apply.
- Spotify and weather API calls are free and do not contribute to costs.
- Stockfish runs client-side (WASM) — no server compute cost for chess.

### Development Costs Incurred

| Category | Amount | Details |
|----------|--------|---------|
| OpenAI API (testing) | ~$2.50 | Model testing during development |
| Anthropic API (testing) | ~$1.80 | Claude model integration testing |
| Infrastructure | $0 | Vercel Hobby tier |
| External APIs | $0 | Open-Meteo (free), Spotify (free dev tier) |
| **Total dev spend** | **~$4.30** | |
