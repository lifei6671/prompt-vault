import { createRequestHandler } from "react-router";
import { applyResponseCachePolicy } from "./response-policy";
import { requestSummary } from "./request-log";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    const started = performance.now();
    let status = 500;
    try {
      const response = applyResponseCachePolicy(request, await requestHandler(request));
      status = response.status;
      return response;
    } finally {
      console.log(requestSummary(request, status, Math.round(performance.now() - started)));
    }
  },
} satisfies ExportedHandler<Env>;
