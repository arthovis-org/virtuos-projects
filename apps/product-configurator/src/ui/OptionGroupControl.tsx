import type { OptionGroup } from '@/catalog/schema';
import { MaterialSwatches } from './controls/MaterialSwatches';
import { SegmentedControl } from './controls/SegmentedControl';
import { Switch } from './controls/Switch';
import { usePriceFormat } from './formatPrice';

interface OptionGroupControlProps {
  group: OptionGroup;
  selectedOptionId: string;
  onSelect: (optionId: string) => void;
  /** Leaves prices out (the virtual desks of unlimited desks mode). */
  hidePrices?: boolean;
}

/** Picks the right input for an option group's type. */
export function OptionGroupControl({
  group,
  selectedOptionId,
  onSelect,
  hidePrices = false,
}: OptionGroupControlProps) {
  const format = usePriceFormat();
  const hint = (delta: number) => (hidePrices ? '' : format.delta(delta));

  switch (group.type) {
    case 'material':
      return (
        <MaterialSwatches
          options={group.options}
          selectedId={selectedOptionId}
          onSelect={onSelect}
        />
      );
    case 'variant':
      return (
        <SegmentedControl
          items={group.options.map((option) => ({
            id: option.id,
            label: option.label,
            hint: hint(option.priceDelta),
          }))}
          selectedId={selectedOptionId}
          onSelect={onSelect}
        />
      );
    case 'toggle': {
      const on = group.options.find((option) => option.visible);
      const off = group.options.find((option) => !option.visible);
      // The schema guarantees one of each; guard so the compiler agrees.
      if (!on || !off) return null;
      return (
        <Switch
          label={group.label}
          checked={selectedOptionId === on.id}
          hint={hint(on.priceDelta - off.priceDelta)}
          onChange={(checked) => onSelect(checked ? on.id : off.id)}
        />
      );
    }
  }
}
