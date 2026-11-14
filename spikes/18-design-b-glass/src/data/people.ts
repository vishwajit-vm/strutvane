/**
 * Mock people: the signed-in user and the team. Names and e-mail domains are fictional
 * (`.example` is reserved for documentation, so no real inbox can be hit).
 */
export type Role = 'Owner' | 'Admin' | 'Finance' | 'Sales' | 'Viewer'
export type MemberStatus = 'active' | 'invited' | 'suspended'

export interface Person {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: Role
  readonly title: string
  readonly status: MemberStatus
  /** Hours since last activity; drives "Active 2 h ago". */
  readonly lastActiveHours: number
  readonly twoFactor: boolean
}

export const TEAM: readonly Person[] = [
  { id: 'u1', name: 'Maya Okafor', email: 'maya@halcyon.example', role: 'Owner', title: 'Head of Finance', status: 'active', lastActiveHours: 0, twoFactor: true },
  { id: 'u2', name: 'Daniel Reyes', email: 'daniel@halcyon.example', role: 'Admin', title: 'Operations Manager', status: 'active', lastActiveHours: 1, twoFactor: true },
  { id: 'u3', name: 'Priya Natarajan', email: 'priya@halcyon.example', role: 'Finance', title: 'Senior Accountant', status: 'active', lastActiveHours: 3, twoFactor: true },
  { id: 'u4', name: 'Lukas Becker', email: 'lukas@halcyon.example', role: 'Sales', title: 'Account Executive', status: 'active', lastActiveHours: 5, twoFactor: false },
  { id: 'u5', name: 'Amara Nwosu', email: 'amara@halcyon.example', role: 'Sales', title: 'Customer Success Lead', status: 'active', lastActiveHours: 26, twoFactor: true },
  { id: 'u6', name: 'Hiro Tanaka', email: 'hiro@halcyon.example', role: 'Finance', title: 'Billing Specialist', status: 'active', lastActiveHours: 50, twoFactor: false },
  { id: 'u7', name: 'Sofia Marino', email: 'sofia@halcyon.example', role: 'Viewer', title: 'External Auditor', status: 'invited', lastActiveHours: 0, twoFactor: false },
  { id: 'u8', name: 'Omar Haddad', email: 'omar@halcyon.example', role: 'Admin', title: 'IT Administrator', status: 'active', lastActiveHours: 8, twoFactor: true },
  { id: 'u9', name: 'Grace Liu', email: 'grace@halcyon.example', role: 'Sales', title: 'Sales Development Rep', status: 'suspended', lastActiveHours: 720, twoFactor: false },
  { id: 'u10', name: 'Elena Petrova', email: 'elena@halcyon.example', role: 'Viewer', title: 'Board Observer', status: 'invited', lastActiveHours: 0, twoFactor: false },
]

/** The signed-in user in every screen of the mock. */
export const CURRENT_USER: Person = TEAM[0] ?? {
  id: 'u1',
  name: 'Maya Okafor',
  email: 'maya@halcyon.example',
  role: 'Owner',
  title: 'Head of Finance',
  status: 'active',
  lastActiveHours: 0,
  twoFactor: true,
}

/** The tenant (workspace) the user is signed in to. */
export const WORKSPACE = { name: 'Halcyon Supply Co.', plan: 'Business' } as const
