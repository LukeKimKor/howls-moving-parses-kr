import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@picocss/pico";
import "./styles.css";
import "./raid-analysis.css";
import "./typography.css";
import App from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
			.then((registration) => {
				const check = () => registration.active?.postMessage({ type: "CHECK_FOR_UPDATE" });
				setInterval(check, 300_000);
				window.addEventListener("focus", check);
				document.addEventListener("visibilitychange", () => {
					if (!document.hidden) check();
				});
			})
			.catch((err) => console.warn("SW registration failed:", err));
	});
}
