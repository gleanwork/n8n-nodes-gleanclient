export interface InputValue {
	value: string;
	display_name: string;
}

export interface PresetInput {
	field: string;
	type: string;
	display_name: string;
	is_required: boolean;
	// Absent for free-text inputs; bounded when present, so values are picked via search.
	values?: InputValue[];
	is_truncated?: boolean;
}

export interface Preset {
	preset_id: string;
	datasource?: string;
	display_name?: string;
	description?: string;
	inputs?: PresetInput[];
}
