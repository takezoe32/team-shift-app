// Required fields of an entry form: [label, filled] pairs -> the labels still missing, in form order.
export const missingRequired = pairs => pairs.filter(([, filled]) => !filled).map(([label]) => label);
// Box colours of a required input: red-tinted while empty, plain once filled.
export const requiredBox = filled => filled ? 'border-gray-300 bg-white' : 'border-red-400 bg-red-50';
