import { type Model, modelsAreEqual } from "@earendil-works/pi-ai";
import { type Component, isKeyRelease, matchesKey, type TUI } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";

interface UsedModelItem {
	model: Model<any>;
	thinkingLevel?: string;
}

/**
 * Modal shown while the model-cycle key (Ctrl+P) is held. Lists recently used
 * models, most recent first. Additional Ctrl+P presses (and Shift+Ctrl+P) move
 * the selection; releasing the keys picks the highlighted model. Nothing is
 * changed until then. Enter picks as a fallback for terminals without key
 * release events (Kitty keyboard protocol); Escape cancels.
 */
export class ModelCycleOverlay implements Component {
	readonly wantsKeyRelease = true;
	private selectedIndex: number;
	private closed = false;

	private readonly tui: TUI;
	private readonly models: UsedModelItem[];
	private readonly currentModel: Model<any> | undefined;
	private readonly onSelect: (model: Model<any>) => void;
	private readonly onCancel: () => void;

	constructor(
		tui: TUI,
		models: UsedModelItem[],
		currentModel: Model<any> | undefined,
		onSelect: (model: Model<any>) => void,
		onCancel: () => void,
	) {
		this.tui = tui;
		this.models = models;
		this.currentModel = currentModel;
		this.onSelect = onSelect;
		this.onCancel = onCancel;
		// Start on the next-most-recent model, matching what a single Ctrl+P cycle would pick.
		this.selectedIndex = models.length > 1 ? 1 : 0;
	}

	handleInput(data: string): void {
		if (this.closed) return;
		if (isKeyRelease(data)) {
			// Release of P (with or without Ctrl, depending on release order) confirms.
			if (matchesKey(data, "ctrl+p") || matchesKey(data, "p")) {
				this.confirm();
			}
			return;
		}
		if (matchesKey(data, "ctrl+p")) {
			if (this.models.length > 1) {
				this.selectedIndex = (this.selectedIndex + 1) % this.models.length;
				this.tui.requestRender();
			}
		} else if (matchesKey(data, "shift+ctrl+p")) {
			if (this.models.length > 1) {
				this.selectedIndex = (this.selectedIndex - 1 + this.models.length) % this.models.length;
				this.tui.requestRender();
			}
		} else if (matchesKey(data, "return")) {
			this.confirm();
		} else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.cancel();
		} else {
			this.cancel();
		}
	}

	private confirm(): void {
		this.closed = true;
		const selected = this.models[this.selectedIndex];
		if (selected) {
			this.onSelect(selected.model);
		} else {
			this.onCancel();
		}
	}

	private cancel(): void {
		this.closed = true;
		this.onCancel();
	}

	render(_width: number): string[] {
		if (this.models.length === 0) {
			return [theme.fg("muted", "No recently used models")];
		}
		const lines: string[] = [];
		for (let i = 0; i < this.models.length; i++) {
			const entry = this.models[i];
			const label = `${entry.model.provider}/${entry.model.id}`;
			const isCurrent = modelsAreEqual(this.currentModel, entry.model);
			const isSelected = i === this.selectedIndex;
			const cursor = isSelected ? theme.fg("accent", "→ ") : "  ";
			const text = isSelected ? theme.fg("accent", label) : theme.fg("dim", label);
			const badge = isCurrent ? theme.fg("muted", " · current") : "";
			lines.push(cursor + text + badge);
		}
		lines.push(theme.fg("muted", "release to switch · enter select · esc cancel"));
		return lines;
	}

	invalidate(): void {}
}
