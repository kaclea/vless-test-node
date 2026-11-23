# vless-test-node

Minimal VLESS-over-WebSocket proxy (TCP only) for testing on Eurobase's free tier.

## Deploy (Eurobase)

1. Connect this repo in Eurobase (project `vless-test-node`).
2. Set environment variables in the Eurobase dashboard:
   - `UUID` — VLESS client id (never commit it)
   - `WS_PATH` — WebSocket path, e.g. `/786f284a2aec5b78`
   - `PORT` is provided by the platform.
3. Deploy. Health check: `GET /` returns `200 ok`.

## Client link (fill in after deploy)

```
vless://<UUID>@vless-test-node.eurobase.dev:443?encryption=none&security=tls&sni=vless-test-node.eurobase.dev&type=ws&host=vless-test-node.eurobase.dev&path=%2F<WS_PATH without leading slash>#eurobase-vless
```

## Notes

- TCP only; UDP is not implemented in this test build.
- The `ws` dependency is installed by the Node.js buildpack via `npm install`.
