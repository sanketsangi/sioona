// Tests must never reach a real FastAPI. A dev server on localhost:8000 would
// otherwise answer slowly and time out store tests that CI passes; a closed
// port fails fast like CI does. Tests that need a URL stub it themselves.
process.env.BACKEND_URL = "http://127.0.0.1:9";
