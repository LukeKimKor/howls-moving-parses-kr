import { DashboardPage } from "./components/pages/DashboardPage.js";
import type { Snapshot } from "./types/snapshot.js";

// Only App.tsx may import snapshot.json
import snapshotRaw from "./data/snapshot.json";

const snapshot = snapshotRaw as unknown as Snapshot;

// The removed character detail page remembered its last character here; clear the leftover once.
try {
	localStorage.removeItem("hmp.defaultCharacter");
} catch {}

/** Root application component. Imports snapshot.json and renders the tabbed dashboard. */
export default function App() {
	return <DashboardPage snapshot={snapshot} />;
}
