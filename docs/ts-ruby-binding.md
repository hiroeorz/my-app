# TypeScript ↔ Ruby Binding Overview

This document explains how the Cloudflare Workers TypeScript runtime and the embedded Ruby application communicate with each other.

## Key Components

- `src/ruby-runtime.ts`: boots the Ruby VM, registers bridge functions, and dispatches requests.
- `app/hibana/host_bridge.rb`: exposes class-level accessors that Ruby code uses to reach TypeScript functions.
- Client wrappers (`app/hibana/kv_client.rb`, `app/hibana/d1_client.rb`, `app/hibana/r2_client.rb`, etc.): call the bridge helpers instead of touching JavaScript directly.

## Initialization Flow

1. `handleRequest` calls `setupRubyVM` (`src/ruby-runtime.ts:62`), which instantiates the WASM-based Ruby VM.
2. The VM evaluates `app/hibana/host_bridge.rb`, defining the `HostBridge` module (`src/ruby-runtime.ts:78`).
3. `registerHostFunctions` attaches JavaScript helper functions to `globalThis` when they are not already defined (`src/ruby-runtime.ts:165`).
4. `vm.eval('require "js"')` enables access to JavaScript objects from Ruby (`src/ruby-runtime.ts:384`).
5. Each helper is wrapped with `vm.wrap` and assigned to the corresponding `HostBridge` accessor (for example, `HostBridge.call("ts_call_binding=", vm.wrap(host.tsCallBinding))`).

After this sequence, Ruby code can call `HostBridge` methods and TypeScript will receive the message.

## Registered Host Functions

| Ruby accessor                    | JavaScript helper           | Purpose                                                                    |
| -------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `HostBridge.ts_call_binding`     | `host.tsCallBinding`        | General-purpose binding/method invoker (KV, R2, Workers AI, etc.).         |
| `HostBridge.ts_run_d1_query`     | `host.tsRunD1Query`         | Executes prepared statements against Cloudflare D1.                        |
| `HostBridge.ts_http_fetch`       | `host.tsHttpFetch`          | Wraps `fetch` with request/response serialization and error handling.      |
| `HostBridge.ts_workers_ai_invoke`| `host.tsWorkersAiInvoke`    | Safely calls Workers AI bindings with argument shape validation.           |
| `HostBridge.ts_report_ruby_error`| `host.tsReportRubyError`    | Forwards Ruby exceptions to the Worker console.                            |

The helpers protect against missing bindings, ensure arguments are shaped correctly, and normalize return values.

## Calling Sequence (KV Example)

1. A route handler grabs the binding from the request context: `kv = c.env(:MY_KV)` (`app/app.rb`).
2. `KV::Namespace#put` calls `HostBridge.call_async(@binding_name, :put, key, value)` (`app/hibana/kv_client.rb:7`).
3. `HostBridge.call_async` verifies the `ts_call_binding` accessor is registered, then executes it (`app/hibana/host_bridge.rb:10`).
4. `host.tsCallBinding` resolves the binding object from `env`, resolves the requested method, and executes it using `Reflect.apply(targetMethod, target, args)` so that the original binding becomes `this` (`src/ruby-runtime.ts:168`).
5. If the JavaScript call returns a promise, `HostBridge.call_async` awaits it and hands the resolved value back to Ruby. If the call returns `undefined`, JavaScript converts it to `null` so Ruby receives a value.

Ruby therefore writes code that looks synchronous while TypeScript handles async boundaries transparently.

## Specialized Flows

- **D1**: `D1::PreparedStatement#execute` forwards all SQL metadata in a single call to `HostBridge.run_d1_query`. `host.tsRunD1Query` prepares the statement, calls `bind`, and runs the requested action, returning a JSON string to Ruby (`src/ruby-runtime.ts:194`). The Ruby wrapper leaves the JSON parsing to the caller to stay close to existing D1 semantics.
- **HTTP Fetch**: `host.tsHttpFetch` serializes the request payload, invokes `fetch`, and returns a JSON response object—even on errors—so Ruby can pattern-match on the `ok` flag.
- **Workers AI**: `host.tsWorkersAiInvoke` validates the payload before reaching the binding, building argument lists that match Workers AI conventions (model name, payload object, etc.).

## Error Reporting

When Ruby code raises during `dispatch`, `routing.rb` calls `HostBridge.report_ruby_error` with a JSON payload describing the exception. `host.tsReportRubyError` logs the error with class, message, and backtrace (`src/ruby-runtime.ts:353`), helping diagnose issues from the Workers side while Ruby returns a generic 500 response.

## Quick Reference

- Ruby never instantiates `HostBridge`; it relies on module-level accessors.
- TypeScript owns the lifecycle of the helper functions and installs them exactly once per runtime boot.
- `Reflect.apply` is used instead of `Function.prototype.call` to work cleanly with proxies and to make the invocation semantics explicit.
- Some helpers return raw values, while others return serialized JSON; Ruby callers should follow the conventions of each dedicated client wrapper.
