import { configuredResultOptions } from './result-option';
import { OptionInputEngine } from './option-input.engine';
import { SearchSelectInputEngine } from './search-select-input.engine';

/** Short clinical lists (ABO, Rh, etc.) use chips instead of a floating panel. */
export const RESULT_CHIP_OPTION_THRESHOLD = 8;

const optionEngine = new OptionInputEngine();
const searchSelectEngine = new SearchSelectInputEngine();

export function configuredOptionCount(item: any): number {
  return configuredResultOptions(item).length;
}

export function isResultPickerItem(item: any): boolean {
  return optionEngine.accepts(item) || searchSelectEngine.accepts(item);
}

/** True when the item should render inline choice chips (1–8 configured options). */
export function useResultChips(item: any): boolean {
  if (!isResultPickerItem(item)) return false;
  const count = configuredOptionCount(item);
  return count >= 1 && count <= RESULT_CHIP_OPTION_THRESHOLD;
}

/** True when the item should use an overlay dropdown panel (>8 options). */
export function useResultOverlay(item: any): boolean {
  if (!isResultPickerItem(item)) return false;
  return configuredOptionCount(item) > RESULT_CHIP_OPTION_THRESHOLD;
}
