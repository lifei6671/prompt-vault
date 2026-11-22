import { createRequestHandler } from "react-router";
import { applyResponseCachePolicy } from "./response-policy";
import { observeRequest } from "./request-log";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, bindings) {
    return observeRequest(request, bindings.DB, async (input) =>
      applyResponseCachePolicy(input, await requestHandler(input)));
  },
} satisfies ExportedHandler<Env>;
