/**
 * The workspace's team and customers. All names and companies are fictional; e-mail domains use
 * the reserved `.example` TLD so no real organisation is ever addressed.
 */

/** 1–5: which desaturated avatar tint token (`--avatar-N`) a person or company uses. */
export type Tint = 1 | 2 | 3 | 4 | 5

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export interface Member {
  id: string
  name: string
  email: string
  title: string
  role: Role
  tint: Tint
  /** ISO timestamp, or `null` for an invitation that was never accepted. */
  lastActiveAt: string | null
  status: 'active' | 'invited'
}

export const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' }

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access, including billing and deleting the workspace.',
  admin: 'Manage members, settings and every record.',
  member: 'Create and edit records they can see.',
  viewer: 'Read-only access to records and reports.',
}

export const members: readonly [Member, ...Member[]] = [
  { id: 'u1', name: 'Maya Okafor', email: 'maya@northwind.example', title: 'Head of Finance', role: 'owner', tint: 1, lastActiveAt: '2026-11-14T09:28:00Z', status: 'active' },
  { id: 'u2', name: 'Daniel Reyes', email: 'daniel@northwind.example', title: 'Billing Lead', role: 'admin', tint: 2, lastActiveAt: '2026-11-14T08:51:00Z', status: 'active' },
  { id: 'u3', name: 'Priya Raman', email: 'priya@northwind.example', title: 'Account Manager', role: 'member', tint: 3, lastActiveAt: '2026-11-14T07:12:00Z', status: 'active' },
  { id: 'u4', name: 'Tomás Lindqvist', email: 'tomas@northwind.example', title: 'Controller', role: 'admin', tint: 4, lastActiveAt: '2026-11-13T16:40:00Z', status: 'active' },
  { id: 'u5', name: 'Aiko Tanaka', email: 'aiko@northwind.example', title: 'Revenue Analyst', role: 'member', tint: 5, lastActiveAt: '2026-11-13T11:05:00Z', status: 'active' },
  { id: 'u6', name: 'Jonas Weber', email: 'jonas@northwind.example', title: 'Account Executive', role: 'member', tint: 2, lastActiveAt: '2026-11-11T14:22:00Z', status: 'active' },
  { id: 'u7', name: 'Fatima Haddad', email: 'fatima@northwind.example', title: 'Auditor (external)', role: 'viewer', tint: 3, lastActiveAt: '2026-11-04T10:00:00Z', status: 'active' },
  { id: 'u8', name: 'Lucas Moreau', email: 'lucas@northwind.example', title: 'Customer Success', role: 'member', tint: 4, lastActiveAt: null, status: 'invited' },
]

/** The signed-in user in this mockup. */
export const me: Member = members[0]

export interface Customer {
  id: string
  name: string
  contact: string
  email: string
  country: string
  tint: Tint
}

