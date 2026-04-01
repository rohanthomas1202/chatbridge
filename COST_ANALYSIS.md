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
