import "@hibana-apps/runtime/polyfills"
import {
  runtimeFetch,
  runtimeScheduled,
  runtimeQueue,
  setApplicationScripts,
  type Env,
} from "@hibana-apps/runtime"
import appMain from "../app/app.rb"
import "./generated/helper-scripts"
import modelScripts from "./generated/model-scripts"
import "./generated/template-assets"
import "./generated/static-assets"
import { durableScripts } from "./generated/durable-manifest"

setApplicationScripts([
  ...modelScripts,
  { filename: "app/app.rb", source: appMain },
  ...durableScripts,
])

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return runtimeFetch(request, env)
  },
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    return runtimeScheduled(event, env, ctx)
  },
  queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    return runtimeQueue(batch, env, ctx)
  },
}

export * from "./generated/durable-manifest"
