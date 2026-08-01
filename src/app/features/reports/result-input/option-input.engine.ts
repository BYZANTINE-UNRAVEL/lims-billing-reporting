import { configuredResultOptions, optionKey, ResultOption } from './result-option';

export class OptionInputEngine {
  accepts(item: any) {
    const type = String(item?.input_control_type || item?.input_type || '').trim().toUpperCase().replace(/[- ]+/g, '_');
    return ['OPTION','DROPDOWN','RADIO','CHECKBOX','SELECT','OPTION_SELECT','SEARCH_SELECT','SEARCHSELECT'].includes(type);
  }

  options(item: any) { return configuredResultOptions(item); }

  resolve(item: any, selected: any) {
    const key = optionKey(selected);
    return this.options(item).find(option => optionKey(option.label) === key || optionKey(option.value) === key) || null;
  }

  display(item: any) {
    const current = String(item?.result_value || item?._selected_result_label || '').trim();
    if (!current) return '';
    const match = this.resolve(item, current);
    return match?.label || match?.value || current;
  }

  isSelected(item: any, option: ResultOption) {
    const current = optionKey(item?.result_value || item?._selected_result_label);
    return !!current && (optionKey(option.value) === current || optionKey(option.label) === current);
  }

  commit(option: ResultOption) { return String(option?.label || option?.value || '').trim(); }
}
