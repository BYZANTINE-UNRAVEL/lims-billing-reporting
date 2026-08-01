export type ResultOption = { value: string; label: string };

export function configuredResultOptions(item: any): ResultOption[] {
  const arraySource = Array.isArray(item?.options) ? item.options : null;
  if (arraySource?.length) return dedupe(arraySource.map(toOption));
  const raw = String(item?.result_options || item?.options_text || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return dedupe(parsed.map(toOption));
  } catch {}
  const parts = raw.includes('||') ? raw.split('||') : raw.split(/\r?\n|,/g);
  return dedupe(parts.map(part => {
    const text = String(part || '').trim();
    const pair = text.includes('::') ? text.split('::') : (text.includes('|') ? text.split('|') : [text, text]);
    return { value: String(pair[0] || '').trim(), label: String(pair.slice(1).join('::') || pair[0] || '').trim() };
  }));
}

function toOption(source: any): ResultOption {
  const value = String(source?.option_value ?? source?.value ?? source?.label ?? source?.name ?? source ?? '').trim();
  const label = String(source?.option_label ?? source?.label ?? source?.name ?? source?.value ?? source ?? '').trim();
  return { value: value || label, label: label || value };
}

function dedupe(options: ResultOption[]): ResultOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    if (!option.value && !option.label) return false;
    const key = `${option.value}\u0000${option.label}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function optionKey(value: any) { return String(value ?? '').trim().toLowerCase(); }
