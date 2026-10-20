export type PlotKind =
  | 'leafy'
  | 'tomato'
  | 'loofah'
  | 'scallion'
  | 'root'
  | 'cabbage'
  | 'herb'
  | 'pepper'
  | 'legume'
  | 'corn'
  | 'strawberry'
  | 'mushroom'
  | 'flower'
  | 'tuber';

export const cropKindOptions: Array<{
  value: PlotKind;
  label: string;
  icon: string;
}> = [
  { value: 'leafy', label: '叶菜类', icon: '🥬' },
  { value: 'tomato', label: '茄果类', icon: '🍅' },
  { value: 'loofah', label: '藤蔓瓜类', icon: '🥒' },
  { value: 'scallion', label: '葱蒜类', icon: '🌱' },
  { value: 'root', label: '根菜类', icon: '🥕' },
  { value: 'cabbage', label: '甘蓝类', icon: '🥦' },
  { value: 'herb', label: '香草类', icon: '🌿' },
  { value: 'pepper', label: '辣椒类', icon: '🌶️' },
  { value: 'legume', label: '豆荚类', icon: '🫛' },
  { value: 'corn', label: '禾本科', icon: '🌽' },
  { value: 'strawberry', label: '浆果类', icon: '🍓' },
  { value: 'mushroom', label: '菌菇类', icon: '🍄' },
  { value: 'flower', label: '花菜类', icon: '🌼' },
  { value: 'tuber', label: '块茎类', icon: '🥔' },
];

export const cropIcons = cropKindOptions.reduce<Record<PlotKind, string>>(
  (icons, option) => {
    icons[option.value] = option.icon;
    return icons;
  },
  {} as Record<PlotKind, string>,
);

export function cropIconForKind(kind: string | null | undefined) {
  return cropIcons[kind as PlotKind] || '🌱';
}
