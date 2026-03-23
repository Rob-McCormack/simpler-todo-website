import { onRequest as __api_help_js_onRequest } from "/Users/robmccormack/github/simpler-todo-website/functions/api/help.js"

export const routes = [
    {
      routePath: "/api/help",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_help_js_onRequest],
    },
  ]