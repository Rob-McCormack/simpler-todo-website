import { onRequestGet as __api_chat_js_onRequestGet } from "/Users/robmccormack/github/simpler-todo-website/functions/api/chat.js"
import { onRequestPost as __api_chat_js_onRequestPost } from "/Users/robmccormack/github/simpler-todo-website/functions/api/chat.js"

export const routes = [
    {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_chat_js_onRequestGet],
    },
  {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_chat_js_onRequestPost],
    },
  ]