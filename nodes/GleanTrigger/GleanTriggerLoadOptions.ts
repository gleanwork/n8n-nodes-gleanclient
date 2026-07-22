import type {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeListSearchResult,
} from 'n8n-workflow';
import { gleanApiRequest } from './GleanTriggerHelpers';

interface Preset {
	preset_id: string;
	datasource?: string;
	display_name?: string;
	description?: string;
	inputs?: Array<{ field: string; label?: string; required?: boolean }>;
}

// Friendly datasource labels so the picker reads well and groups by source.
const DATASOURCE_LABELS: Record<string, string> = {
	jira: 'Jira',
	gmailnative: 'Gmail',
	outlook: 'Outlook',
	slack: 'Slack',
	salescloud: 'Salesforce',
	gong: 'Gong',
	confluence: 'Confluence',
	github: 'GitHub',
	gdrive: 'Google Drive',
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
	const response = await gleanApiRequest.call(this, 'GET', '/trigger-presets', {}, { page_size: 100 });
	const presets = (response.results as Preset[]) ?? [];
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

// GET /api/trigger-presets/{preset_id} -> the input fields this preset accepts.
export async function getPresetInputs(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const presetId = presetIdFrom(this.getCurrentNodeParameter('preset'));
	if (!presetId) return [];

	const response = await gleanApiRequest.call(this, 'GET', `/trigger-presets/${presetId}`);
	const preset = (response.preset as Preset) ?? (response as unknown as Preset);
	const inputs = preset.inputs ?? [];
	return inputs.map((i) => ({
		name: i.required ? `${i.label ?? i.field} (required)` : (i.label ?? i.field),
		value: i.field,
	}));
}
