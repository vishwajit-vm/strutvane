/**
 * Mock people: the signed-in user, the team, and customer companies. Names are invented and
 * deliberately varied (lengths, origins) so layouts are tested against realistic text, not
 * "John Doe" placeholders.
 *
 * @module
 */

/** Avatar / chip colour families; each maps to a `*-soft` surface with AA text on it. */
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

/** Roles a team member can hold (mirrors the RBAC presets the auth package will ship). */
export type Role = 'Owner' | 'Admin' | 'Billing' | 'Editor' | 'Viewer'

/** A person on the team. */
export interface Member {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly title: string
  readonly role: Role
  readonly tone: Tone
  readonly status: 'active' | 'invited' | 'suspended'
  /** Minutes since the member was last active (null: never signed in). */
  readonly lastActiveMinutes: number | null
  readonly twoFactor: boolean
}

/** A customer company that invoices are issued to. */
export interface Customer {
  readonly id: string
  readonly name: string
  readonly contact: string
  readonly email: string
  readonly country: string
  readonly tone: Tone
}

/** The signed-in user (shown in the top bar, profile and settings). */
export const currentUser = {
  id: 'usr_01',
  name: 'Amara Lindqvist',
  firstName: 'Amara',
  email: 'amara@halyard.io',
  title: 'Head of Finance Operations',
  company: 'Halyard Systems',
  location: 'Copenhagen, Denmark',
  timezone: 'Europe/Copenhagen (UTC+01:00)',
  phone: '+45 31 22 48 90',
  joined: 'March 2024',
  tone: 'primary' as Tone,
  bio: 'Runs billing, collections and revenue reporting for Halyard. Previously led finance systems at a logistics scale-up. Likes clean ledgers and fast month-end closes.',
} as const

export const team: readonly Member[] = [
  { id: 'usr_01', name: 'Amara Lindqvist', email: 'amara@halyard.io', title: 'Head of Finance Operations', role: 'Owner', tone: 'primary', status: 'active', lastActiveMinutes: 0, twoFactor: true },
  { id: 'usr_02', name: 'Diego Ramírez', email: 'diego@halyard.io', title: 'Billing Specialist', role: 'Billing', tone: 'info', status: 'active', lastActiveMinutes: 12, twoFactor: true },
  { id: 'usr_03', name: 'Priya Natarajan', email: 'priya@halyard.io', title: 'Engineering Manager', role: 'Admin', tone: 'success', status: 'active', lastActiveMinutes: 45, twoFactor: true },
  { id: 'usr_04', name: 'Tomasz Wiśniewski', email: 'tomasz@halyard.io', title: 'Account Executive', role: 'Editor', tone: 'warning', status: 'active', lastActiveMinutes: 180, twoFactor: false },
  { id: 'usr_05', name: 'Yuki Tanabe', email: 'yuki@halyard.io', title: 'Customer Success Lead', role: 'Editor', tone: 'danger', status: 'active', lastActiveMinutes: 1_440, twoFactor: true },
  { id: 'usr_06', name: 'Kwame Mensah', email: 'kwame@halyard.io', title: 'Financial Analyst', role: 'Viewer', tone: 'info', status: 'active', lastActiveMinutes: 2_880, twoFactor: false },
  { id: 'usr_07', name: 'Sofia Bianchi', email: 'sofia@halyard.io', title: 'Controller', role: 'Admin', tone: 'success', status: 'active', lastActiveMinutes: 300, twoFactor: true },
  { id: 'usr_08', name: 'Liam O’Connell', email: 'liam@halyard.io', title: 'Sales Operations', role: 'Editor', tone: 'primary', status: 'invited', lastActiveMinutes: null, twoFactor: false },
  { id: 'usr_09', name: 'Hana Al-Sayed', email: 'hana@halyard.io', title: 'Auditor (external)', role: 'Viewer', tone: 'warning', status: 'invited', lastActiveMinutes: null, twoFactor: false },
  { id: 'usr_10', name: 'Mateus Costa', email: 'mateus@halyard.io', title: 'Support Engineer', role: 'Viewer', tone: 'neutral', status: 'suspended', lastActiveMinutes: 43_200, twoFactor: false },
]

