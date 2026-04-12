const PEOPLE_READ_MASK = "names,emailAddresses,phoneNumbers,organizations,relations,externalIds,photos,birthdays,addresses,biographies";

// Run this function manually in GAS editor to authorize People API
function authorizePeopleAPI(): void {
  const resp = People.People!.searchDirectoryPeople({ readMask: "names", sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"], pageSize: 1 });
  Logger.log("Authorized. Found " + (resp.people?.length || 0) + " people");
}

function listContacts(max?: number): { resourceName: string; name: string; email: string; organization: string }[] {
  const limit = max || 20;
  const resp = People.People!.Connections!.list("people/me", {
    pageSize: limit,
    personFields: "names,emailAddresses,organizations",
  });
  return (resp.connections || []).map(formatContactSummary);
}

function listDirectoryPeople(query?: string, max?: number): { resourceName: string; name: string; email: string; organization: string }[] {
  const limit = max || 20;
  const resp = People.People!.searchDirectoryPeople({
    pageSize: limit,
    readMask: "names,emailAddresses,organizations",
    sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"],
    query: query || "",
  });
  return (resp.people || []).map(formatContactSummary);
}

function getContact(resourceName: string): Record<string, unknown> {
  const person = People.People!.get(resourceName, { personFields: PEOPLE_READ_MASK });
  return formatContactDetail(person);
}

function formatContactSummary(p: GoogleAppsScript.People.Schema.Person): { resourceName: string; name: string; email: string; organization: string } {
  return {
    resourceName: p.resourceName || "",
    name: p.names?.[0]?.displayName || "",
    email: p.emailAddresses?.[0]?.value || "",
    organization: p.organizations?.[0]?.name || p.organizations?.[0]?.department || "",
  };
}

function formatContactDetail(p: GoogleAppsScript.People.Schema.Person): Record<string, unknown> {
  const raw = p as Record<string, unknown>;
  const externalIds = raw.externalIds as { value?: string; type?: string }[] | undefined;
  return {
    resourceName: p.resourceName,
    name: p.names?.[0]?.displayName,
    emails: p.emailAddresses?.map(e => ({ value: e.value, type: e.type })),
    phones: p.phoneNumbers?.map(ph => ({ value: ph.value, type: ph.type })),
    organizations: p.organizations?.map(o => ({ name: o.name, department: o.department, title: o.title })),
    relations: p.relations?.map(r => ({ person: r.person, type: r.type })),
    externalIds: externalIds?.map(e => ({ value: e.value, type: e.type })),
    photo: p.photos?.[0]?.url,
    birthday: p.birthdays?.[0]?.date,
    addresses: p.addresses?.map(a => ({ formatted: a.formattedValue, type: a.type })),
    bio: p.biographies?.[0]?.value,
  };
}
