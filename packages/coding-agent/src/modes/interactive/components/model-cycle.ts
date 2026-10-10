import { type Model, modelsAreEqual } from "@earendil-works/pi-ai";
import { type Component, isKeyRelease, matchesKey, type TUI } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";

/** Initial silence delay before auto-confirming; covers the keyboard's repeat initial delay. */
const INITIAL_CONFIRM_DELAY_MS = 650;
/** Silence delay after the last key event while repeating; covers the release detection gap. */
const REPEAT_CONFIRM_DELAY_MS = 250;

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
	private confirmTimer: ReturnType<typeof setTimeout> | undefined;

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
		// Terminals without the Kitty keyboard protocol never report key releases, so confirm
		// after a short silence instead. On Kitty terminals the release event wins the race:
		// repeats arrive every few dozen ms, so the silence timer only fires if releases
		// never come. The initial delay covers the repeat initial delay so a held key does
		// not confirm before the first repeat arrives.
		this.armConfirmTimer(INITIAL_CONFIRM_DELAY_MS);
	}

	private armConfirmTimer(delay: number): void {
		if (this.confirmTimer) clearTimeout(this.confirmTimer);
		this.confirmTimer = setTimeout(() => {
			this.confirmTimer = undefined;
			this.confirm();
		}, delay);
	}

	private clearConfirmTimer(): void {
		if (this.confirmTimer) {
			clearTimeout(this.confirmTimer);
			this.confirmTimer = undefined;
		}
	}

	handleInput(data: string): void {
		if (this.closed) return;
		if (isKeyRelease(data)) {
			// Release of P (with or without Ctrl, depending on release order) confirms.
			if (matchesKey(data, "ctrl+p") || matchesKey(data, "p")) {
				this.clearConfirmTimer();
				this.confirm();
			}
			return;
		}
		if (matchesKey(data, "ctrl+p")) {
			if (this.models.length > 1) {
				this.selectedIndex = (this.selectedIndex + 1) % this.models.length;
				this.tui.requestRender();
			}
			this.armConfirmTimer(REPEAT_CONFIRM_DELAY_MS);
		} else if (matchesKey(data, "shift+ctrl+p")) {
			if (this.models.length > 1) {
				this.selectedIndex = (this.selectedIndex - 1 + this.models.length) % this.models.length;
				this.tui.requestRender();
			}
			this.armConfirmTimer(REPEAT_CONFIRM_DELAY_MS);
		} else if (matchesKey(data, "return")) {
			this.clearConfirmTimer();
			this.confirm();
		} else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.clearConfirmTimer();
			this.cancel();
		} else {
			this.clearConfirmTimer();
			this.cancel();
		}
	}

	private confirm(): void {
		this.closed = true;
		this.clearConfirmTimer();
		const selected = this.models[this.selectedIndex];
		if (selected) {
			this.onSelect(selected.model);
		} else {
			this.onCancel();
		}
	}

	private cancel(): void {
		this.closed = true;
		this.clearConfirmTimer();
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
