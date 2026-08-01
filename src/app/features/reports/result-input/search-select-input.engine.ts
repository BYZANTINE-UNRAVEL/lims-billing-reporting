import { configuredResultOptions, optionKey, ResultOption } from './result-option';

export type SearchMatchPart = { text: string; match: boolean };

export class SearchSelectInputEngine {
  accepts(item: any) {
    const type = String(item?.input_control_type || item?.input_type || '').trim().toUpperCase().replace(/[- ]+/g, '_');
    return type === 'SEARCH_SELECT' || type === 'SEARCHSELECT';
  }

  options(item: any) { return configuredResultOptions(item); }

  display(item: any) {
    const current = String(item?._selected_result_label || item?.result_value || '').trim();
    if (!current) return '';
    const match = this.options(item).find(option => optionKey(option.value) === optionKey(current) || optionKey(option.label) === optionKey(current));
    return match?.label || match?.value || current;
  }

  isSelected(item: any, option: ResultOption) {
    const current = optionKey(item?._selected_result_label || item?.result_value);
    return !!current && (optionKey(option.value) === current || optionKey(option.label) === current);
  }

  filter(item: any, query: string) {
    const normalized = optionKey(query);
    const options = this.options(item);
    const exactConfiguredValue = options.some(option =>
      optionKey(option.label) === normalized || optionKey(option.value) === normalized
    );
    if (!normalized || exactConfiguredValue) return options;
    return options.filter(option => optionKey(option.label).includes(normalized) || optionKey(option.value).includes(normalized));
  }

  parts(item: any, option: ResultOption, query: string): SearchMatchPart[] {
    const label = String(option?.label || option?.value || '');
    const raw = String(query || '').trim();
    const normalized = optionKey(raw);
    if (!label || !normalized || normalized === optionKey(this.display(item))) return [{ text: label, match: false }];
    const index = label.toLowerCase().indexOf(normalized);
    if (index < 0) return [{ text: label, match: false }];
    return [
      ...(index ? [{ text: label.slice(0, index), match: false }] : []),
      { text: label.slice(index, index + raw.length), match: true },
      ...(index + raw.length < label.length ? [{ text: label.slice(index + raw.length), match: false }] : [])
    ];
  }

  commit(option: ResultOption) { return String(option?.label || option?.value || '').trim(); }
}
