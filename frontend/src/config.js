// Shared frontend configuration — import from here, never hardcode in components.
// Override per environment with REACT_APP_API_URL (.env.development / .env.production).
export const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";
