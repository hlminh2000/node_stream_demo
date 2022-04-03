# Node JS Streaming Demo

This is a demo app to showcase streaming through http with Node JS.

Run it:

```sh
npm ci && npm start
```

In the browser, visit http://localhost:5000.

## Usage:

1. The `size` input: allows specifying how many elements to stream. Leaving out is equivalent to an infinite stream.
2. `start` / `stop` button: starts / stop streaming.
3. `clear` button: clears out the UI.

All sessions share the same stream of numbers so if you stream to multiple windows, no single number will be sent to multiple window, but multiple clients can access the same stream at once and receive random allocation of elements from the same stream.