export const customers: readonly [Customer, ...Customer[]] = [
  { id: 'c01', name: 'Halcyon Freight', contact: 'Ines Marquez', email: 'ap@halcyonfreight.example', country: 'Spain', tint: 1 },
  { id: 'c02', name: 'Orbitline Health', contact: 'Sam Whitaker', email: 'finance@orbitline.example', country: 'United Kingdom', tint: 2 },
  { id: 'c03', name: 'Kestrel Analytics', contact: 'Noor Aziz', email: 'billing@kestrel.example', country: 'Netherlands', tint: 3 },
  { id: 'c04', name: 'Bramble & Co.', contact: 'Hugo Laurent', email: 'accounts@bramble.example', country: 'France', tint: 4 },
  { id: 'c05', name: 'Northbeam Energy', contact: 'Elin Berg', email: 'ap@northbeam.example', country: 'Sweden', tint: 5 },
  { id: 'c06', name: 'Lumen Robotics', contact: 'Ravi Menon', email: 'payables@lumen.example', country: 'Germany', tint: 1 },
  { id: 'c07', name: 'Quarry Labs', contact: 'Claire Dubois', email: 'finance@quarrylabs.example', country: 'Belgium', tint: 2 },
  { id: 'c08', name: 'Tidewater Logistics', contact: 'Marco Bianchi', email: 'ap@tidewater.example', country: 'Italy', tint: 3 },
  { id: 'c09', name: 'Fernhill Studio', contact: 'Ada Nwosu', email: 'hello@fernhill.example', country: 'Ireland', tint: 4 },
  { id: 'c10', name: 'Cobalt Ridge Bank', contact: 'Peter Novak', email: 'vendors@cobaltridge.example', country: 'Austria', tint: 5 },
  { id: 'c11', name: 'Meridian Foods', contact: 'Lea Hoffmann', email: 'ap@meridianfoods.example', country: 'Germany', tint: 1 },
  { id: 'c12', name: 'Atlas Ceramics', contact: 'João Pereira', email: 'contas@atlasceramics.example', country: 'Portugal', tint: 2 },
  { id: 'c13', name: 'Juniper Health', contact: 'Olivia Grant', email: 'billing@juniperhealth.example', country: 'United States', tint: 3 },
  { id: 'c14', name: 'Solace Insurance', contact: 'Karim Saleh', email: 'ap@solace.example', country: 'United Kingdom', tint: 4 },
  { id: 'c15', name: 'Pinecrest Schools', contact: 'Mia Johansson', email: 'finance@pinecrest.example', country: 'Norway', tint: 5 },
  { id: 'c16', name: 'Vantage Aero', contact: 'Luca Ferri', email: 'payables@vantageaero.example', country: 'Italy', tint: 1 },
  { id: 'c17', name: 'Willow Legal', contact: 'Hannah Cole', email: 'accounts@willowlegal.example', country: 'United Kingdom', tint: 2 },
  { id: 'c18', name: 'Ember Coffee Roasters', contact: 'Tobias Krämer', email: 'office@embercoffee.example', country: 'Germany', tint: 3 },
  { id: 'c19', name: 'Granite Works', contact: 'Sofia Rossi', email: 'ap@graniteworks.example', country: 'Italy', tint: 4 },
  { id: 'c20', name: 'Saffron Hotels', contact: 'Arjun Kapoor', email: 'finance@saffronhotels.example', country: 'United Arab Emirates', tint: 5 },
  { id: 'c21', name: 'Polar Systems', contact: 'Eva Lindahl', email: 'billing@polarsystems.example', country: 'Finland', tint: 1 },
  { id: 'c22', name: 'Helix Bio', contact: 'Daniel Kim', email: 'ap@helixbio.example', country: 'United States', tint: 2 },
  { id: 'c23', name: 'Redwood Mobility', contact: 'Chloé Martin', email: 'finance@redwood.example', country: 'France', tint: 3 },
  { id: 'c24', name: 'Sable Security', contact: 'Nils Andersen', email: 'ap@sablesecurity.example', country: 'Denmark', tint: 4 },
]

/** Look a customer up by id; falls back to the first one so callers never deal with `undefined`. */
export function customerById(id: string): Customer {
  return customers.find((customer) => customer.id === id) ?? customers[0]
}

/** Look a member up by id; falls back to the signed-in user. */
export function memberById(id: string): Member {
  return members.find((member) => member.id === id) ?? me
}

/**
 * Simulated server search for the async relation select: filters by name or contact and waits
 * a little, so the loading state is real. Honours an `AbortSignal` so typing fast never shows
 * stale results.
 */
export async function searchCustomers(term: string, signal?: AbortSignal): Promise<Customer[]> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 280)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Search cancelled', 'AbortError'))
    })
  })
  const needle = term.trim().toLowerCase()
  return customers.filter((customer) => needle === '' || `${customer.name} ${customer.contact}`.toLowerCase().includes(needle)).slice(0, 8)
}
