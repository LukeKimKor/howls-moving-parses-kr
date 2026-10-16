import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	base: process.env.DEPLOY_BASE_PATH ?? "/",
	plugins: [react()],
	build: {
		modulePreload: { polyfill: false },
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				sw: resolve(__dirname, "src/sw.ts"),
			},
			output: {
				entryFileNames: (chunk) => {
					if (chunk.name === "sw") return "sw.js";
					return "assets/[name]-[hash].js";
				},
				manualChunks: (id) => {
					if (id.includes("sw.ts")) return undefined;
					if (id.includes("react") || id.includes("react-dom")) return "react";
					return undefined;
				},
			},
		},
	},
	test: {
		environment: "happy-dom",
		globals: true,
		setupFiles: ["./src/test-setup.ts"],
		// snapshot-schema.test.ts requires a generated snapshot.json — runs separately via pnpm test:snapshot
		exclude: ["src/__tests__/snapshot-schema.test.ts", "**/node_modules/**"],
	},
});
