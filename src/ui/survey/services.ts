import { SERVICE_LABEL, type ServiceKind } from '../../engine';

export const SERVICE_KINDS: ServiceKind[] = ['water_cold', 'water_hot', 'drain', 'electrical', 'gas', 'ventilation', 'data'];

/** A service's name for display; the engine's English labels are lower case for use mid-sentence. */
export function serviceName(kind: ServiceKind, he: boolean): string {
  const label = SERVICE_LABEL[kind];
  return he ? label.he : label.en.charAt(0).toUpperCase() + label.en.slice(1);
}
