import { onRequest as __api_v1_c_js_onRequest } from "/Users/robmccormack/github/simpler-todo-website/functions/api/v1/c.js"

export const routes = [
    {
      routePath: "/api/v1/c",
      mountPath: "/api/v1",
      method: "",
      middlewares: [],
      modules: [__api_v1_c_js_onRequest],
    },
  ]