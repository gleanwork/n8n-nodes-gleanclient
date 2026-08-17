import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { gleanApiRequest, is400 } from './apiClient';
import {
	MAX_PRESET_PAGES,
	PRESET_PAGE_SIZE,
	TRIGGER_PRESETS_PATH,
	presetInputValuesPath,
	presetPath,
} from './constants';
import type { InputValue, Preset } from './types';

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
	salescloud: 'Salesforce',
	servicecloud: 'Service Cloud',
	slack: 'Slack',
	zendesk: 'Zendesk',
	zoom: 'Zoom',
};

// Preset id from a resourceLocator value (or a plain string).
function presetIdFrom(param: unknown): string {
	if (param && typeof param === 'object') {
		return String((param as { value?: string }).value ?? '');
	}
	return String(param ?? '');
}

// listSearch for the "Trigger" resource locator: GET /api/trigger-presets, rendered
// "Datasource — Label" and filtered by search text.
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

function toValueOptions(values: InputValue[]): INodePropertyOptions[] {
	return values.map((v) => ({
		name: v.display_name || v.value,
		value: v.value,
	}));
}

// Field dropdown for the inputs collection: every input the preset accepts, required ones labeled
// "(required)" and listed first. Each value is picked through the searchable value locator.
export async function getPresetInputFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const preset = await fetchPreset(this);
	return [...(preset?.inputs ?? [])]
		.sort((a, b) => Number(b.is_required) - Number(a.is_required))
		.map((i) => ({
			name: i.is_required ? `${i.display_name || i.field} (required)` : i.display_name || i.field,
			value: i.field,
		}));
}

// listSearch for an input's value: GET /trigger-presets/{id}/input-values, re-queried on every
// keystroke. This is the only n8n hook that receives the typed filter, so it is what lets a caller
// reach past the bounded set the preset embeds (is_truncated). `query` prefix-matches on the value.
export async function searchInputValues(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const presetId = presetIdFrom(this.getCurrentNodeParameter('preset'));
	const field = String(this.getCurrentNodeParameter('&field') ?? '');
	if (!presetId || !field) return { results: [] };
	const qs: Record<string, string> = { field };
	if (filter) qs.query = filter;
	try {
		const response = await gleanApiRequest.call(
			this,
			'GET',
			presetInputValuesPath(presetId),
			{},
			qs,
		);
		return { results: toValueOptions((response.results as InputValue[]) ?? []) };
	} catch (error) {
		// /input-values serves only picklist inputs; a free-text (or unknown) field returns 400.
		// Offer the typed text itself so "From List" still captures a free-text value without
		// forcing a switch to "By Value". Surface anything else (auth, transient, 5xx).
		if (is400(error)) {
			const typed = filter?.trim();
			return { results: typed ? [{ name: typed, value: typed }] : [] };
		}
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}
