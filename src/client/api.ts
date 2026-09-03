import { PersonItem, SearchResponseItem, ImportResponseItem } from './types.js';

export async function fetchPeople(): Promise<PersonItem[]> {
  const res = await fetch('/api/people');
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Failed to fetch people: ${res.status}`);
  }
  const data = await res.json();
  return data.people || [];
}

export async function fetchSkills(): Promise<string[]> {
  const res = await fetch('/api/skills');
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Failed to fetch skills: ${res.status}`);
  }
  const data = await res.json();
  return data.skills || [];
}

export async function searchNetwork(personId: string, skill: string): Promise<SearchResponseItem> {
  const params = new URLSearchParams({
    personId: personId.trim(),
    skill: skill.trim(),
  });
  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Search failed: ${res.status}`);
  }
  return await res.json();
}

export async function triggerImport(useDefaultSeed = true): Promise<ImportResponseItem> {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ useDefaultSeed }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Import failed: ${res.status}`);
  }
  return await res.json();
}
