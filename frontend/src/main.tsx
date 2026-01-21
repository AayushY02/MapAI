import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("root要素が見つかりません");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
