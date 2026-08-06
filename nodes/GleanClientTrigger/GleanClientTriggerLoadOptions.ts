import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	ResourceMapperField,
	ResourceMapperFields,
} from 'n8n-workflow';
import { gleanApiRequest } from './GleanClientTriggerHelpers';
import {
	MAX_PRESET_PAGES,
	PRESET_PAGE_SIZE,
	TRIGGER_PRESETS_PATH,
	presetInputValuesPath,
	presetPath,
} from './constants';

interface InputValue {
	value: string;
	display_name: string;
}

interface PresetInput {
	field: string;
	type: string;
	display_name: string;
	is_required: boolean;
	// Absent for free-text inputs. Bounded: is_truncated means more values exist than are listed.
	values?: InputValue[];
	is_truncated?: boolean;
}

interface Preset {
	preset_id: string;
	datasource?: string;
	display_name?: string;
	description?: string;
	inputs?: PresetInput[];
}

// TODO: these datasource labels should come from the backend, not be hardcoded here.
// Friendly datasource labels so the picker reads well and groups by source.
const DATASOURCE_LABELS: Record<string, string> = {
	artifacts: 'Artifacts',
	confluence: 'Confluence',
	gdrive: 'Google Drive',
	github: 'GitHub',
	gmailnative: 'Gmail',
	gong: 'Gong',
	googlecalendar: 'Google Calendar',
	greenhouse: 'Greenhouse',
	intercom: 'Intercom',
	jira: 'Jira',
	o365onedrive: 'OneDrive',
	o365sharepoint: 'SharePoint',
	outlook: 'Outlook',
	outlookcalendar: 'Outlook Calendar',
	salescloud: 'Sales Cloud',
	servicecloud: 'Service Cloud',
	slack: 'Slack',
	zendesk: 'Zendesk',
	zoom: 'Zoom',
};

// Extract the preset id from a resourceLocator value (or a plain string).
function presetIdFrom(param: unknown): string {
	if (param && typeof param === 'object') {
		return String((param as { value?: string }).value ?? '');
	}
	return String(param ?? '');
}

// listSearch for the "Trigger" resource locator: GET /api/trigger-presets,
// rendered "Datasource — Label" (datasource + trigger combined) and filtered by search text.
export async function searchPresets(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	// Page through all presets (cap iterations as a safety net).
	const presets: Preset[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < MAX_PRESET_PAGES; page++) {
		const qs: Record<string, string | number> = { page_size: PRESET_PAGE_SIZE };
		if (cursor) qs.cursor = cursor;
		const response = await gleanApiRequest.call(this, 'GET', TRIGGER_PRESETS_PATH, {}, qs);
		presets.push(...((response.results as Preset[]) ?? []));
		if (!response.has_more || !response.next_cursor) break;
		cursor = response.next_cursor as string;
	}
	let results = presets.map((p) => {
		const ds = DATASOURCE_LABELS[p.datasource ?? ''] ?? p.datasource ?? 'Other';
		return { name: `${ds} — ${p.display_name ?? p.preset_id}`, value: p.preset_id };
	});
	if (filter) {
		const f = filter.toLowerCase();
		results = results.filter(
			(r) => r.name.toLowerCase().includes(f) || r.value.toLowerCase().includes(f),
		);
	}
	results.sort((a, b) => a.name.localeCompare(b.name));
	return { results };
}

// GET /trigger-presets/{preset_id} -> the preset (inputs may be null).
async function fetchPreset(ctx: ILoadOptionsFunctions): Promise<Preset | null> {
	const presetId = presetIdFrom(ctx.getCurrentNodeParameter('preset'));
	if (!presetId) return null;
	const response = await gleanApiRequest.call(ctx, 'GET', presetPath(presetId));
	// TriggerPresetGetResponse: { trigger_preset: {...}, request_id }.
	return (response.trigger_preset as Preset) ?? (response as unknown as Preset);
}

// The API sends the bare label, so compose "Name (value)" here to keep same-named choices
// (two people called Jane Doe) distinguishable by their unique value.
function valueLabel(v: InputValue): string {
	return v.display_name && v.display_name !== v.value
		? `${v.display_name} (${v.value})`
		: v.value;
}

function toValueOptions(values: InputValue[]): INodePropertyOptions[] {
	return values.map((v) => ({ name: valueLabel(v), value: v.value }));
}

// Build a resourceMapper field from a preset input; inputs with values render as a dropdown.
function toMapperField(input: PresetInput): ResourceMapperField {
	// display_name may be an empty string; fall back to the field name.
	const field: ResourceMapperField = {
		id: input.field,
		displayName: input.display_name || input.field,
		required: input.is_required,
		defaultMatch: false,
		display: true,
		type: 'string',
	};
	const values = input.values ?? [];
	if (values.length > 0) {
		field.type = 'options';
		field.options = toValueOptions(values);
	}
	return field;
}

// A truncated value set can't be a resourceMapper dropdown: ResourceMapperField only carries a
// static options array, so the values past the bounded set would be unreachable. Those inputs move
// to the searchable collection instead.
function isMappable(input: PresetInput): boolean {
	return !input.is_truncated;
}

// resourceMapping method for "Required Inputs": the preset's required inputs, rendered expanded.
// The schedule offset (time_offset) is just another required picklist input. Refreshes on preset change.
export async function getRequiredPresetInputs(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const preset = await fetchPreset(this);
	if (!preset) return { fields: [] };
	return {
		fields: (preset.inputs ?? [])
			.filter((i) => i.is_required && isMappable(i))
			.map(toMapperField),
	};
}

// loadOptions for the "Optional Inputs" field dropdown: the preset's optional input field names.
export async function getOptionalInputFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const preset = await fetchPreset(this);
	if (!preset) return [];
	return (preset.inputs ?? [])
		.filter((i) => !i.is_required || !isMappable(i))
		.map((i) => ({
			name: (i.display_name || i.field) + (i.is_required ? ' (required)' : ''),
			value: i.field,
		}));
}

// listSearch for an optional input's value: GET /trigger-presets/{id}/input-values, re-queried on
// every keystroke. This is the only n8n hook that receives the typed filter, so it is what lets a
// caller reach past the bounded set the preset embeds (is_truncated).
export async function searchInputValues(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const presetId = presetIdFrom(this.getCurrentNodeParameter('preset'));
	const field = String(this.getCurrentNodeParameter('&field') ?? '');
	if (!presetId || !field) return { results: [] };
	const qs: Record<string, string> = { field };
	if (filter) qs.query = filter;
	const response = await gleanApiRequest.call(
		this,
		'GET',
		presetInputValuesPath(presetId),
		{},
		qs,
	);
	return { results: toValueOptions((response.results as InputValue[]) ?? []) };
}
