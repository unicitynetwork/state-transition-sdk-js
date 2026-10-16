# Interop with a real aggregator-go gateway (proof status, aggregator-go#209 / #210)

`zz_js_server_test.go.txt` is a throw-away Go test for a checkout of aggregator-go PR #210 (`uc/proof-status`): it serves the
**real** JSON-RPC server, the real `get_inclusion_proof.v2` and `certification_request` handlers and the real batch error
constructor behind a service whose answers follow the first byte of the state id. Copy it to `internal/gateway/zz_js_server_test.go`:

```
# a valid unicity certificate for the fixture
PROOF_STATUS_WRITE_UC=/tmp/uc.hex npx jest tests/unit/api/ProofStatusInteropTest.ts
# in aggregator-go
JS_SERVER_ADDR=127.0.0.1:38211 JS_UC_HEX_FILE=/tmp/uc.hex JS_STOP_FILE=/tmp/stop \
  go test ./internal/gateway -run TestZZServeForJS -count=1 -timeout 300s     # touch /tmp/stop to end it
# in this repository
PROOF_STATUS_SERVER=http://127.0.0.1:38211 npx jest tests/unit/api/ProofStatusInteropTest.ts
```

Without `PROOF_STATUS_SERVER` the interop test is skipped, so CI is unaffected.
