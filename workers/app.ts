import { createRequestHandler } from "react-router";
import { handleFilteredRequest } from "./request-filter";
import { observeRequest } from "./request-log";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, bindings) {
    return observeRequest(request, bindings.DB, async (input) =>
      handleFilteredRequest(input, requestHandler));
  },
} satisfies ExportedHandler<Env>;