export const customers: readonly [Customer, ...Customer[]] = [
  { id: 'cus_01', name: 'Lumen Freight', contact: 'Maya Okafor', email: 'billing@lumenfreight.com', country: 'Nigeria', tone: 'primary' },
  { id: 'cus_02', name: 'Aster & Co', contact: 'Henrik Sørensen', email: 'accounts@asterco.dk', country: 'Denmark', tone: 'success' },
  { id: 'cus_03', name: 'Brightwell Health', contact: 'Rachel Kim', email: 'ap@brightwell.health', country: 'United States', tone: 'info' },
  { id: 'cus_04', name: 'Cobalt Ridge Mining', contact: 'Arjun Mehta', email: 'finance@cobaltridge.com', country: 'Australia', tone: 'warning' },
  { id: 'cus_05', name: 'Fernhill Studio', contact: 'Chloé Martin', email: 'hello@fernhill.studio', country: 'France', tone: 'danger' },
  { id: 'cus_06', name: 'Halcyon Credit Union', contact: 'Owen Price', email: 'payables@halcyon.coop', country: 'United Kingdom', tone: 'primary' },
  { id: 'cus_07', name: 'Juniper Robotics', contact: 'Lena Vogel', email: 'billing@juniper-robotics.de', country: 'Germany', tone: 'info' },
  { id: 'cus_08', name: 'Kestrel Logistics', contact: 'Samuel Adeyemi', email: 'ap@kestrel.co', country: 'Kenya', tone: 'success' },
  { id: 'cus_09', name: 'Marlow Foods', contact: 'Isabella Rossi', email: 'accounts@marlowfoods.it', country: 'Italy', tone: 'warning' },
  { id: 'cus_10', name: 'Nimbus Analytics', contact: 'Ethan Brooks', email: 'finance@nimbus.ai', country: 'Canada', tone: 'primary' },
  { id: 'cus_11', name: 'Orchard Retail Group', contact: 'Mei Lin', email: 'ap@orchardretail.sg', country: 'Singapore', tone: 'danger' },
  { id: 'cus_12', name: 'Pinecrest Legal LLP', contact: 'Victoria Hale', email: 'billing@pinecrest.law', country: 'United States', tone: 'neutral' },
  { id: 'cus_13', name: 'Quarry Point Construction', contact: 'Mateo Fernández', email: 'pagos@quarrypoint.es', country: 'Spain', tone: 'warning' },
  { id: 'cus_14', name: 'Redwood Dental', contact: 'Grace Thompson', email: 'office@redwooddental.com', country: 'United States', tone: 'success' },
  { id: 'cus_15', name: 'Saltmarsh Media', contact: 'Noah Fischer', email: 'finance@saltmarsh.media', country: 'Netherlands', tone: 'info' },
  { id: 'cus_16', name: 'Tidewater Energy', contact: 'Aisha Rahman', email: 'ap@tidewater.energy', country: 'United Arab Emirates', tone: 'primary' },
  { id: 'cus_17', name: 'Umber Architects', contact: 'Felix Andersson', email: 'studio@umber.se', country: 'Sweden', tone: 'danger' },
  { id: 'cus_18', name: 'Vantage Mobility', contact: 'Carmen Ortiz', email: 'billing@vantagemobility.mx', country: 'Mexico', tone: 'success' },
]

/**
 * Search customers like an async relation field would: a short delay, case-insensitive match on
 * name, contact or email, capped like a real API page.
 *
 * @example
 * const results = await searchCustomers('lum') // [Lumen Freight]
 */
export async function searchCustomers(term: string, delayMs = 350): Promise<readonly Customer[]> {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  const needle = term.trim().toLowerCase()
  const matches = customers.filter((customer) => [customer.name, customer.contact, customer.email].some((text) => text.toLowerCase().includes(needle)))
  return matches.slice(0, 8)
}
