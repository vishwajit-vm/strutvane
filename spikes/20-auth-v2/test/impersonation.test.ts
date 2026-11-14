import { describe, expect, it } from 'vitest'
import { APP_KEY, harness, PASSWORD, rejectsWith, STORES } from './helpers/harness.ts'

const config = { features: { impersonation: true, tokens: true, twoFactor: true } }

async function setup(store: (typeof STORES)[number]) {
  const h = harness({ store, config })
  const admin = await h.user('root@acme.test', { roles: ['admin'] })
  const otherAdmin = await h.user('second@acme.test', { roles: ['admin'] })
  const member = await h.user('vic@acme.test', { roles: ['member'] })
  const browser = await h.signedIn(admin.email)
  return { h, admin, otherAdmin, member, browser }
}

describe.each(STORES)('impersonation (%s store)', (store) => {
  it('admin-only, after a password confirmation; audited; shows the banner flag; one-click leave', async () => {
    const { h, admin, member, browser } = await setup(store)
    await rejectsWith(() => h.auth.impersonation.start(browser.req, { userId: member.id }), 'PASSWORD_CONFIRMATION_REQUIRED')
    await h.auth.passwords.confirm(browser.req, { password: PASSWORD })
    const adminCookie = browser.get('sv_session')
    await h.auth.impersonation.start(browser.req, { userId: member.id })
    expect(browser.get('sv_session')).not.toBe(adminCookie)
    const state = await h.auth.state(browser.req)
    expect(state?.user.id).toBe(member.id)
    expect(state?.impersonator).toEqual({ id: admin.id, name: 'root', email: admin.email })
    expect(h.eventsOf('impersonation.started')).toEqual([expect.objectContaining({ adminId: admin.id, userId: member.id })])
    await h.auth.impersonation.stop(browser.req)
    const back = await h.auth.state(browser.req)
    expect(back?.user.id).toBe(admin.id)
    expect(back?.impersonator).toBeNull()
    expect(back?.session.passwordConfirmedAt).toBeNull() // must confirm again
    expect(h.eventsOf('impersonation.stopped')).toEqual([expect.objectContaining({ adminId: admin.id, userId: member.id })])
  })

  it('attack: impersonating another admin, yourself, or a missing user is refused', async () => {
    const { h, admin, otherAdmin, browser } = await setup(store)
    await h.auth.passwords.confirm(browser.req, { password: PASSWORD })
    await rejectsWith(() => h.auth.impersonation.start(browser.req, { userId: otherAdmin.id }), 'FORBIDDEN')
    await rejectsWith(() => h.auth.impersonation.start(browser.req, { userId: admin.id }), 'FORBIDDEN')
    await rejectsWith(() => h.auth.impersonation.start(browser.req, { userId: '00000000-0000-4000-8000-000000000000' }), 'NOT_FOUND')
    await rejectsWith(() => h.auth.impersonation.start(browser.req, { userId: { id: otherAdmin.id } }), 'NOT_FOUND')
    expect(h.eventsOf('impersonation.started')).toHaveLength(0)
  })

  it('attack: a non-admin cannot impersonate; nesting is refused', async () => {
    const { h, member, browser } = await setup(store)
    await h.user('eve@acme.test')
    const vic = await h.signedIn(member.email)
    await h.auth.passwords.confirm(vic.req, { password: PASSWORD })
    const eveId = (await h.store.findUserByEmail('eve@acme.test'))?.id
    await rejectsWith(() => h.auth.impersonation.start(vic.req, { userId: eveId }), 'FORBIDDEN')
    await h.auth.passwords.confirm(browser.req, { password: PASSWORD })
    await h.auth.impersonation.start(browser.req, { userId: member.id })
    await rejectsWith(() => h.auth.impersonation.start(browser.req, { userId: eveId }), 'FORBIDDEN')
  })

  it('while impersonating, the user\'s credentials, factors, tokens and sessions are off-limits', async () => {
    const { h, member, browser } = await setup(store)
    await h.auth.passwords.confirm(browser.req, { password: PASSWORD })
    await h.auth.impersonation.start(browser.req, { userId: member.id })
    await rejectsWith(() => h.auth.passwords.change(browser.req, { current: PASSWORD, password: 'admin picks this one' }), 'FORBIDDEN')
    await rejectsWith(() => h.auth.passwords.confirm(browser.req, { password: PASSWORD }), 'FORBIDDEN')
    await rejectsWith(() => h.auth.tokens.create(browser.req, { name: 'backdoor' }), 'FORBIDDEN')
    await rejectsWith(() => h.auth.twoFactor.enable(browser.req), 'FORBIDDEN')
    await rejectsWith(() => h.auth.sessions.revokeOthers(browser.req), 'FORBIDDEN')
    expect(await h.store.listTokens(member.id)).toHaveLength(0)
  })

  it('attack: an impersonating admin cannot grant team access that outlives the impersonation', async () => {
    const h = harness({ store, config: { features: { impersonation: true, teams: true } } })
    const admin = await h.user('root@acme.test', { roles: ['admin'] })
    const vic = await h.user('vic@acme.test')
    const colleague = await h.user('col@acme.test')
    const vicBrowser = await h.signedIn(vic.email)
    const team = await h.auth.teams.current(vicBrowser.req)
    const teamId = team?.id ?? ''
    await h.auth.teams.invite(vicBrowser.req, { teamId, email: colleague.email, role: 'member' })
    await h.auth.teams.accept((await h.signedIn(colleague.email)).req, { token: await h.mailedToken('team-invitation', colleague.email) })
    await h.auth.teams.invite(vicBrowser.req, { teamId, email: 'later@acme.test', role: 'member' })
    const pendingToken = await h.mailedToken('team-invitation', 'later@acme.test')

    const browser = await h.signedIn(admin.email)
    await h.auth.passwords.confirm(browser.req, { password: PASSWORD })
    await h.auth.impersonation.start(browser.req, { userId: vic.id })
    // Inviting yourself (or anyone), promoting a member, or accepting for the user would all
    // survive "leave impersonation".
    await rejectsWith(() => h.auth.teams.invite(browser.req, { teamId, email: admin.email, role: 'admin' }), 'FORBIDDEN')
    await rejectsWith(() => h.auth.teams.changeRole(browser.req, { teamId, userId: colleague.id, role: 'admin' }), 'FORBIDDEN')
    await rejectsWith(() => h.auth.teams.accept(browser.req, { token: pendingToken }), 'FORBIDDEN')
    expect((await h.store.listInvitations(teamId)).map((i) => i.email)).toEqual(['later@acme.test'])
    expect((await h.store.findMember(teamId, colleague.id))?.role).toBe('member')
    // Reading is still fine: support can look.
    expect(await h.auth.teams.members(browser.req, { teamId })).toHaveLength(2)
  })

  it('the impersonation session expires after one hour', async () => {
    const { h, member, browser } = await setup(store)
    await h.auth.passwords.confirm(browser.req, { password: PASSWORD })
    await h.auth.impersonation.start(browser.req, { userId: member.id })
    for (let i = 0; i < 2; i++) {
      h.clock.advance(30 * 60_000)
      await h.auth.state(browser.req)
    }
    expect(await h.auth.state(browser.req)).toBeNull()
  })

  it('attack: an impersonation ends at once when the admin loses the role or the target becomes an admin', async () => {
    for (const revoke of ['demote', 'promote-target'] as const) {
      const { h, admin, member, browser } = await setup(store)
      await h.auth.passwords.confirm(browser.req, { password: PASSWORD })
      await h.auth.impersonation.start(browser.req, { userId: member.id })
      expect((await h.auth.state(browser.req))?.user.id).toBe(member.id)
      if (revoke === 'demote') await h.store.setUserRoles(admin.id, [])
      if (revoke === 'promote-target') await h.store.setUserRoles(member.id, ['admin'])
      expect(await h.auth.state(browser.req)).toBeNull()
      // The session row is gone, not just hidden: a replayed cookie gets nothing either.
      expect((await h.store.listUserSessions(member.id)).filter((s) => s.impersonatorId !== null)).toHaveLength(0)
    }
  })

  it('attack: turning the feature off ends impersonation sessions already running', async () => {
    const { h, member, browser } = await setup(store)
    await h.auth.passwords.confirm(browser.req, { password: PASSWORD })
    await h.auth.impersonation.start(browser.req, { userId: member.id })
    const off = harness({ store, config: { features: { tokens: true, twoFactor: true } } })
    // Same store and keys, feature switched off at the next boot.
    const rebooted = await import('../src/auth.ts').then(({ createAuth }) => createAuth({
      config: off.auth.config, store: h.store, counters: h.counters, clock: h.clock, appKey: APP_KEY,
      mailer: { send: async () => undefined }, events: { emit: () => undefined },
    }))
    expect(await rebooted.state(browser.req)).toBeNull()
    expect(await rebooted.passwords.change(browser.req, { current: PASSWORD, password: 'admin picks this one' }).catch((e: { code?: string }) => e.code)).toBe('UNAUTHENTICATED')
  })

  it('feature off: start and stop are NOT_FOUND even for admins', async () => {
    const h = harness({ store })
    const admin = await h.user('root@acme.test', { roles: ['admin'] })
    const b = await h.signedIn(admin.email)
    await rejectsWith(() => h.auth.impersonation.start(b.req, { userId: admin.id }), 'NOT_FOUND')
    await rejectsWith(() => h.auth.impersonation.stop(b.req), 'NOT_FOUND')
  })
})
