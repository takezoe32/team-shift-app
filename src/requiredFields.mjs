// Required fields of an entry form: [label, filled] pairs -> the labels still missing, in form order.
export const missingRequired = pairs => pairs.filter(([, filled]) => !filled).map(([label]) => label);
// Box colours of a required input: yellow while empty, plain once filled (not red: the 重要 checkbox is red).
export const requiredBox = filled => filled ? 'border-gray-300 bg-white' : 'border-yellow-500 bg-yellow-100';
