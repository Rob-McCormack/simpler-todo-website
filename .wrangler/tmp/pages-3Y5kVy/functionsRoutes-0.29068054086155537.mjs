import { onRequest as __api_chat_js_onRequest } from "/Users/robmccormack/github/simpler-todo-website/functions/api/chat.js"

export const routes = [
    {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_chat_js_onRequest],
    },
  ]