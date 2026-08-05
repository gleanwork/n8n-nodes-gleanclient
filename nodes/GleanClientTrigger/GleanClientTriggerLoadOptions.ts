import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	ResourceMapperField,
	ResourceMapperFields,
} from 'n8n-workflow';
import { gleanApiRequest } from './GleanClientTriggerHelpers';
import {
	MAX_PRESET_PAGES,
	PRESET_PAGE_SIZE,
	TIME_OFFSET_FIELD,
	TRIGGER_PRESETS_PATH,
	presetPath,
} from './constants';

interface Preset {
	preset_id: string;
	datasource?: string;
	display_name?: string;
	description?: string;
	inputs?: Array<{ field: string; label?: string; required?: boolean }>;
	time_offsets?: number[];
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

// resourceMapping method: the input fields for the selected preset. Required fields render
// expanded; optional ones are added via the field dropdown. A schedule offset (time_offset) is
// surfaced as an options field with humanized allowed values. Refreshes when the preset changes.
export async function getPresetInputFields(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const preset = await fetchPreset(this);
	if (!preset) return { fields: [] };
	const fields: ResourceMapperField[] = (preset.inputs ?? [])
		.filter((i) => i.field !== TIME_OFFSET_FIELD)
		// label may be an empty string; fall back to the field name.
		.map((i): ResourceMapperField => ({
			id: i.field,
			displayName: i.label || i.field,
			required: !!i.required,
			defaultMatch: false,
			display: true,
			type: 'string',
		}));
	const offsets = preset.time_offsets ?? [];
	if (offsets.length > 0) {
		fields.push({
			id: TIME_OFFSET_FIELD,
			displayName: 'Time Before Event',
			required: true,
			defaultMatch: false,
			display: true,
			type: 'options',
			options: offsets.map((seconds) => ({
				name: humanizeOffset(seconds),
				value: String(seconds),
			})),
		});
	}
	return { fields };
}

function humanizeOffset(seconds: number): string {
	const minutes = Math.round(seconds / 60);
	if (minutes % 60 === 0) {
		const hours = minutes / 60;
		return `${hours} hour${hours === 1 ? '' : 's'} before`;
	}
	return `${minutes} minutes before`;
}
