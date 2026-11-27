// The bare Select control, without the field parts (`label`, `description`,
// `errorMessage`, `invalid`) of the public `@salmonui/dropdowns/select`
// wrapper. For @salmonui packages that label their selects themselves (the
// Scheduler editors), so their bundles do not carry the field parts. Never
// pass the field props here: the control does not read them.
export { Select } from '../select/Select.js';
