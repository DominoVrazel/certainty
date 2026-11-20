import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Bootstrap is imported once, in App.tsx, as the minified build. It used to be
// pulled in here as well — a second, different file, so the bundler kept both
// and shipped the whole framework twice. Worse, this copy was evaluated after
// App.tsx's own stylesheets, so Bootstrap was overriding the app's CSS rather
// than the other way round.

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
