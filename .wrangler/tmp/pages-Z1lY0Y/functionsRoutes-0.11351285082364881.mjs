import { onRequest as __api_v1_chat_js_onRequest } from "/Users/robmccormack/github/simpler-todo-website/functions/api/v1/chat.js"

export const routes = [
    {
      routePath: "/api/v1/chat",
      mountPath: "/api/v1",
      method: "",
      middlewares: [],
      modules: [__api_v1_chat_js_onRequest],
    },
  ]